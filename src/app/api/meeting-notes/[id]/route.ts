// src/app/api/meeting-notes/[id]/route.ts
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
  parsePathId,
  parseWith,
  readJsonObject,
} from '@/lib/meeting-notes/route-support';
import {
  codePointLength,
  expectedRevisionParamSchema,
  MEETING_NOTE_LIMITS,
  updateMeetingNoteBodySchema,
} from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PATH = '/api/meeting-notes/[id]';

/**
 * GET /api/meeting-notes/[id][?include=transcript] — the note view (FR-005):
 * fields, space name (null = "Space removed"), author snapshot, participants
 * with a current-member flag, sanitized content, summary, transcript identity
 * (text only with include=transcript), action items, revision, and the
 * caller's rights. A note of another company answers exactly like a random id.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest(PATH);
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;

  try {
    const includeTranscript = request.nextUrl.searchParams.get('include') === 'transcript';
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value, { includeTranscript });
    return note ? ok({ note }, ctx) : notFound('MEETING_NOTE_NOT_FOUND', ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.get');
  }
}

/**
 * PATCH /api/meeting-notes/[id] — an editor saves the note (FR-006, FR-007).
 * Body (full replacement): { expectedRevision, title, meetingDate, content,
 * participantIds }. 200 { note }; 409 { code: MEETING_NOTE_STALE_REVISION,
 * currentRevision, note } when another change landed first.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:write');
  if (!begun.ok) {
    await request.body?.cancel().catch(() => undefined);
    return begun.response;
  }
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) {
    await request.body?.cancel().catch(() => undefined);
    return id.response;
  }

  const raw = await readJsonObject(request, ctx);
  if (!raw.ok) return raw.response;
  const body = parseWith(updateMeetingNoteBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  const content = sanitizeMeetingNoteHtml(body.value.content);
  if (codePointLength(content) > MEETING_NOTE_LIMITS.contentMaxChars) {
    return meetingNoteError(400, 'MEETING_NOTE_CONTENT_TOO_LONG', ctx);
  }

  try {
    await ctx.repository.updateNote({
      noteId: id.value,
      expectedRevision: body.value.expectedRevision,
      title: body.value.title,
      meetingDate: body.value.meetingDate,
      content,
      participantIds: body.value.participantIds,
    });
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.update');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok({ note }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.update.load');
  }
}

/**
 * DELETE /api/meeting-notes/[id]?expectedRevision=N — the author or an admin
 * deletes the note with its versions, participants, items, and transcript
 * (FR-010). 200 { noteId, deleted: true }.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:write');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;

  const revision = parseWith(
    expectedRevisionParamSchema('MEETING_NOTE_REVISION_REQUIRED'),
    request.nextUrl.searchParams.get('expectedRevision') ?? undefined,
    ctx
  );
  if (!revision.ok) return revision.response;

  try {
    await ctx.repository.deleteNote(id.value, revision.value);
    return ok({ noteId: id.value, deleted: true }, ctx);
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.delete');
  }
}
