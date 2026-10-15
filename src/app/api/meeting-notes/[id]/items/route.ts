// src/app/api/meeting-notes/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadActionItemViews } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  noteMutationErrorResponse,
  ok,
  parsePathId,
  parseWith,
  readJsonObject,
} from '@/lib/meeting-notes/route-support';
import { createActionItemBodySchema } from '@/lib/meeting-notes/validation';
import type { ActionItem } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/meeting-notes/[id]/items — a note editor adds an action item
 * (FR-011, BR-005). Body: { description, assigneeId?, dueDate? ('YYYY-MM-DD') }.
 * 201 { item }. At most 100 items per note (400 MEETING_NOTE_ITEM_LIMIT_REACHED).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/[id]/items', 'meeting-note:item-write');
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
  const body = parseWith(createActionItemBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  let item: ActionItem;
  try {
    item = await ctx.repository.createActionItem({
      noteId: id.value,
      description: body.value.description,
      assigneeId: body.value.assigneeId,
      dueDate: body.value.dueDate,
    });
  } catch (error) {
    // Item creation carries no revision; a refusal is forbidden/not found/limits.
    return noteMutationErrorResponse(error, ctx, id.value, 'meetingNotes.items.create');
  }

  try {
    // The RPC succeeded, so the caller is a current member of the note's company.
    const [view] = await loadActionItemViews(ctx.repository, ctx.dbUser.companyId, [item]);
    return ok({ item: view }, ctx, 201);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.items.create.load');
  }
}
