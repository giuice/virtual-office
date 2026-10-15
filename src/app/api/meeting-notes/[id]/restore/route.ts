// src/app/api/meeting-notes/[id]/restore/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadMeetingNoteDetail } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  noteMutationErrorResponse,
  notFound,
  ok,
  parsePathId,
  parseWith,
  readJsonObject,
} from '@/lib/meeting-notes/route-support';
import { restoreMeetingNoteBodySchema } from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/meeting-notes/[id]/restore — an editor restores a version's
 * title, date, participants, content, and summary as a new version (FR-009).
 * Body: { expectedRevision, versionId }. 200 { note }; 409 with the current
 * note when stale. Action items and the transcript are unchanged.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/[id]/restore', 'meeting-note:write');
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
  const body = parseWith(restoreMeetingNoteBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  try {
    await ctx.repository.restoreVersion(id.value, body.value.expectedRevision, body.value.versionId);
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.restore');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok({ note }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.restore.load');
  }
}
