// src/app/api/meeting-notes/[id]/versions/route.ts
import { NextResponse } from 'next/server';
import {
  beginMeetingNoteRequest,
  internalError,
  notFound,
  ok,
  parsePathId,
} from '@/lib/meeting-notes/route-support';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/meeting-notes/[id]/versions — the note's history, newest first
 * (who and when; FR-008, FR-009). Any member of the note's company; others
 * get the same 404 as a random id.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest('/api/meeting-notes/[id]/versions');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;

  try {
    const note = await ctx.repository.findById(id.value);
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    const versions = await ctx.repository.listVersions(note.id);
    return ok({ noteId: note.id, revision: note.revision, versions }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.versions');
  }
}
