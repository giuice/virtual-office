// src/app/api/meeting-notes/[id]/transcript/route.ts
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
} from '@/lib/meeting-notes/route-support';
import { readTranscriptUpload } from '@/lib/meeting-notes/transcript-upload';
import { expectedRevisionParamSchema } from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/meeting-notes/[id]/transcript — "Attach transcript" (FR-012,
 * BR-010): an editor (author, participant, or admin, while a member)
 * replaces the stored transcript. Body: multipart/form-data with
 * `expectedRevision` (the note revision the editor saw) and one `file`
 * (.txt/.vtt/.srt, 1 byte..1 MB, UTF-8 text; FR-013), validated before
 * anything is written. The transcript gets a new identity, the revision is
 * bumped, and one version (unchanged fields) records who replaced it; title,
 * date, participants, content, summary, and items are untouched.
 * 200 { note }; 409 { code: MEETING_NOTE_STALE_REVISION, currentRevision,
 * note } when another change landed first (FR-007); 403 for a non-editor;
 * 404 for a note outside the caller's company.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/[id]/transcript', 'meeting-note:transcript');
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

  const upload = await readTranscriptUpload(request, ['expectedRevision'], ctx);
  if (!upload.ok) return upload.response;

  const revision = parseWith(
    expectedRevisionParamSchema('MEETING_NOTE_REVISION_REQUIRED'),
    upload.value.fields.get('expectedRevision'),
    ctx
  );
  if (!revision.ok) return revision.response;

  try {
    await ctx.repository.attachTranscript({
      noteId: id.value,
      expectedRevision: revision.value,
      transcript: upload.value.text,
    });
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.transcript.attach');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok({ note }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.transcript.attach.load');
  }
}
