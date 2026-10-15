// src/app/api/meeting-notes/[id]/ai/apply/route.ts
// Apply of a reviewed AI draft (Phase 6 T12; SPEC FR-007, FR-008, FR-011,
// FR-018, FR-019, BR-006).
//
// POST, body { expectedRevision, summary: {keyPoints[], decisions[],
// nextSteps[]}, items: [{description, assigneeId?, dueDate?}] }:
// expectedRevision is the draft's SOURCE revision (the start response's
// sourceRevision). The edited summary is stored as plain text
// (formatMeetingNoteAiSummary; all sections empty keeps the current
// summary); accepted items are appended. The write is one
// call to public.apply_meeting_note_ai_draft with the USER's session: the
// database resolves the caller from auth.uid(), re-checks editor rights on
// the locked note, requires the source revision, enforces the 100-item
// capacity, and creates one version — all or nothing. Nothing provider-side
// is involved; Apply works on what the user submitted.
import { NextRequest, NextResponse } from 'next/server';

import { formatMeetingNoteAiSummary } from '@/lib/meeting-notes/ai/draft-review';
import { loadMeetingNoteDetail } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  meetingNoteError,
  notFound,
  noteMutationErrorResponse,
  ok,
  parsePathId,
  parseWith,
  readJsonObject,
} from '@/lib/meeting-notes/route-support';
import { applyMeetingNoteAiDraftBodySchema, codePointLength, MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { MeetingNoteAiApplyResult } from '@/types/meeting-notes';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/meeting-notes/[id]/ai/apply → 200 { note, applied: {revision, versionId, itemIds, duplicateIndexes} }.
 * 409 MEETING_NOTE_STALE_REVISION with the current note (the note or its transcript changed since the draft's source);
 * 403 MEETING_NOTE_FORBIDDEN; 404 MEETING_NOTE_NOT_FOUND; 400 MEETING_NOTE_SUMMARY_INVALID /
 * MEETING_NOTE_AI_APPLY_ITEMS_INVALID / MEETING_NOTE_AI_APPLY_EMPTY / MEETING_NOTE_ITEM_DESCRIPTION_INVALID /
 * MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER / MEETING_NOTE_ITEM_LIMIT_REACHED (nothing changed).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/[id]/ai/apply', 'meeting-note:write');
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
  const body = parseWith(applyMeetingNoteAiDraftBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  const summary = formatMeetingNoteAiSummary(body.value.summary);
  if (summary !== null && codePointLength(summary) > MEETING_NOTE_LIMITS.contentMaxChars) {
    return meetingNoteError(400, 'MEETING_NOTE_SUMMARY_INVALID', ctx);
  }

  let applied: MeetingNoteAiApplyResult;
  try {
    applied = await ctx.repository.applyAiDraft({
      noteId: id.value,
      expectedRevision: body.value.expectedRevision,
      summary,
      items: body.value.items,
    });
  } catch (error) {
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.aiApply');
  }

  try {
    const note = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, id.value);
    // Deleted by another request right after this change committed.
    if (!note) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    return ok(
      {
        note,
        applied: {
          revision: applied.revision,
          versionId: applied.versionId,
          itemIds: applied.itemIds,
          duplicateIndexes: applied.duplicateIndexes,
        },
      },
      ctx
    );
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.aiApply.load');
  }
}
