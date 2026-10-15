-- Phase 6 T14 fix: search excerpts keep user text that looks like markup
-- (spec-interview/phase-6-meeting-notes; SPEC FR-026; AC-014). Depends on
-- 20261013124610 (private.meeting_note_search_headline, its callers, and
-- its privileges).
--
-- Why: the excerpt source is the note's plain text with entities decoded,
-- so a note that says `<img src=x> budget` reaches ts_headline with a real
-- `<`. The default text-search parser reads `<...>` as a tag token and
-- ts_headline drops tag tokens, so the excerpt silently lost that text
-- (found by the T14 E2E run, meetings-search.spec.ts). No element was ever
-- created: the UI renders excerpts as text.
--
-- Change: private.meeting_note_search_headline maps `<` and `>` to the
-- private-use characters U+E002 and U+E003 before ts_headline (the parser
-- then sees ordinary non-word characters, kept like other punctuation) and
-- maps them back in the result. As before, the private-use characters the
-- function uses as markers (U+E000..U+E003) are removed from the source
-- first, so user text cannot forge a highlight or a bracket. Matching,
-- highlighting, fragment choice, and the signature are otherwise unchanged;
-- like any punctuation, a `<` at the very start of a fragment is trimmed by
-- ts_headline.
--
-- Privileges: unchanged (owner postgres; EXECUTE for nobody but the owner;
-- only the definer search RPC calls it); restated below per the PLAN rule.
--
-- Rollback (app first, then):
--   re-run the private.meeting_note_search_headline definition from
--   20261013124610_meeting_notes_block_a_fixes.sql (same signature, same
--   privileges).

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
  -- U+E002/U+E003 stand in for < and > while ts_headline parses the text.
  v_angles constant text := pg_catalog.chr(57346) || pg_catalog.chr(57347);
  v_text text := pg_catalog.translate(
    pg_catalog.translate(
      coalesce(p_source, ''),
      pg_catalog.chr(57344) || pg_catalog.chr(57345) || pg_catalog.chr(57346) || pg_catalog.chr(57347),
      ''
    ),
    '<>',
    v_angles
  );
  v_first text;
  v_headline text;
  v_any text;
begin
  v_first := pg_catalog.ts_headline('private.meeting_notes_pt'::pg_catalog.regconfig, v_text, p_query, v_options);
  if pg_catalog.strpos(v_first, v_start) > 0 then
    return pg_catalog.translate(v_first, v_angles, '<>');
  end if;

  v_headline := pg_catalog.ts_headline('private.meeting_notes_en'::pg_catalog.regconfig, v_text, p_query, v_options);
  if pg_catalog.strpos(v_headline, v_start) > 0 then
    return pg_catalog.translate(v_headline, v_angles, '<>');
  end if;

  -- The match needed words of both languages: highlight any positive query
  -- word (querytree drops the excluded ones).
  select pg_catalog.string_agg(m.lexeme[1], ' | ')
  into v_any
  from pg_catalog.regexp_matches(pg_catalog.querytree(p_query), '(''(?:[^'']|'''')*'')', 'g') as m(lexeme);

  if v_any is not null then
    v_headline := pg_catalog.ts_headline('private.meeting_notes_pt'::pg_catalog.regconfig, v_text, v_any::pg_catalog.tsquery, v_options);
    if pg_catalog.strpos(v_headline, v_start) > 0 then
      return pg_catalog.translate(v_headline, v_angles, '<>');
    end if;
    v_headline := pg_catalog.ts_headline('private.meeting_notes_en'::pg_catalog.regconfig, v_text, v_any::pg_catalog.tsquery, v_options);
    if pg_catalog.strpos(v_headline, v_start) > 0 then
      return pg_catalog.translate(v_headline, v_angles, '<>');
    end if;
  end if;

  return pg_catalog.translate(v_first, v_angles, '<>');
end;
$$;

alter function private.meeting_note_search_headline(text, tsquery) owner to postgres;
revoke all on function private.meeting_note_search_headline(text, tsquery) from public, anon, authenticated, service_role;

comment on function private.meeting_note_search_headline(text, tsquery) is
  'Meeting-note search excerpt: the first ts_headline (portuguese, english, then any positive query word) that highlights a match; < and > are kept as text (block A fixes, T14 fix).';
