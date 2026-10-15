-- Phase 6 T12: Apply of an AI draft (spec-interview/phase-6-meeting-notes;
-- SPEC FR-007, FR-008, FR-011, FR-018, FR-019, BR-006, BR-007; AC-010,
-- AC-027, AC-030, AC-032). Depends on 20261013105021 (versions helper),
-- 20261013110632 (item contract, capacity trigger, assignee resolver,
-- description validator), 20261013114402 (unaccent in schema `extensions`),
-- and 20261013154823 (private.meeting_note_lock_for_change delegating to the
-- shared rights helper).
--
-- Objects:
--   * private.meeting_note_ai_normalize_description(text) — the comparison
--     key of an action-item description for "already exists" (FR-018):
--     trimmed, inner whitespace collapsed to one space, accents removed
--     (extensions.unaccent), lower-cased. STABLE; no EXECUTE for any role.
--     The start route marks draft suggestions with the equivalent TypeScript
--     rule (src/lib/meeting-notes/ai/draft-review.ts); this function marks
--     the accepted items Apply reports back.
--   * public.apply_meeting_note_ai_draft(p_note_id uuid,
--     p_expected_revision bigint, p_summary text, p_items jsonb)
--     RETURNS jsonb — SECURITY DEFINER, owner postgres, search_path '',
--     EXECUTE for authenticated only (the caller is resolved from auth.uid()
--     → users.supabase_uid; nothing else can call it). ONE transaction
--     (READ COMMITTED), all or nothing:
--       0. argument validation before any lock: p_expected_revision required
--          (MEETING_NOTE_REVISION_REQUIRED); p_summary NULL (no summary) or
--          non-blank text of at most 100,000 characters
--          (MEETING_NOTE_SUMMARY_INVALID); p_items a JSON array of at most
--          100 objects {description, assignee_id (uuid or null), due_date
--          ('YYYY-MM-DD' or null)} (MEETING_NOTE_AI_APPLY_ITEMS_INVALID),
--          each description 1–1,000 characters and not blank
--          (MEETING_NOTE_ITEM_DESCRIPTION_INVALID); a summary or at least one
--          item is required (MEETING_NOTE_AI_APPLY_EMPTY). Duplicates are
--          compared with EXISTING items only, not among the accepted ones.
--       1. locks per the PLAN lock order rule through the shared helper
--          private.meeting_note_lock_for_change: the caller's users row FOR
--          KEY SHARE, then (current members of the note's company only) the
--          note row FOR UPDATE — the single per-note lock that manual item
--          insertion (capacity trigger), note mutations, attach, restore,
--          delete, and admission also take. No settings row, no item row
--          lock (items are only inserted).
--       2. rights on the locked pre-change state: editor (author while a
--          member, current participant, or company admin) else
--          MEETING_NOTE_FORBIDDEN; the note's revision must equal
--          p_expected_revision — the draft's source revision — else
--          MEETING_NOTE_STALE_REVISION {current_revision} (covers a
--          transcript replaced or the note edited while the draft was
--          generated, FR-018, AC-030).
--       3. each assignee must be a current member of the note's company
--          (MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER); the snapshot name is
--          taken now.
--       4. accepted items are appended in the given order (created_at =
--          clock_timestamp() per row so the list keeps that order), creator
--          = caller (id + name snapshot), revision 1, not completed. The
--          capacity trigger (100 per note, under the note lock already held)
--          raises MEETING_NOTE_ITEM_LIMIT_REACHED and the whole Apply rolls
--          back. Existing items are never read for update, modified, or
--          removed (completion included).
--       5. summary := p_summary and generated_by := 'ai' when p_summary is
--          not NULL (a NULL summary keeps the current summary and generator:
--          an items-only Apply never erases a summary); revision + 1,
--          edited_by := caller; one immutable version of the new state
--          (private.meeting_note_insert_version).
--     Duplicates (FR-018/FR-019): suggestions matching an existing item
--     arrive unchecked in the UI; an item the user explicitly accepts anyway
--     is appended (the user's decision) and its index is reported in
--     `duplicate_indexes` (0-based positions in p_items whose normalized
--     description equals an existing item's, read under the note lock).
--     Returns {note_id, revision, version_id, item_ids[], duplicate_indexes[]}.
--
-- Error tokens (message = token; SQLSTATE; DETAIL JSON where listed):
--   22023 MEETING_NOTE_REVISION_REQUIRED
--   22023 MEETING_NOTE_SUMMARY_INVALID
--   22023 MEETING_NOTE_AI_APPLY_ITEMS_INVALID
--   22023 MEETING_NOTE_AI_APPLY_EMPTY
--   22023 MEETING_NOTE_ITEM_DESCRIPTION_INVALID
--   22023 MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER
--   22023 MEETING_NOTE_ITEM_LIMIT_REACHED {"limit": 100}
--   P0002 MEETING_NOTE_NOT_FOUND (missing, other company, caller removed)
--   42501 MEETING_NOTE_FORBIDDEN
--   P0001 MEETING_NOTE_STALE_REVISION {"current_revision": n}
--
-- Rollback (order: FIRST roll the application back to a build without the
-- Apply route, THEN run this SQL). No data is lost: applied summaries, items,
-- and versions stay.
--   begin;
--   drop function if exists public.apply_meeting_note_ai_draft(uuid, bigint, text, jsonb);
--   drop function if exists private.meeting_note_ai_normalize_description(text);
--   commit;

create or replace function private.meeting_note_ai_normalize_description(p_description text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.lower(
           extensions.unaccent(
             'extensions.unaccent'::regdictionary,
             pg_catalog.regexp_replace(pg_catalog.btrim(p_description, E' \t\r\n'), '\s+', ' ', 'g')
           )
         );
$$;

alter function private.meeting_note_ai_normalize_description(text) owner to postgres;
revoke all on function private.meeting_note_ai_normalize_description(text) from public, anon, authenticated, service_role;

create or replace function public.apply_meeting_note_ai_draft(
  p_note_id uuid,
  p_expected_revision bigint,
  p_summary text,
  p_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_items jsonb := '[]'::jsonb;
  v_element jsonb;
  v_description text;
  v_assignee_id uuid;
  v_due_date date;
  v_assignee_name text;
  v_existing text[];
  v_item_ids uuid[] := '{}';
  v_duplicates integer[] := '{}';
  v_item_id uuid;
  v_index integer := 0;
  v_revision bigint;
  v_version_id uuid;
begin
  -- 0. Arguments (no lock is taken before they are valid).
  if p_expected_revision is null then
    raise exception 'MEETING_NOTE_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_summary is not null
     and (pg_catalog.btrim(p_summary, E' \t\r\n') = ''
          or pg_catalog.char_length(p_summary) > 100000) then
    raise exception 'MEETING_NOTE_SUMMARY_INVALID' using errcode = '22023';
  end if;
  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' using errcode = '22023';
  end if;

  for v_element in select e.value from pg_catalog.jsonb_array_elements(p_items) as e(value)
  loop
    if pg_catalog.jsonb_typeof(v_element) <> 'object'
       or pg_catalog.jsonb_typeof(v_element -> 'description') is distinct from 'string'
       or coalesce(pg_catalog.jsonb_typeof(v_element -> 'assignee_id'), 'null') not in ('null', 'string')
       or coalesce(pg_catalog.jsonb_typeof(v_element -> 'due_date'), 'null') not in ('null', 'string')
       or exists (
         select 1
         from pg_catalog.jsonb_object_keys(v_element) as k(key)
         where k.key not in ('description', 'assignee_id', 'due_date')
       ) then
      raise exception 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' using errcode = '22023';
    end if;

    v_description := v_element ->> 'description';
    perform private.meeting_note_item_validate_description(v_description);

    begin
      v_assignee_id := (v_element ->> 'assignee_id')::uuid;
      v_due_date := null;
      if v_element ->> 'due_date' is not null then
        if (v_element ->> 'due_date') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' using errcode = '22023';
        end if;
        v_due_date := (v_element ->> 'due_date')::date;
      end if;
    exception
      when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
        raise exception 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' using errcode = '22023';
    end;

    v_items := v_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('description', v_description, 'assignee_id', v_assignee_id, 'due_date', v_due_date)
    );
  end loop;

  if p_summary is null and pg_catalog.jsonb_array_length(v_items) = 0 then
    raise exception 'MEETING_NOTE_AI_APPLY_EMPTY' using errcode = '22023';
  end if;

  -- 1–2. Caller (KEY SHARE) → note (FOR UPDATE); rights and source revision
  -- on the locked pre-change state.
  select * into v_lock from private.meeting_note_lock_for_change(p_note_id, 'MEETING_NOTE_NOT_FOUND');
  if v_lock.can_edit is not true then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_lock.note_revision <> p_expected_revision then
    raise exception 'MEETING_NOTE_STALE_REVISION'
      using errcode = 'P0001',
            detail = pg_catalog.format('{"current_revision": %s}', v_lock.note_revision);
  end if;

  -- Existing descriptions, read under the note lock (no item insert can
  -- interleave: every insertion path takes the same note lock).
  select coalesce(pg_catalog.array_agg(private.meeting_note_ai_normalize_description(i.description)), '{}')
  into v_existing
  from public.meeting_note_action_items as i
  where i.note_id = p_note_id;

  -- 3–4. Append the accepted items in order.
  for v_element in select e.value from pg_catalog.jsonb_array_elements(v_items) as e(value)
  loop
    v_assignee_id := (v_element ->> 'assignee_id')::uuid;
    v_assignee_name := private.meeting_note_item_resolve_assignee(v_lock.note_company_id, v_assignee_id);
    v_description := v_element ->> 'description';

    if private.meeting_note_ai_normalize_description(v_description) = any (v_existing) then
      v_duplicates := v_duplicates || v_index;
    end if;

    insert into public.meeting_note_action_items
      (note_id, description, assignee_id, assignee_name, due_date, completed,
       creator_user_id, creator_name, revision, created_at, updated_at)
    values
      (p_note_id, v_description, v_assignee_id, v_assignee_name, (v_element ->> 'due_date')::date, false,
       v_lock.caller_id, v_lock.caller_name, 1, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
    returning id into v_item_id;

    v_item_ids := v_item_ids || v_item_id;
    v_index := v_index + 1;
  end loop;

  -- 5. Summary, revision, one version.
  -- A NULL summary (all sections left empty) keeps the current summary and
  -- its generator: an items-only Apply never erases a summary.
  update public.meeting_notes as n
  set summary = coalesce(p_summary, n.summary),
      generated_by = case when p_summary is null then n.generated_by else 'ai'::public.note_generator end,
      revision = n.revision + 1,
      edited_by = v_lock.caller_id,
      updated_at = pg_catalog.now()
  where n.id = p_note_id
  returning n.revision into v_revision;

  v_version_id := private.meeting_note_insert_version(p_note_id, v_lock.caller_id, v_lock.caller_name);

  return pg_catalog.jsonb_build_object(
    'note_id', p_note_id,
    'revision', v_revision,
    'version_id', v_version_id,
    'item_ids', pg_catalog.to_jsonb(v_item_ids),
    'duplicate_indexes', pg_catalog.to_jsonb(v_duplicates)
  );
end;
$$;

alter function public.apply_meeting_note_ai_draft(uuid, bigint, text, jsonb) owner to postgres;
revoke all on function public.apply_meeting_note_ai_draft(uuid, bigint, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_meeting_note_ai_draft(uuid, bigint, text, jsonb) to authenticated;

comment on function public.apply_meeting_note_ai_draft(uuid, bigint, text, jsonb) is
  'Phase 6 T12: an editor applies an AI draft at its source revision — summary, appended accepted items (capacity 100), one version — in one transaction under the caller → note lock order; all or nothing.';
