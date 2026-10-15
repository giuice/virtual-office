// src/app/api/meeting-notes/[id]/items/[itemId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadActionItemViews } from '@/lib/meeting-notes/note-detail';
import {
  beginMeetingNoteMutation,
  internalError,
  itemMutationErrorResponse,
  ok,
  parseWith,
  readJsonObject,
  resolveItemInNote,
} from '@/lib/meeting-notes/route-support';
import { expectedRevisionParamSchema, updateActionItemBodySchema } from '@/lib/meeting-notes/validation';
import type { ActionItem } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

const PATH = '/api/meeting-notes/[id]/items/[itemId]';

/**
 * PATCH /api/meeting-notes/[id]/items/[itemId] — a note editor edits an item
 * (FR-011, BR-005). Body (full replacement): { expectedRevision, description,
 * assigneeId (uuid|null), dueDate ('YYYY-MM-DD'|null) }. 200 { item }; 409
 * { code: MEETING_NOTE_ITEM_STALE_REVISION, currentRevision, item } when stale.
 * An assignee who is not an editor is refused (403); a new assignee who is
 * not a current member is rejected (400 MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:item-write');
  if (!begun.ok) {
    await request.body?.cancel().catch(() => undefined);
    return begun.response;
  }
  const ctx = begun.value;

  const raw = await params;
  const target = await resolveItemInNote(ctx, raw.id, raw.itemId);
  if (!target.ok) {
    await request.body?.cancel().catch(() => undefined);
    return target.response;
  }

  const json = await readJsonObject(request, ctx);
  if (!json.ok) return json.response;
  const body = parseWith(updateActionItemBodySchema, json.value, ctx);
  if (!body.ok) return body.response;

  const companyId = ctx.dbUser.companyId;
  let item: ActionItem;
  try {
    item = await ctx.repository.updateActionItem({
      itemId: target.value.id,
      expectedRevision: body.value.expectedRevision,
      description: body.value.description,
      assigneeId: body.value.assigneeId,
      dueDate: body.value.dueDate,
    });
  } catch (error) {
    return itemMutationErrorResponse(error, ctx, target.value.id, companyId, 'meetingNotes.items.update');
  }

  try {
    const [view] = await loadActionItemViews(ctx.repository, companyId, [item]);
    return ok({ item: view }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.items.update.load');
  }
}

/**
 * DELETE /api/meeting-notes/[id]/items/[itemId]?expectedRevision=N — a note
 * editor deletes an item. 200 { itemId, deleted: true }.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:item-write');
  if (!begun.ok) return begun.response;
  const ctx = begun.value;

  const raw = await params;
  const target = await resolveItemInNote(ctx, raw.id, raw.itemId);
  if (!target.ok) return target.response;

  const revision = parseWith(
    expectedRevisionParamSchema('MEETING_NOTE_ITEM_REVISION_REQUIRED'),
    request.nextUrl.searchParams.get('expectedRevision') ?? undefined,
    ctx
  );
  if (!revision.ok) return revision.response;

  try {
    await ctx.repository.deleteActionItem(target.value.id, revision.value);
    return ok({ itemId: target.value.id, deleted: true }, ctx);
  } catch (error) {
    return itemMutationErrorResponse(error, ctx, target.value.id, ctx.dbUser.companyId, 'meetingNotes.items.delete');
  }
}
