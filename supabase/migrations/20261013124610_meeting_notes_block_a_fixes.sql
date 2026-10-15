-- Phase 6 block A review fixes (spec-interview/phase-6-meeting-notes;
-- reviews/sol-review-blockA-r1.md findings A-1, A-2, A-3, A-4). Forward
-- migration on top of T1 20261013103447, T17 20261013105021, T2
-- 20261013110632, and T4 20261013114402; it redefines the affected objects
-- only.
--
-- Before this migration:
--   * public.create_meeting_note locked the caller's users row, then the space
--     FOR KEY SHARE, and only then (through the meeting_notes.company_id FK
--     check of its INSERT) the company row FOR KEY SHARE. The member-removal,
--     role-change, and invitation-acceptance RPCs lock users -> company FOR
--     UPDATE -> the target's occupied space FOR UPDATE, so a creation in a
--     space occupied by someone an admin was removing could deadlock (40P01).
--   * Titles: private.meeting_note_validate_fields and the
--     meeting_notes/meeting_note_versions title CHECKs used btrim(title),
--     which strips spaces only: a title of tabs/line breaks passed a direct
--     authenticated RPC call.
--   * Search documents concatenated the Portuguese and English tsvectors
--     (positions of the second shifted after the first), and queries OR-ed a
--     Portuguese and an English websearch tsquery. A phrase could match across
--     the two copies ('"review budget"' matched "Budget review"), and an
--     exclusion applied in one language only ('budget -meeting' matched
--     "budget meetings" through the Portuguese reading, where "meetings" does
--     not stem to "meeting").
--   * Excerpts always used the Portuguese configuration in ts_headline; a
--     match found only through English stemming ("meeting" ~ "meetings")
--     returned the document's opening words without a highlight.
--
-- After this migration:
--   * create_meeting_note lock order: caller users FOR KEY SHARE -> company
--     row FOR KEY SHARE -> space FOR KEY SHARE -> note insert (whose company
--     FK check then finds the lock already held). Company before space is the
--     order of every product RPC that locks both (users -> company -> space),
--     so no cycle remains. Other meeting-note functions were rechecked: the
--     update/restore/delete and item RPCs lock users -> note FOR UPDATE ->
--     items and never lock a company or space (their FK checks only touch the
--     caller's users row and the note, already locked); the capacity trigger
--     locks the note only; search takes no row locks. Unchanged.
--   * Blank title = empty after removing spaces, tabs, carriage returns, and
--     line feeds (btrim(title, E' \t\r\n'), the predicate T2 uses for item
--     descriptions) in private.meeting_note_validate_fields and in both
--     title CHECKs (meeting_notes: NOT VALID, as before; versions: validated).
--   * Search documents keep original token positions: a new pure helper
--     private.meeting_note_search_tsvector(texts text[], weights text[])
--     parses each text with both configurations and merges the two lexeme
--     sets AT THE SAME POSITIONS (both use the default parser, so position N
--     is the same word in both); consecutive texts are separated by a gap of
--     128 positions, so a phrase never spans two fields. The note document
--     is title (A), summary (B), content text (C); an item document is its
--     description (D). The note's generated search_vector is re-created
--     (same name, type, and GIN index) and the item expression index is
--     rebuilt, so every stored entry uses the new layout.
--   * Queries: private.meeting_note_search_query parses the text with each
--     configuration's websearch_to_tsquery (each keeps its own phrase
--     distances and stop words) and replaces every lexeme with the
--     alternation of all variants of the words that produced it (the
--     Portuguese and English lexemes at the same query positions), then ORs
--     the two readings (one copy when both are equal). A word, phrase word, or -exclusion therefore matches
--     any language variant at one position: '"review budget"' needs "review"
--     immediately followed by "budget"; 'budget -meeting' rejects a document
--     with "meetings" because the exclusion includes the English variant.
--     Known limit: a word that is a stop word in only one language is
--     dropped from that language's reading (as before).
--   * Excerpts: private.meeting_note_search_headline(source, query) (it
--     owns the T4 headline options: U+E000/U+E001 markers, <= 2 fragments of
--     <= 30 words joined by " … ") returns the Portuguese ts_headline when it highlights a match,
--     otherwise the English one, otherwise (words matched under different
--     languages) a headline of any positive query word in Portuguese, then
--     English; only when none highlights does it return the Portuguese
--     headline without a highlight. Private-use markers are removed from the
--     source first (unchanged contract: U+E000/U+E001 delimit highlights).
--   * public.search_meeting_notes: same signature, result, filters, order,
--     and privileges; excerpts come from the helper above, and each matching
--     item's rank is computed once.
--   * Privileges (function privilege rule): every redefined or new function
--     is owned by postgres with search_path ''. EXECUTE is revoked from
--     PUBLIC, anon, authenticated, and service_role, then granted:
--     private.meeting_note_search_tsvector -> service_role (Postgres checks
--     EXECUTE for the writing role on generated-column and index-expression
--     functions, like the other T4 document helpers);
--     private.meeting_note_search_headline -> nobody (only the definer RPC
--     calls it); create_meeting_note and search_meeting_notes -> authenticated
--     (unchanged). CREATE OR REPLACE keeps the existing ACLs of
--     validate_fields, the document helpers, and the query helper; they are
--     re-stated below.
--   * No revision bump or version comes from search upkeep: search_vector is
--     still a generated column (recomputed in the row's own write) and items
--     still never write the note. The T1/T2 guards are untouched.
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- call /api/meeting-notes/search, THEN run this SQL; no note or item data is
-- lost):
--   begin;
--   set local lock_timeout = '5s';
--   lock table public.meeting_notes, public.meeting_note_versions, public.meeting_note_action_items in access exclusive mode;
--   drop index if exists public.idx_meeting_note_action_items_search;
--   alter table public.meeting_notes drop column if exists search_vector;
--   -- Re-run, verbatim from 20261013114402_meeting_notes_search.sql: the
--   -- "create or replace function" statements of
--   -- private.meeting_note_search_document, private.meeting_note_item_search_document,
--   -- private.meeting_note_search_query, and public.search_meeting_notes;
--   -- then its "alter table public.meeting_notes add column search_vector ...",
--   -- its comment on that column, and both "create index" statements.
--   drop function if exists private.meeting_note_search_headline(text, tsquery);
--   drop function if exists private.meeting_note_search_tsvector(text[], text[]);
--   -- Re-run, verbatim from 20261013105021_meeting_notes_mutation_rpcs.sql:
--   -- the two "alter table ... title_length_check" statements and the
--   -- "create or replace function" statements of
--   -- private.meeting_note_validate_fields and public.create_meeting_note.
--   commit;

begin;

set local lock_timeout = '5s';

lock table public.meeting_notes, public.meeting_note_versions, public.meeting_note_action_items
  in access exclusive mode;

-- ---------------------------------------------------------------------------
-- A-4: blank titles (spaces, tabs, line breaks) for every role
-- ---------------------------------------------------------------------------

alter table public.meeting_notes
  drop constraint if exists meeting_notes_title_length_check,
  add constraint meeting_notes_title_length_check
    check (pg_catalog.char_length(title) between 1 and 200
           and pg_catalog.btrim(title, E' \t\r\n') <> '')
    not valid;

alter table public.meeting_note_versions
  drop constraint if exists meeting_note_versions_title_length_check,
  add constraint meeting_note_versions_title_length_check
    check (pg_catalog.char_length(title) between 1 and 200
           and pg_catalog.btrim(title, E' \t\r\n') <> '');

create or replace function private.meeting_note_validate_fields(
  p_title text,
  p_meeting_date timestamptz,
  p_content text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_title is null
     or pg_catalog.btrim(p_title, E' \t\r\n') = ''
     or pg_catalog.char_length(p_title) > 200 then
    raise exception 'MEETING_NOTE_TITLE_INVALID' using errcode = '22023';
  end if;
  if p_meeting_date is null then
    raise exception 'MEETING_NOTE_DATE_REQUIRED' using errcode = '22023';
  end if;
  if p_content is null then
    raise exception 'MEETING_NOTE_CONTENT_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.char_length(p_content) > 100000 then
    raise exception 'MEETING_NOTE_CONTENT_TOO_LONG' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A-1: creation locks the company before the space
-- ---------------------------------------------------------------------------

create or replace function public.create_meeting_note(
  p_room_id uuid,
  p_title text,
  p_meeting_date timestamptz,
  p_content text,
  p_participant_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller record;
  v_note_id uuid;
  v_version_id uuid;
begin
  perform private.meeting_note_validate_fields(p_title, p_meeting_date, p_content);

  select * into v_caller from private.meeting_note_lock_caller();
  if v_caller.caller_id is null or v_caller.caller_company_id is null then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Company before space (the order of the member-removal, role-change, and
  -- invitation RPCs: users -> company -> occupied space). FOR KEY SHARE is
  -- the lock the note's company_id FK check takes anyway; taking it here,
  -- before the space, keeps a removal that holds the company and waits for
  -- this space from closing a cycle with this insert.
  perform 1
  from public.companies as c
  where c.id = v_caller.caller_company_id
  for key share;
  if not found then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- FOR KEY SHARE: a concurrent space deletion waits for this note instead of
  -- turning the insert into a raw FK error.
  perform 1
  from public.spaces as s
  where s.id = p_room_id
    and s.company_id = v_caller.caller_company_id
  for key share;
  if p_room_id is null or not found then
    raise exception 'MEETING_NOTE_SPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.meeting_notes
    (company_id, room_id, title, meeting_date, content, summary, generated_by,
     author_user_id, author_name, created_by, edited_by, revision)
  values
    (v_caller.caller_company_id, p_room_id, p_title, p_meeting_date,
     p_content, null, 'user'::public.note_generator,
     v_caller.caller_id, v_caller.caller_name, v_caller.caller_id, v_caller.caller_id, 1)
  returning id into v_note_id;

  perform private.meeting_note_replace_participants(v_note_id, v_caller.caller_company_id, p_participant_ids);
  v_version_id := private.meeting_note_insert_version(v_note_id, v_caller.caller_id, v_caller.caller_name);

  return pg_catalog.jsonb_build_object('note_id', v_note_id, 'revision', 1, 'version_id', v_version_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- A-2: search documents with original positions
-- ---------------------------------------------------------------------------

-- The stored vector and the item index are rebuilt with the new layout.
drop index if exists public.idx_meeting_note_action_items_search;
alter table public.meeting_notes drop column if exists search_vector;

-- Each text parsed with both configurations; the Portuguese and English
-- lexemes of one word share that word's position. Text i gets weight
-- p_weights[i] (default D) and starts 128 positions after the last position
-- of text i-1, so no phrase can join two texts. Positions are capped at
-- 16383 (the tsvector maximum, as to_tsvector does). The entries are built
-- as tsvector text ('lexeme':pos+weight, quote doubled, backslash escaped);
-- the tsvector input merges a lexeme listed by both configurations and
-- removes duplicate positions. PL/pgSQL (cached plan): a per-row SQL function
-- with CTEs was re-planned on every call (~14x slower on item rows).
create or replace function private.meeting_note_search_tsvector(p_texts text[], p_weights text[])
returns tsvector
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  v_entries text[] := '{}';
  v_part text;
  v_weight text;
  v_shift integer := 0;
  v_span integer;
  v_pt tsvector;
  v_en tsvector;
begin
  for i in 1 .. coalesce(pg_catalog.array_length(p_texts, 1), 0) loop
    v_weight := coalesce(p_weights[i], 'D');
    v_pt := pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_texts[i], ''));
    v_en := pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_texts[i], ''));

    select pg_catalog.string_agg(
             '''' || pg_catalog.replace(pg_catalog.replace(v.lexeme, '\', '\\'), '''', '''''') || ''':'
             || (select pg_catalog.string_agg(least(p.pos + v_shift, 16383)::text || v_weight, ',')
                 from pg_catalog.unnest(v.positions) as p(pos)),
             ' '),
           -- positions of a tsvector lexeme are sorted: the last is the largest
           pg_catalog.max(v.positions[pg_catalog.array_upper(v.positions, 1)])
    into v_part, v_span
    from (
      select e.lexeme, e.positions from pg_catalog.unnest(v_pt) as e
      union all
      select e.lexeme, e.positions from pg_catalog.unnest(v_en) as e
    ) as v;

    if v_part is not null then
      v_entries := v_entries || v_part;
    end if;
    v_shift := v_shift + coalesce(v_span, 0) + 128;
  end loop;

  return pg_catalog.array_to_string(v_entries, ' ')::pg_catalog.tsvector;
end;
$$;

-- The note document: title (A), summary (B), content text (C).
create or replace function private.meeting_note_search_document(
  p_title text,
  p_content text,
  p_summary text
)
returns tsvector
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select private.meeting_note_search_tsvector(
           array[coalesce(p_title, ''), coalesce(p_summary, ''), private.meeting_note_plain_text(p_content)],
           array['A', 'B', 'C'])
$$;

-- An action item's document (unweighted = D).
create or replace function private.meeting_note_item_search_document(p_description text)
returns tsvector
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select private.meeting_note_search_tsvector(array[coalesce(p_description, '')], array['D'])
$$;

-- A user query: each language's websearch reading, with every lexeme replaced
-- by the alternation of all variants (Portuguese and English lexemes at the
-- same position of the query text) of the words that produced it; the two
-- readings are OR-ed (one copy when both are equal). Lexemes are located in the tsquery's text form
-- ('lexeme' with '' for a quote); one that cannot be resolved is kept as is.
create or replace function private.meeting_note_search_query(p_text text)
returns tsquery
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  with readings as (
    select 1 as reading,
           pg_catalog.websearch_to_tsquery('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_text, '')) as query
    union all
    select 2,
           pg_catalog.websearch_to_tsquery('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_text, ''))
  ),
  points as (
    select v.lexeme, p.pos
    from pg_catalog.unnest(pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_text, ''))) as v
    cross join lateral pg_catalog.unnest(v.positions) as p(pos)
    union
    select v.lexeme, p.pos
    from pg_catalog.unnest(pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_text, ''))) as v
    cross join lateral pg_catalog.unnest(v.positions) as p(pos)
  ),
  pairs as (
    select distinct a.lexeme, b.lexeme as variant
    from points as a
    join points as b on b.pos = a.pos
  ),
  variants as (
    select pr.lexeme,
           '( ' || pg_catalog.string_agg(
                     '''' || pg_catalog.replace(pg_catalog.replace(pr.variant, '\', '\\'), '''', '''''') || '''',
                     ' | ' order by pr.variant)
                || ' )' as alternatives
    from pairs as pr
    group by pr.lexeme
  ),
  parts as (
    select r.reading, m.ord, m.part
    from readings as r
    cross join lateral pg_catalog.regexp_matches(r.query::text, '(''(?:[^'']|'''')*'')|([^'']+)', 'g')
      with ordinality as m(part, ord)
  ),
  rebuilt as (
    select p.reading,
           pg_catalog.string_agg(coalesce(v.alternatives, p.part[1], p.part[2]), '' order by p.ord)::pg_catalog.tsquery as query
    from parts as p
    left join variants as v
      on p.part[1] is not null
     and v.lexeme = pg_catalog.replace(pg_catalog.substr(p.part[1], 2, pg_catalog.length(p.part[1]) - 2), '''''', '''')
    group by p.reading
  )
  select case when e.pt = e.en then e.pt else e.pt || e.en end
  from (
    select coalesce((select rb.query from rebuilt as rb where rb.reading = 1),
                    (select r.query from readings as r where r.reading = 1)) as pt,
           coalesce((select rb.query from rebuilt as rb where rb.reading = 2),
                    (select r.query from readings as r where r.reading = 2)) as en
  ) as e
$$;

alter table public.meeting_notes
  add column search_vector tsvector
    generated always as (private.meeting_note_search_document(title, content, summary)) stored;

comment on column public.meeting_notes.search_vector is
  'Full-text document of title (A), summary (B), and content text (C): portuguese and english unaccented lexemes merged at their original positions, fields 128 positions apart; generated, never written directly (T4, block A fixes).';

create index idx_meeting_notes_search_vector
  on public.meeting_notes using gin (search_vector);

create index idx_meeting_note_action_items_search
  on public.meeting_note_action_items using gin (private.meeting_note_item_search_document(description));

-- ---------------------------------------------------------------------------
-- A-3: excerpts highlight matches of either language
-- ---------------------------------------------------------------------------

create or replace function private.meeting_note_search_headline(
  p_source text,
  p_query tsquery
)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  v_start constant text := pg_catalog.chr(57344);
  v_options constant text := 'StartSel=' || pg_catalog.chr(57344)
                             || ', StopSel=' || pg_catalog.chr(57345)
                             || ', MaxWords=30, MinWords=12, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "';
  v_text text := pg_catalog.translate(coalesce(p_source, ''), pg_catalog.chr(57344) || pg_catalog.chr(57345), '');
  v_first text;
  v_headline text;
  v_any text;
begin
  v_first := pg_catalog.ts_headline('private.meeting_notes_pt'::pg_catalog.regconfig, v_text, p_query, v_options);
  if pg_catalog.strpos(v_first, v_start) > 0 then
    return v_first;
  end if;

  v_headline := pg_catalog.ts_headline('private.meeting_notes_en'::pg_catalog.regconfig, v_text, p_query, v_options);
  if pg_catalog.strpos(v_headline, v_start) > 0 then
    return v_headline;
  end if;

  -- The match needed words of both languages: highlight any positive query
  -- word (querytree drops the excluded ones).
  select pg_catalog.string_agg(m.lexeme[1], ' | ')
  into v_any
  from pg_catalog.regexp_matches(pg_catalog.querytree(p_query), '(''(?:[^'']|'''')*'')', 'g') as m(lexeme);

  if v_any is not null then
    v_headline := pg_catalog.ts_headline('private.meeting_notes_pt'::pg_catalog.regconfig, v_text, v_any::pg_catalog.tsquery, v_options);
    if pg_catalog.strpos(v_headline, v_start) > 0 then
      return v_headline;
    end if;
    v_headline := pg_catalog.ts_headline('private.meeting_notes_en'::pg_catalog.regconfig, v_text, v_any::pg_catalog.tsquery, v_options);
    if pg_catalog.strpos(v_headline, v_start) > 0 then
      return v_headline;
    end if;
  end if;

  return v_first;
end;
$$;

create or replace function public.search_meeting_notes(
  p_query text default null,
  p_room_id uuid default null,
  p_space_removed boolean default false,
  p_meeting_from timestamptz default null,
  p_meeting_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  note_id uuid,
  room_id uuid,
  title text,
  meeting_date timestamptz,
  author_user_id uuid,
  author_name text,
  has_summary boolean,
  has_transcript boolean,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz,
  relevance real,
  excerpt_field text,
  excerpt text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_company_id uuid;
  v_text text := pg_catalog.btrim(coalesce(p_query, ''));
  v_removed boolean := coalesce(p_space_removed, false);
  v_query tsquery;
begin
  if pg_catalog.char_length(v_text) > 200
     or p_limit is null or p_limit < 1 or p_limit > 50
     or p_offset is null or p_offset < 0 or p_offset > 10000
     or (p_room_id is not null and v_removed)
     or (p_meeting_from is not null and p_meeting_to is not null and p_meeting_from > p_meeting_to) then
    raise exception 'MEETING_NOTE_SEARCH_INVALID' using errcode = '22023';
  end if;

  select u.company_id
  into v_company_id
  from public.users as u
  where u.supabase_uid = (select auth.uid())::text;

  if v_company_id is null then
    return;
  end if;

  if v_text = '' then
    return query
    select n.id,
           n.room_id,
           n.title,
           n.meeting_date,
           n.author_user_id,
           n.author_name,
           n.summary is not null,
           n.transcript_id is not null,
           n.revision,
           n.created_at,
           n.updated_at,
           null::real,
           null::text,
           null::text,
           pg_catalog.count(*) over ()
    from public.meeting_notes as n
    where n.company_id = v_company_id
      and (p_room_id is null or n.room_id = p_room_id)
      and (not v_removed or n.room_id is null)
      and (p_meeting_from is null or n.meeting_date >= p_meeting_from)
      and (p_meeting_to is null or n.meeting_date < p_meeting_to)
    order by n.meeting_date desc, n.id desc
    limit p_limit offset p_offset;
    return;
  end if;

  v_query := private.meeting_note_search_query(v_text);
  if pg_catalog.numnode(v_query) = 0 then
    return;
  end if;

  return query
  with note_hits as (
    select n.id as hit_note_id,
           pg_catalog.ts_rank(n.search_vector, v_query, 1) as hit_rank
    from public.meeting_notes as n
    where n.company_id = v_company_id
      and n.search_vector @@ v_query
  ),
  item_matches as (
    select i.note_id,
           i.description,
           i.created_at,
           i.id,
           pg_catalog.ts_rank(private.meeting_note_item_search_document(i.description), v_query) as item_rank
    from public.meeting_note_action_items as i
    join public.meeting_notes as n
      on n.id = i.note_id
     and n.company_id = v_company_id
    where private.meeting_note_item_search_document(i.description) @@ v_query
  ),
  item_hits as (
    select im.note_id as hit_note_id,
           pg_catalog.max(im.item_rank) as hit_rank,
           (pg_catalog.array_agg(im.description order by im.item_rank desc, im.created_at, im.id))[1] as best_description
    from item_matches as im
    group by im.note_id
  ),
  hits as (
    select u.hit_note_id,
           pg_catalog.sum(u.hit_rank) as hit_rank,
           pg_catalog.max(u.best_description) as best_description
    from (
      select nh.hit_note_id, nh.hit_rank, null::text as best_description
      from note_hits as nh
      union all
      select ih.hit_note_id, ih.hit_rank, ih.best_description
      from item_hits as ih
    ) as u
    group by u.hit_note_id
  ),
  page as (
    select n.id,
           n.room_id,
           n.title,
           n.meeting_date,
           n.author_user_id,
           n.author_name,
           n.summary,
           n.content,
           n.transcript_id,
           n.revision,
           n.created_at,
           n.updated_at,
           n.search_vector,
           h.hit_rank,
           h.best_description,
           pg_catalog.count(*) over () as total
    from hits as h
    join public.meeting_notes as n on n.id = h.hit_note_id
    where n.company_id = v_company_id
      and (p_room_id is null or n.room_id = p_room_id)
      and (not v_removed or n.room_id is null)
      and (p_meeting_from is null or n.meeting_date >= p_meeting_from)
      and (p_meeting_to is null or n.meeting_date < p_meeting_to)
    order by h.hit_rank desc, n.meeting_date desc, n.id desc
    limit p_limit offset p_offset
  )
  select p.id,
         p.room_id,
         p.title,
         p.meeting_date,
         p.author_user_id,
         p.author_name,
         p.summary is not null,
         p.transcript_id is not null,
         p.revision,
         p.created_at,
         p.updated_at,
         p.hit_rank::real,
         x.field,
         private.meeting_note_search_headline(x.source, v_query),
         p.total
  from page as p
  cross join lateral (
    select case
             when pg_catalog.ts_filter(p.search_vector, '{c}'::"char"[]) @@ v_query then 'content'
             when pg_catalog.ts_filter(p.search_vector, '{b}'::"char"[]) @@ v_query then 'summary'
             when p.best_description is not null then 'action_item'
             else 'title'
           end as field
  ) as f
  cross join lateral (
    select f.field,
           case f.field
             when 'content' then private.meeting_note_plain_text(p.content)
             when 'summary' then p.summary
             when 'action_item' then p.best_description
             else p.title
           end as source
  ) as x
  order by p.hit_rank desc, p.meeting_date desc, p.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership, comments, and EXECUTE privileges
-- ---------------------------------------------------------------------------

alter function private.meeting_note_validate_fields(text, timestamptz, text) owner to postgres;
alter function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) owner to postgres;
alter function private.meeting_note_search_tsvector(text[], text[]) owner to postgres;
alter function private.meeting_note_search_document(text, text, text) owner to postgres;
alter function private.meeting_note_item_search_document(text) owner to postgres;
alter function private.meeting_note_search_query(text) owner to postgres;
alter function private.meeting_note_search_headline(text, tsquery) owner to postgres;
alter function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer) owner to postgres;

revoke all on function private.meeting_note_validate_fields(text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_tsvector(text[], text[]) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_document(text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_item_search_document(text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_query(text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_headline(text, tsquery) from public, anon, authenticated, service_role;
revoke all on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) to authenticated;
-- Writers (service_role direct inserts/updates of notes and items) evaluate
-- the generated column and the item index expression.
grant execute on function private.meeting_note_search_tsvector(text[], text[]) to service_role;
grant execute on function private.meeting_note_search_document(text, text, text) to service_role;
grant execute on function private.meeting_note_item_search_document(text) to service_role;
grant execute on function private.meeting_note_search_query(text) to service_role;
grant execute on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer)
  to authenticated;

comment on function public.create_meeting_note(uuid, text, timestamptz, text, uuid[]) is
  'Phase 6 T17 (FR-001, BR-002): a member of the space''s company creates a note (title 1-200, not blank, date required, content <= 100,000, <= 50 current-member participants) with version 1; company and author snapshots come from the space and the caller''s users row. Locks users -> company -> space. Authenticated only.';
comment on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer) is
  'Company-scoped meeting-note search (T4, FR-026; block A fixes). SECURITY DEFINER; only notes of the caller''s users.company_id (resolved from auth.uid()). Phrases and exclusions apply across portuguese/english variants at original positions. Excerpt highlights are delimited by U+E000/U+E001.';
comment on function private.meeting_note_search_tsvector(text[], text[]) is
  'Meeting-note search document: each text in portuguese+english unaccented configs, lexemes merged at original positions, texts 128 positions apart, weights per text (block A fixes).';
comment on function private.meeting_note_search_headline(text, tsquery) is
  'Meeting-note search excerpt: the first ts_headline (portuguese, english, then any positive query word) that highlights a match (block A fixes).';

commit;
