// src/app/api/meeting-notes/[id]/items/[itemId]/completion/route.ts
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
import { actionItemCompletionBodySchema } from '@/lib/meeting-notes/validation';
import type { ActionItem } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

/**
 * PUT /api/meeting-notes/[id]/items/[itemId]/completion — a note editor or
 * the item's current assignee sets completion only (FR-011, BR-005).
 * Body: { expectedRevision, completed }. 200 { item }; 409 with the current
 * item when stale.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, '/api/meeting-notes/[id]/items/[itemId]/completion', 'meeting-note:item-write');
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
  const body = parseWith(actionItemCompletionBodySchema, json.value, ctx);
  if (!body.ok) return body.response;

  const companyId = ctx.dbUser.companyId;
  let item: ActionItem;
  try {
    item = await ctx.repository.setActionItemCompleted(target.value.id, body.value.expectedRevision, body.value.completed);
  } catch (error) {
    return itemMutationErrorResponse(error, ctx, target.value.id, companyId, 'meetingNotes.items.completion');
  }

  try {
    const [view] = await loadActionItemViews(ctx.repository, companyId, [item]);
    return ok({ item: view }, ctx);
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.items.completion.load');
  }
}
