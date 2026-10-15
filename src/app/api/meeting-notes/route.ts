// src/app/api/meeting-notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeMeetingNoteHtml } from '@/lib/meeting-notes/content-sanitizer';
import { loadMeetingNoteDetail } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  beginMeetingNoteRequest,
  internalError,
  meetingNoteError,
  noteMutationErrorResponse,
  notFound,
  ok,
  parseWith,
  readJsonObject,
} from '@/lib/meeting-notes/route-support';
import {
  codePointLength,
  createMeetingNoteBodySchema,
  listMeetingNotesQuerySchema,
  MEETING_NOTE_LIMITS,
} from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meeting-notes?spaceId=<uuid>&limit=<1..100>&cursor=<offset>
 * Notes of a space, newest meeting date first (FR-003). Read with the caller's
 * session: a space of another company (or a random id) yields an empty page.
 * Never returns content or transcript text.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest('/api/meeting-notes');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const params = request.nextUrl.searchParams;
  const query = parseWith(
    listMeetingNotesQuerySchema,
    {
      spaceId: params.get('spaceId') ?? undefined,
      limit: params.get('limit') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
    },
    ctx
  );
  if (!query.ok) return query.response;

  try {
    const page = await ctx.repository.findByRoom(query.value.spaceId, {
      limit: query.value.limit,
      cursor: query.value.cursor,
    });
    return ok(page, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.list');
  }
}

/**
 * POST /api/meeting-notes — create a note (FR-001, BR-002).
 * Body: { spaceId, title, meetingDate (ISO date-time with offset), content?,
 * participantIds? }. Content is sanitized (FR-002) and must be at most
 * 100,000 characters after sanitization. 201 { note }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes', 'meeting-note:write');
  if (!begun.ok) {
    await request.body?.cancel().catch(() => undefined);
    return begun.response;
  }
  const ctx = begun.value;

  const raw = await readJsonObject(request, ctx);
  if (!raw.ok) return raw.response;
  const body = parseWith(createMeetingNoteBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  const content = sanitizeMeetingNoteHtml(body.value.content);
  if (codePointLength(content) > MEETING_NOTE_LIMITS.contentMaxChars) {
    return meetingNoteError(400, 'MEETING_NOTE_CONTENT_TOO_LONG', ctx);
  }

  let noteId: string;
  try {
    const created = await ctx.repository.createNote({
      roomId: body.value.spaceId,
      title: body.value.title,
      meetingDate: body.value.meetingDate,
      content,
      participantIds: body.value.participantIds,
    });
    noteId = created.noteId;
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, '', 'meetingNotes.create');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, noteId);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok({ note }, ctx, 201);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.create.load');
  }
}
