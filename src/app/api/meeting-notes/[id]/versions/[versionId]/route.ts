// src/app/api/meeting-notes/[id]/versions/[versionId]/route.ts
import { NextResponse } from 'next/server';
import { loadMeetingNoteVersionView } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteRequest,
  internalError,
  notFound,
  ok,
  parsePathId,
} from '@/lib/meeting-notes/route-support';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

/**
 * GET /api/meeting-notes/[id]/versions/[versionId] — one immutable version
 * (title, date, participant snapshots, content, summary, editor, time; FR-009).
 * Each participant snapshot carries `isCurrentMember` for the note's company
 * (FR-030 "Former member" in versions).
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest('/api/meeting-notes/[id]/versions/[versionId]');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const raw = await params;
  const id = parsePathId(raw.id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;
  const versionId = parsePathId(raw.versionId, 'MEETING_NOTE_VERSION_NOT_FOUND', ctx);
  if (!versionId.ok) return versionId.response;

  try {
    const version = await ctx.repository.findVersion(id.value, versionId.value);
    // Distinguish only what the caller may know: a visible note without that version.
    const note = await ctx.repository.findById(id.value);
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    if (!version) return notFound('MEETING_NOTE_VERSION_NOT_FOUND', ctx);
    return ok({ version: await loadMeetingNoteVersionView(ctx.repository, note.companyId, version) }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.version');
  }
}
