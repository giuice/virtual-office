// src/app/api/meeting-notes/transcript/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadMeetingNoteDetail } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  meetingNoteError,
  noteMutationErrorResponse,
  notFound,
  ok,
} from '@/lib/meeting-notes/route-support';
import { readTranscriptUpload, transcriptTitleFromFileName } from '@/lib/meeting-notes/transcript-upload';
import { pathIdSchema } from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meeting-notes/transcript — "New note from transcript" (FR-012).
 * Body: multipart/form-data with `spaceId` (a space of the caller's company)
 * and one `file` (.txt/.vtt/.srt, 1 byte..1 MB, UTF-8 text; FR-013). The file
 * is validated before anything is written; then one transaction creates the
 * note (title = file name without extension, <= 200 chars; meeting date =
 * now; empty content; no participants), stores the transcript, and creates
 * version 1. 201 { note } (the transcript text is never echoed; read it with
 * GET /api/meeting-notes/[id]?include=transcript).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/transcript', 'meeting-note:transcript');
  if (!begun.ok) {
    await request.body?.cancel().catch(() => undefined);
    return begun.response;
  }
  const ctx = begun.value;

  const upload = await readTranscriptUpload(request, ['spaceId'], ctx);
  if (!upload.ok) return upload.response;

  const spaceId = pathIdSchema.safeParse(upload.value.fields.get('spaceId'));
  if (!spaceId.success) return meetingNoteError(400, 'MEETING_NOTE_SPACE_INVALID', ctx);

  let noteId: string;
  try {
    const created = await ctx.repository.createNoteFromTranscript({
      roomId: spaceId.data,
      title: transcriptTitleFromFileName(upload.value.fileName),
      transcript: upload.value.text,
    });
    noteId = created.noteId;
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, '', 'meetingNotes.transcript.create');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, noteId);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok({ note }, ctx, 201);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.transcript.create.load');
  }
}
