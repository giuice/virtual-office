// src/app/api/meeting-notes/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  buildMeetingNoteMarkdown,
  calendarDayInZone,
  meetingNoteExportContentDisposition,
  meetingNoteExportFilenames,
} from '@/lib/meeting-notes/markdown-export';
import { loadMeetingNoteDetail } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteRequest,
  internalError,
  notFound,
  parsePathId,
  parseWith,
} from '@/lib/meeting-notes/route-support';
import { exportMeetingNoteQuerySchema } from '@/lib/meeting-notes/validation';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/meeting-notes/[id]/export[?includeTranscript=true|false][&timeZone=IANA]
 * — the note as a Markdown download (FR-027, AC-019): title, meeting date (as
 * a calendar day in `timeZone`, default UTC), space or "Space removed",
 * author, participants, content converted to Markdown, summary, action items,
 * and the stored transcript only with includeTranscript=true. Read with the
 * caller's session (RLS); a note of another company answers exactly like a
 * random id (404). User and AI text is escaped (no raw HTML in the file).
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteRequest('/api/meeting-notes/[id]/export');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const id = parsePathId((await params).id, 'MEETING_NOTE_NOT_FOUND', ctx);
  if (!id.ok) return id.response;

  const search = request.nextUrl.searchParams;
  const query = parseWith(
    exportMeetingNoteQuerySchema,
    {
      includeTranscript: search.get('includeTranscript') ?? undefined,
      timeZone: search.get('timeZone') ?? undefined,
    },
    ctx
  );
  if (!query.ok) return query.response;
  const { includeTranscript, timeZone } = query.value;

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value, { includeTranscript });
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    const markdown = buildMeetingNoteMarkdown(note, { includeTranscript, timeZone });
    const names = meetingNoteExportFilenames(note.title, calendarDayInZone(note.meetingDate, timeZone));
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': meetingNoteExportContentDisposition(names),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-correlation-id': ctx.correlationId,
      },
    });
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.export');
  }
}
