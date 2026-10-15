// src/app/api/meeting-notes/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import {
  beginMeetingNoteRequest,
  internalError,
  meetingNoteError,
  ok,
  parseWith,
} from '@/lib/meeting-notes/route-support';
import { searchMeetingNotesQuerySchema } from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meeting-notes/search?q=&spaceId=&removed=&from=&to=&limit=&cursor=
 * Full-text search over the caller's company's notes (FR-004, FR-026): title,
 * content text, summary, and action-item descriptions; accent- and
 * case-insensitive, Portuguese and English. Called with the caller's session:
 * public.search_meeting_notes resolves the caller from auth.uid()
 * (users.supabase_uid) and reads only notes of that user's company_id (the
 * RLS read rule, BR-001), so another company's notes never appear.
 *
 * - `q` (<= 200 chars, websearch syntax). Empty or absent = list mode: every
 *   note within the filters, newest meeting first, `relevance`/`excerpt` null.
 * - `spaceId` = only that space; `removed=true` = only notes whose space was
 *   deleted ("Space removed"); not both (400 MEETING_NOTE_SEARCH_FILTER_INVALID).
 * - `from` (inclusive) / `to` (exclusive): ISO date-times with offset on the
 *   meeting date (400 MEETING_NOTE_SEARCH_PERIOD_INVALID when malformed or from > to).
 * - `limit` 1..50 (default 20); `cursor` = offset 0..10,000 (default 0).
 * - Matching is per document: the note's own text (title, content, summary)
 *   or ONE action item; all words of `q` (and any `-word` exclusion) apply
 *   within that document, so words split between the note text and an item,
 *   or across two items, do not combine into one match.
 * - Rate limit 'meeting-note:search' (120/min per user, fail-open) -> 429.
 *
 * 200 { items: MeetingNoteSearchResult[], nextCursor, hasMore, totalCount }:
 * relevance desc, meeting date desc, id desc. Each excerpt is plain-text
 * segments with `highlighted` matches (render as text). Never returns content,
 * summary, or transcript text beyond the excerpt.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest('/api/meeting-notes/search', 'meeting-note:search');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const params = request.nextUrl.searchParams;
  const query = parseWith(
    searchMeetingNotesQuerySchema,
    {
      q: params.get('q') ?? undefined,
      spaceId: params.get('spaceId') ?? undefined,
      removed: params.get('removed') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      limit: params.get('limit') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
    },
    ctx
  );
  if (!query.ok) return query.response;

  try {
    const page = await ctx.repository.searchNotes({
      query: query.value.q,
      spaceId: query.value.spaceId ?? null,
      spaceRemoved: query.value.removed,
      meetingFrom: query.value.from ?? null,
      meetingTo: query.value.to ?? null,
      limit: query.value.limit,
      offset: query.value.cursor,
    });
    return ok(page, ctx);
  } catch (error) {
    if (error instanceof MeetingNoteDbError && error.sqlstate === '22023' && error.token === 'MEETING_NOTE_SEARCH_INVALID') {
      return meetingNoteError(400, error.token, ctx, 'meetingNotes.search');
    }
    return internalError(error, ctx, 'meetingNotes.search');
  }
}
