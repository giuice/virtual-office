-- Phase 6 T4 (spec-interview/phase-6-meeting-notes; FR-004, FR-026, FR-028,
-- BR-001, SM-2, SM-3; AC-014, AC-020 search part): company-scoped full-text
-- search over meeting notes.
--
-- Before this migration (T1 20261013103447, T17 20261013105021, T2
-- 20261013110632): no search infrastructure; the unaccent extension is
-- available but not installed.
--
-- After this migration:
--   * Extension unaccent installed in schema `extensions` (Supabase
--     convention). ONLINE DEPENDENCY: the target must allow
--     `create extension unaccent with schema extensions`; if unaccent already
--     exists there in another schema, the dictionary reference
--     extensions.unaccent below fails and this file must be adapted (T8/T15
--     preflight checks it).
--   * Two text-search configurations:
--       private.meeting_notes_pt = portuguese, with word/hword/hword_part
--         mapped to (extensions.unaccent, portuguese_stem);
--       private.meeting_notes_en = english, with the same tokens mapped to
--         (extensions.unaccent, english_stem).
--     Why both: notes mix Portuguese and English. Every document is indexed
--     with BOTH configurations (vector = pt || en) and every query is parsed
--     with BOTH and OR-ed (pt-query || en-query), so a word matches when it
--     matches under either language's stemming ("meetings" ~ "meeting" via
--     english, "orçamentos" ~ "orçamento" via portuguese). Accents: unaccent
--     runs before the stemmer for non-ASCII tokens ("reunião" ~ "reuniao");
--     ASCII tokens carry no accents. Case: both stemmers lowercase ("Budget" ~
--     "budget"). A word is a stop word only if it is one in both languages.
--     A custom unaccented 'simple' config was rejected: it does no stemming,
--     so plural/singular and verb forms would not match.
--   * public.meeting_notes.search_vector: tsvector GENERATED ALWAYS AS
--     (private.meeting_note_search_document(title, content, summary)) STORED,
--     GIN-indexed. Weights: title A, summary B, content C. Content is indexed
--     as TEXT: private.meeting_note_plain_text removes every tag of the
--     sanitized HTML (tag names and attributes, e.g. href, are never indexed),
--     joins inline formatting (strong/b/em/i/a/span/label) without a space and
--     block boundaries with one, and decodes the entities the sanitizer emits
--     (&amp; &lt; &gt; &quot; &#39; &nbsp;). The transcript is NOT indexed.
--     Being a generated column, it is recomputed by Postgres on every insert
--     and on every update of title/content/summary, by any writer, in the same
--     row write: no trigger, no extra lock, no revision bump, no version (the
--     T1 guard and T17 versioning are untouched; the guard never sees a
--     search-only update because none exists).
--   * Action items: GIN expression index on
--     private.meeting_note_item_search_document(description) (unweighted =
--     weight D). Item writes never touch public.meeting_notes (T2): the index
--     entry is maintained by the item row's own insert/update/delete, so there
--     is no item -> note write, no lock taken on the note, and no interaction
--     with the capacity trigger's note FOR UPDATE lock. The items table shape
--     is unchanged (the item RPCs return to_jsonb(row)).
--   * public.search_meeting_notes(p_query text, p_room_id uuid,
--       p_space_removed boolean, p_meeting_from timestamptz,
--       p_meeting_to timestamptz, p_limit integer, p_offset integer)
--       RETURNS TABLE (note_id, room_id, title, meeting_date, author_user_id,
--         author_name, has_summary, has_transcript, revision, created_at,
--         updated_at, relevance real, excerpt_field text, excerpt text,
--         total_count bigint)
--     SECURITY DEFINER (owner postgres, search_path '', EXECUTE to
--     authenticated only), applying the same rule as the RLS read policies
--     (BR-001, private.is_company_member): the caller is resolved by
--     users.supabase_uid = auth.uid()::text, and every note and item read in
--     the function is restricted to n.company_id = that users.company_id. A
--     caller without a users row or company gets no rows; members and admins
--     of another company never see a note (SM-3). Why not SECURITY INVOKER:
--     under RLS, Postgres evaluates the policy quals before any
--     non-leakproof user qual, and the full-text operator @@ is not
--     leakproof, so neither GIN index could ever be used (verified with
--     EXPLAIN: seq scans plus a per-item policy subplan, even with
--     enable_seqscan off); search cost would grow with every note and item of
--     the company.
--       - p_query blank/NULL: list mode — every note of the company within
--         the filters, meeting_date desc, id desc; relevance/excerpt NULL.
--       - otherwise websearch syntax (words AND-ed, "phrases", or, -word);
--         a query with no lexemes (only stop words / punctuation) returns no
--         rows. Matching: note vector OR any single one of its items; the
--         whole query (all words, any -word exclusion) is evaluated within one
--         document (the note's text, or one item), so words split between the
--         note text and an item do not combine. Relevance =
--         ts_rank(note vector, q, normalization 1) + max item ts_rank.
--         Order: relevance desc, meeting_date desc, note id desc (total order,
--         so offset pages have no duplicates or gaps while data is unchanged).
--       - Filters: p_room_id = that space; p_space_removed = true -> only
--         notes whose space was deleted (room_id IS NULL); both together are
--         invalid. Period: meeting_date >= p_meeting_from (inclusive) and
--         < p_meeting_to (exclusive); from > to is invalid.
--       - Pagination: p_limit 1..50, p_offset 0..10000; total_count = number
--         of matches within the filters (same on every row).
--       - Excerpt: from the first field that matches, in this order: content,
--         summary, an action item (the best-ranked matching one), title.
--         excerpt_field is 'content' | 'summary' | 'action_item' | 'title'.
--         excerpt is PLAIN TEXT (never HTML; content tags are stripped and
--         entities decoded) produced by ts_headline (Portuguese config), at
--         most 2 fragments of <= 30 words joined by " … ". Matched words are
--         wrapped in U+E000 (start) and U+E001 (end), private-use characters
--         removed from the source text first, so they only ever delimit
--         highlights. The UI must render the excerpt as text (the route turns
--         it into segments).
--     Errors: 22023 MEETING_NOTE_SEARCH_INVALID (query > 200 chars, limit or
--     offset out of range, space + removed together, from > to).
--   * Helper functions (owner postgres, search_path '', IMMUTABLE, PARALLEL
--     SAFE, no table access): private.meeting_note_plain_text(text),
--     private.meeting_note_search_document(text, text, text),
--     private.meeting_note_item_search_document(text),
--     private.meeting_note_search_query(text). REVOKE ALL from PUBLIC, anon,
--     authenticated, service_role; EXECUTE granted to service_role only:
--     Postgres checks EXECUTE on the generated-column and index-expression
--     functions for the writing role (verified: a service_role note insert
--     fails with "permission denied for function" without it). The RPCs and
--     FK actions write as postgres; authenticated never writes these tables
--     and the search RPC runs as its owner. They only transform their
--     arguments.
--
-- Performance (SM-2): GIN on meeting_notes.search_vector and on the item
-- expression (used for selective words); a word present in most of the
-- company's notes is read through idx_meeting_notes_company_meeting_date / a
-- scan of the company's rows, as the planner prefers. Ranking reads the
-- stored note vector (no re-parsing); the content text and ts_headline are
-- computed only for the returned page (<= 50 rows).
--
-- Rollback (order: FIRST roll the application back to a build that does not
-- call /api/meeting-notes/search, THEN run this SQL; no note or item data is
-- lost; unaccent stays installed unless nothing else uses it):
--   begin;
--   set local lock_timeout = '5s';
--   lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;
--   drop function if exists public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer);
--   drop index if exists public.idx_meeting_note_action_items_search;
--   drop index if exists public.idx_meeting_notes_search_vector;
--   alter table public.meeting_notes drop column if exists search_vector;
--   drop function if exists private.meeting_note_search_query(text);
--   drop function if exists private.meeting_note_item_search_document(text);
--   drop function if exists private.meeting_note_search_document(text, text, text);
--   drop function if exists private.meeting_note_plain_text(text);
--   drop text search configuration if exists private.meeting_notes_pt;
--   drop text search configuration if exists private.meeting_notes_en;
--   -- optional, only when no other object uses it: drop extension if exists unaccent;
--   commit;

begin;

set local lock_timeout = '5s';

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Text-search configurations (Portuguese + English, accent-insensitive)
-- ---------------------------------------------------------------------------

create text search configuration private.meeting_notes_pt (copy = pg_catalog.portuguese);
alter text search configuration private.meeting_notes_pt
  alter mapping for word, hword, hword_part
  with extensions.unaccent, pg_catalog.portuguese_stem;

create text search configuration private.meeting_notes_en (copy = pg_catalog.english);
alter text search configuration private.meeting_notes_en
  alter mapping for word, hword, hword_part
  with extensions.unaccent, pg_catalog.english_stem;

alter text search configuration private.meeting_notes_pt owner to postgres;
alter text search configuration private.meeting_notes_en owner to postgres;

comment on text search configuration private.meeting_notes_pt is
  'Meeting-note search: portuguese stemming after unaccent (T4).';
comment on text search configuration private.meeting_notes_en is
  'Meeting-note search: english stemming after unaccent (T4).';

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

-- Text of sanitized meeting-note HTML: inline formatting tags are removed
-- without a space (so "bud<strong>get</strong>" stays one word), every other
-- tag becomes a space, the sanitizer's entities are decoded (&amp; last), and
-- whitespace is collapsed.
create or replace function private.meeting_note_plain_text(p_html text)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.btrim(
           pg_catalog.regexp_replace(
             pg_catalog.replace(
               pg_catalog.replace(
                 pg_catalog.replace(
                   pg_catalog.replace(
                     pg_catalog.replace(
                       pg_catalog.replace(
                         pg_catalog.regexp_replace(
                           pg_catalog.regexp_replace(
                             coalesce(p_html, ''),
                             '</?(strong|b|em|i|a|span|label)(\s[^>]*)?>', '', 'gi'),
                           '<[^>]*>', ' ', 'g'),
                         '&nbsp;', ' '),
                       '&lt;', '<'),
                     '&gt;', '>'),
                   '&quot;', '"'),
                 '&#39;', ''''),
               '&amp;', '&'),
             '\s+', ' ', 'g'))
$$;

-- The note document: title (A), summary (B), content text (C), each in both
-- configurations.
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
  select pg_catalog.setweight(
           pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_title, ''))
           || pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_title, '')),
           'A')
      || pg_catalog.setweight(
           pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_summary, ''))
           || pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_summary, '')),
           'B')
      || pg_catalog.setweight(
           pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, private.meeting_note_plain_text(p_content))
           || pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, private.meeting_note_plain_text(p_content)),
           'C')
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
  select pg_catalog.to_tsvector('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_description, ''))
      || pg_catalog.to_tsvector('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_description, ''))
$$;

-- A user query parsed with both configurations and OR-ed.
create or replace function private.meeting_note_search_query(p_text text)
returns tsquery
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.websearch_to_tsquery('private.meeting_notes_pt'::pg_catalog.regconfig, coalesce(p_text, ''))
      || pg_catalog.websearch_to_tsquery('private.meeting_notes_en'::pg_catalog.regconfig, coalesce(p_text, ''))
$$;

alter function private.meeting_note_plain_text(text) owner to postgres;
alter function private.meeting_note_search_document(text, text, text) owner to postgres;
alter function private.meeting_note_item_search_document(text) owner to postgres;
alter function private.meeting_note_search_query(text) owner to postgres;

revoke all on function private.meeting_note_plain_text(text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_document(text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_item_search_document(text) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_search_query(text) from public, anon, authenticated, service_role;

grant execute on function private.meeting_note_plain_text(text) to service_role;
grant execute on function private.meeting_note_search_document(text, text, text) to service_role;
grant execute on function private.meeting_note_item_search_document(text) to service_role;
grant execute on function private.meeting_note_search_query(text) to service_role;

-- ---------------------------------------------------------------------------
-- Stored document + indexes
-- ---------------------------------------------------------------------------

lock table public.meeting_notes, public.meeting_note_action_items in access exclusive mode;

alter table public.meeting_notes
  add column search_vector tsvector
    generated always as (private.meeting_note_search_document(title, content, summary)) stored;

comment on column public.meeting_notes.search_vector is
  'Full-text document of title (A), summary (B), and content text (C) in portuguese+english unaccented configs; generated, never written directly (T4).';

create index idx_meeting_notes_search_vector
  on public.meeting_notes using gin (search_vector);

create index idx_meeting_note_action_items_search
  on public.meeting_note_action_items using gin (private.meeting_note_item_search_document(description));

-- ---------------------------------------------------------------------------
-- Search RPC (SECURITY DEFINER; company rule applied explicitly)
-- ---------------------------------------------------------------------------

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
  v_options text := 'StartSel=' || pg_catalog.chr(57344)
                    || ', StopSel=' || pg_catalog.chr(57345)
                    || ', MaxWords=30, MinWords=12, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "';
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
  item_hits as (
    select i.note_id as hit_note_id,
           pg_catalog.max(pg_catalog.ts_rank(private.meeting_note_item_search_document(i.description), v_query)) as hit_rank,
           (pg_catalog.array_agg(
              i.description
              order by pg_catalog.ts_rank(private.meeting_note_item_search_document(i.description), v_query) desc,
                       i.created_at,
                       i.id))[1] as best_description
    from public.meeting_note_action_items as i
    join public.meeting_notes as n
      on n.id = i.note_id
     and n.company_id = v_company_id
    where private.meeting_note_item_search_document(i.description) @@ v_query
    group by i.note_id
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
         pg_catalog.ts_headline(
           'private.meeting_notes_pt'::pg_catalog.regconfig,
           pg_catalog.translate(x.source, pg_catalog.chr(57344) || pg_catalog.chr(57345), ''),
           v_query,
           v_options),
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

alter function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer) owner to postgres;
revoke all on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer)
  to authenticated;

comment on function public.search_meeting_notes(text, uuid, boolean, timestamptz, timestamptz, integer, integer) is
  'Company-scoped meeting-note search (T4, FR-026). SECURITY DEFINER; only notes of the caller''s users.company_id (resolved from auth.uid()). Excerpt highlights are delimited by U+E000/U+E001.';

commit;
