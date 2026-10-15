-- Phase 6 T10 (spec-interview/phase-6-meeting-notes; FR-012, FR-013, BR-010,
-- BR-011, FR-007; AC-005 attach part, AC-010 intake part, AC-011, AC-024):
-- transcript intake. Depends on 20261013103447 (transcript / transcript_id
-- columns and their identity check), 20261013105021 + 20261013124610
-- (public.create_meeting_note, private.meeting_note_insert_version), and
-- 20261013110632 (private.meeting_note_authorize over
-- private.meeting_note_lock_for_change).
--
-- Before this migration: nothing writes public.meeting_notes.transcript; no
-- client path stores or replaces a transcript.
--
-- After this migration, two RPCs, each SECURITY DEFINER, owner postgres,
-- search_path '', EXECUTE granted to authenticated only (REVOKE ALL from
-- PUBLIC, anon, authenticated, service_role first). The caller is resolved
-- from auth.uid() -> users.supabase_uid, exactly as in the T17 RPCs:
--   * public.create_meeting_note_from_transcript(p_room_id uuid,
--       p_title text, p_transcript text)
--       -> jsonb {note_id, revision: 1, version_id, transcript_id}
--     "New note from transcript" (FR-012): any member of the space's company.
--     In ONE transaction it runs public.create_meeting_note (same rules, same
--     lock order users -> company -> space, same title validation) with
--     meeting date = now() (the upload instant: "today"), content '' and no
--     participants, then stores the transcript with a fresh transcript_id on
--     the row it just inserted (still revision 1, version 1). Any failure
--     leaves nothing behind.
--   * public.attach_meeting_note_transcript(p_note_id uuid,
--       p_expected_revision bigint, p_transcript text)
--       -> jsonb {note_id, revision, version_id, transcript_id}
--     "Attach transcript" (FR-012, BR-010): an editor (author, current
--     participant, or company admin, each while a member; BR-003 rights on the
--     pre-change state) replaces the stored transcript at the current revision
--     (BR-011): transcript and a NEW transcript_id, revision + 1, edited_by =
--     caller. Title, date, participants, content, summary, and action items
--     are untouched.
--     Version on attach: YES, one version for the new revision, whose fields
--     equal the previous version's (versions do not carry the transcript).
--     FR-008 requires versions for the listed fields and does not forbid one
--     here; inserting it keeps the invariant "every note revision has exactly
--     one version" that the history view relies on (its "Current" badge and
--     restore gating compare version.revision with note.revision) and records
--     who replaced the transcript and when. T1's guards hold: the revision only
--     increases and (note_id, revision) stays unique. Restore is unaffected: it
--     applies a version's fields and never touches transcript/transcript_id.
--     The new transcript_id + revision make any pending AI ticket/draft bound
--     to the old source stale (T9 admission SOURCE_STALE, T12 Apply conflict).
--
-- Transcript rule (both RPCs and, for every role, a table CHECK): not NULL,
-- not blank (only spaces, tabs, CR, LF, FF, VT), at most 1,048,576 bytes of
-- UTF-8 (FR-013: <= 1 MB). Postgres text cannot hold NUL. The route does the
-- full file validation (extension, empty, size, UTF-8, binary signatures)
-- BEFORE calling these RPCs; the database is the last line for direct calls.
--
-- Lock order (PLAN lock order rule): create = caller users FOR KEY SHARE ->
-- company FOR KEY SHARE -> space FOR KEY SHARE (inside create_meeting_note),
-- then only the row this transaction inserted. Attach = caller users FOR KEY
-- SHARE -> note FOR UPDATE (private.meeting_note_authorize) -> version insert
-- (its FK checks take KEY SHARE on rows already locked). No company, settings,
-- space, or item lock; a subset of the global order, so no new cycle.
--
-- Errors (message token, SQLSTATE), besides those of create_meeting_note and
-- meeting_note_authorize (MEETING_NOTE_NOT_FOUND P0002, MEETING_NOTE_FORBIDDEN
-- 42501, MEETING_NOTE_STALE_REVISION P0001 with DETAIL {"current_revision": N},
-- MEETING_NOTE_SPACE_NOT_FOUND P0002, MEETING_NOTE_TITLE_INVALID 22023,
-- MEETING_NOTE_REVISION_REQUIRED 22023):
--   MEETING_NOTE_TRANSCRIPT_EMPTY (22023): NULL or blank transcript.
--   MEETING_NOTE_TRANSCRIPT_TOO_LARGE (22023): more than 1,048,576 bytes.
--   The transcript is validated first, so an invalid one never takes a lock.
--
-- Table CHECK meeting_notes_transcript_size_check (NOT VALID, so a legacy row
-- — SPEC §9 preflight — does not block the migration; it applies to every new
-- or changed row, for every role): transcript IS NULL, or non-blank and
-- 1..1,048,576 bytes. Postgres re-checks it on ANY update of a row, so a
-- legacy row with a blank or > 1 MB transcript would refuse every later edit
-- (23514 -> 500): the T15 preflight must count such rows on the target
-- (expected 0: no runtime path ever wrote transcripts) before applying.
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- call these RPCs, THEN run this SQL; no data is lost — transcripts already
-- stored stay on their notes):
--   begin;
--   set local lock_timeout = '5s';
--   drop function if exists public.attach_meeting_note_transcript(uuid, bigint, text);
--   drop function if exists public.create_meeting_note_from_transcript(uuid, text, text);
--   drop function if exists private.meeting_note_validate_transcript(text);
--   alter table public.meeting_notes drop constraint if exists meeting_notes_transcript_size_check;
--   commit;

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Transcript limits for every role
-- ---------------------------------------------------------------------------

alter table public.meeting_notes
  drop constraint if exists meeting_notes_transcript_size_check,
  add constraint meeting_notes_transcript_size_check
    check (transcript is null
           or (pg_catalog.octet_length(transcript) between 1 and 1048576
               and pg_catalog.btrim(transcript, E' \t\r\n\f' || pg_catalog.chr(11)) <> ''))
    not valid;

-- ---------------------------------------------------------------------------
-- Internal helper (no EXECUTE for any client or server role)
-- ---------------------------------------------------------------------------

create or replace function private.meeting_note_validate_transcript(p_transcript text)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_transcript is null
     or pg_catalog.btrim(p_transcript, E' \t\r\n\f' || pg_catalog.chr(11)) = '' then
    raise exception 'MEETING_NOTE_TRANSCRIPT_EMPTY' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_transcript) > 1048576 then
    raise exception 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (authenticated only)
-- ---------------------------------------------------------------------------

create or replace function public.create_meeting_note_from_transcript(
  p_room_id uuid,
  p_title text,
  p_transcript text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_created jsonb;
  v_note_id uuid;
  v_transcript_id uuid;
begin
  perform private.meeting_note_validate_transcript(p_transcript);

  -- Same caller resolution, rights, lock order, limits, and version 1 as a
  -- manual note; the transcript lands on the row in this same transaction.
  v_created := public.create_meeting_note(p_room_id, p_title, pg_catalog.now(), '', '{}'::uuid[]);
  v_note_id := (v_created ->> 'note_id')::uuid;

  update public.meeting_notes as n
  set transcript = p_transcript,
      transcript_id = pg_catalog.gen_random_uuid()
  where n.id = v_note_id
  returning n.transcript_id into v_transcript_id;

  if v_transcript_id is null then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_created || pg_catalog.jsonb_build_object('transcript_id', v_transcript_id);
end;
$$;

create or replace function public.attach_meeting_note_transcript(
  p_note_id uuid,
  p_expected_revision bigint,
  p_transcript text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_revision bigint;
  v_transcript_id uuid;
  v_version_id uuid;
begin
  perform private.meeting_note_validate_transcript(p_transcript);
  select * into v_auth from private.meeting_note_authorize(p_note_id, p_expected_revision, 'edit');

  update public.meeting_notes as n
  set transcript = p_transcript,
      transcript_id = pg_catalog.gen_random_uuid(),
      revision = n.revision + 1,
      edited_by = v_auth.caller_id,
      updated_at = pg_catalog.now()
  where n.id = p_note_id
  returning n.revision, n.transcript_id into v_revision, v_transcript_id;

  v_version_id := private.meeting_note_insert_version(p_note_id, v_auth.caller_id, v_auth.caller_name);

  return pg_catalog.jsonb_build_object(
    'note_id', p_note_id,
    'revision', v_revision,
    'version_id', v_version_id,
    'transcript_id', v_transcript_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership, comments, and EXECUTE privileges
-- ---------------------------------------------------------------------------

alter function private.meeting_note_validate_transcript(text) owner to postgres;
alter function public.create_meeting_note_from_transcript(uuid, text, text) owner to postgres;
alter function public.attach_meeting_note_transcript(uuid, bigint, text) owner to postgres;

revoke all on function private.meeting_note_validate_transcript(text) from public, anon, authenticated, service_role;
revoke all on function public.create_meeting_note_from_transcript(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.attach_meeting_note_transcript(uuid, bigint, text) from public, anon, authenticated, service_role;

grant execute on function public.create_meeting_note_from_transcript(uuid, text, text) to authenticated;
grant execute on function public.attach_meeting_note_transcript(uuid, bigint, text) to authenticated;

comment on function public.create_meeting_note_from_transcript(uuid, text, text) is
  'Phase 6 T10 (FR-012, FR-013): a member of the space''s company creates a note from a transcript in one transaction: create_meeting_note rules with meeting date = now(), empty content, no participants, version 1, and the transcript (non-blank, <= 1,048,576 bytes) with a new transcript_id. Authenticated only.';
comment on function public.attach_meeting_note_transcript(uuid, bigint, text) is
  'Phase 6 T10 (FR-012, BR-010, BR-011): an editor replaces the stored transcript (non-blank, <= 1,048,576 bytes) at the current revision: new transcript_id, revision + 1, one version with unchanged fields; title, date, participants, content, summary, and items untouched. Authenticated only.';

commit;
