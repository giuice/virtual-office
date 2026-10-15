// src/lib/meeting-notes/route-support.ts
// Shared plumbing of the /api/meeting-notes routes (Phase 6 T3): session,
// rate limit, bounded JSON bodies, validation errors, and the mapping of RPC
// refusals to HTTP. Note and item reads and writes always use the USER's
// server client (RLS and the RPCs authorize from auth.uid()); the service-role
// client is built only to charge the per-user rate-limit counter
// (check_rate_limit is service-role only).
import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { createCorrelationId, jsonError } from '@/lib/api/server-error';
import { enforceRateLimit, type RateLimitedAction } from '@/lib/auth/rate-limit';
import { requireAuthUser } from '@/lib/auth/session';
import { readBoundedBody } from '@/lib/messaging/metrics-log';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseMeetingNoteRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteRepository';
import type { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import type { ActionItem, User } from '@/types/database';
import { MeetingNoteDbError, type MeetingNoteErrorToken } from './errors';
import { loadActionItemViews, loadMeetingNoteDetail } from './note-detail';
import { isCrossOriginMeetingNoteRequest } from './request-origin';
import { MEETING_NOTE_MAX_BODY_BYTES, pathIdSchema } from './validation';

export interface MeetingNoteRouteContext {
  correlationId: string;
  /** The user's server client (JWT from the request cookies). */
  supabase: SupabaseClient;
  dbUser: User;
  repository: IMeetingNoteRepository;
}

type Result<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

const MESSAGES: Record<string, string> = {
  BAD_REQUEST: 'The request is invalid.',
  MEETING_NOTE_ORIGIN_FORBIDDEN: 'This request must come from the application itself.',
  UNSUPPORTED_MEDIA_TYPE: 'The request body must be application/json.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  MEETING_NOTE_SPACE_INVALID: 'A valid space is required.',
  MEETING_NOTE_VERSION_INVALID: 'A valid version is required.',
  MEETING_NOTE_ITEM_ASSIGNEE_INVALID: 'The assignee is invalid.',
  MEETING_NOTE_ITEM_DUE_DATE_INVALID: 'The due date must be a date (YYYY-MM-DD).',
  MEETING_NOTE_STALE_REVISION: 'This note was changed by someone else. Review the newer version before saving again.',
  MEETING_NOTE_ITEM_STALE_REVISION: 'This action item was changed by someone else. Review the newer version and try again.',
  MEETING_NOTE_FORBIDDEN: 'You do not have permission to change this note.',
  MEETING_NOTE_ITEM_FORBIDDEN: 'You do not have permission to change this action item.',
  MEETING_NOTE_NOT_FOUND: 'Meeting note not found.',
  MEETING_NOTE_SPACE_NOT_FOUND: 'Space not found.',
  MEETING_NOTE_VERSION_NOT_FOUND: 'Version not found.',
  MEETING_NOTE_ITEM_NOT_FOUND: 'Action item not found.',
  MEETING_NOTE_TITLE_INVALID: 'The title is required and must be at most 200 characters.',
  MEETING_NOTE_DATE_REQUIRED: 'A valid meeting date is required.',
  MEETING_NOTE_CONTENT_TOO_LONG: 'The content must be at most 100,000 characters.',
  MEETING_NOTE_CONTENT_REQUIRED: 'The content must be text.',
  MEETING_NOTE_TOO_MANY_PARTICIPANTS: 'A note can have at most 50 participants.',
  MEETING_NOTE_PARTICIPANTS_INVALID: 'The participant list is invalid.',
  MEETING_NOTE_PARTICIPANT_NOT_MEMBER: 'Participants must be current members of your company.',
  MEETING_NOTE_REVISION_REQUIRED: 'The note revision is required.',
  MEETING_NOTE_ITEM_DESCRIPTION_INVALID: 'The description is required and must be at most 1,000 characters.',
  MEETING_NOTE_ITEM_ASSIGNEE_NOT_MEMBER: 'The assignee must be a current member of your company.',
  MEETING_NOTE_ITEM_REVISION_REQUIRED: 'The action item revision is required.',
  MEETING_NOTE_ITEM_COMPLETED_REQUIRED: 'The completion state is required.',
  MEETING_NOTE_ITEM_LIMIT_REACHED: 'A note can have at most 100 action items.',
  MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID: 'Upload one transcript file (.txt, .vtt, or .srt).',
  MEETING_NOTE_TRANSCRIPT_INVALID_TYPE: 'The transcript must be a .txt, .vtt, or .srt file.',
  MEETING_NOTE_TRANSCRIPT_EMPTY: 'The transcript file is empty.',
  MEETING_NOTE_TRANSCRIPT_TOO_LARGE: 'The transcript file must be at most 1 MB.',
  MEETING_NOTE_TRANSCRIPT_NOT_TEXT: 'The transcript must be a UTF-8 text file.',
  MEETING_NOTE_SEARCH_INVALID: 'The search request is invalid.',
  MEETING_NOTE_SEARCH_QUERY_TOO_LONG: 'The search text must be at most 200 characters.',
  MEETING_NOTE_SEARCH_FILTER_INVALID: 'Choose either a space or "Space removed", not both.',
  MEETING_NOTE_SEARCH_PERIOD_INVALID: 'The period is invalid: use date-times with an offset, start before end.',
  MEETING_NOTE_AI_NOT_CONFIGURED: 'An admin needs to configure AI.',
  MEETING_NOTE_AI_TRANSCRIPT_REQUIRED: 'Attach a transcript to this note before processing it.',
  MEETING_NOTE_AI_UNAVAILABLE: 'AI processing is not available right now. Please contact your administrator.',
  MEETING_NOTE_AI_TICKET_INVALID: 'This processing request is not valid. Open the notice again and start a new processing.',
  MEETING_NOTE_AI_TICKET_EXPIRED: 'This processing request expired. Open the notice again and start a new processing.',
  MEETING_NOTE_AI_BINDING_MISMATCH: 'This processing request does not match this note. Open the notice again and start a new processing.',
  MEETING_NOTE_AI_SETTINGS_STALE: 'The AI settings changed since the notice was shown. Review the new notice before processing.',
  MEETING_NOTE_AI_SOURCE_STALE: 'The note or its transcript changed since the notice was shown. Open the notice again to process the current transcript.',
  MEETING_NOTE_AI_LIMIT_REACHED: "Your company reached today's AI processing limit.",
  MEETING_NOTE_AI_OPERATION_ENDED: 'This processing ended before the transcript was sent. Try again.',
  MEETING_NOTE_AI_CANCELLED: 'Processing was cancelled.',
  MEETING_NOTE_AI_DRAFT_DISCARDED: 'The draft was discarded. Try again.',
  MEETING_NOTE_SUMMARY_INVALID: 'The summary is invalid: at most 100 entries per section, each at most 2,000 characters.',
  MEETING_NOTE_AI_APPLY_ITEMS_INVALID: 'The accepted action items are invalid (at most 100).',
  MEETING_NOTE_AI_APPLY_EMPTY: 'Nothing to apply: keep a summary or accept at least one action item.',
};

function messageFor(code: string): string {
  return MESSAGES[code] ?? MESSAGES.BAD_REQUEST;
}

/** An error response with a stable code and the matching user-facing message. */
export function meetingNoteError(
  status: number,
  code: string,
  ctx: { correlationId: string },
  context?: string
): NextResponse {
  return jsonError(status, code, messageFor(code), { correlationId: ctx.correlationId, context });
}

/** An error response carrying extra non-sensitive fields (UI hints) next to code and message. */
export function meetingNoteErrorWithData(
  status: number,
  code: string,
  ctx: { correlationId: string },
  data: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: messageFor(code), code, correlationId: ctx.correlationId, ...data },
    { status, headers: { 'x-correlation-id': ctx.correlationId } }
  );
}

/** 404 for a missing, invisible, or malformed id (never reveals which). */
export function notFound(token: MeetingNoteErrorToken, ctx: { correlationId: string }): NextResponse {
  return meetingNoteError(404, token, ctx);
}

/**
 * Authenticates the caller (auth.getUser + users.supabase_uid) and, for a
 * mutation, charges `rateLimit` to their users.id.
 */
export async function beginMeetingNoteRequest(
  pathname: string,
  rateLimit?: RateLimitedAction
): Promise<Result<MeetingNoteRouteContext>> {
  const correlationId = createCorrelationId();
  const auth = await requireAuthUser({ correlationId, pathname });
  if ('errorResponse' in auth) {
    return { ok: false, response: auth.errorResponse };
  }

  if (rateLimit) {
    let limiter: SupabaseClient | null = null;
    try {
      limiter = await createSupabaseServerClient('service_role');
    } catch {
      // Fail-open action: a limiter that cannot be built never blocks notes.
      console.error(JSON.stringify({ event: 'meeting_notes_limiter_unavailable', correlationId }));
    }
    if (limiter) {
      const limited = await enforceRateLimit(limiter, auth.dbUser.id, rateLimit);
      if (limited) return { ok: false, response: limited };
    }
  }

  return {
    ok: true,
    value: {
      correlationId,
      supabase: auth.supabase,
      dbUser: auth.dbUser,
      repository: new SupabaseMeetingNoteRepository(auth.supabase),
    },
  };
}

/**
 * Entry point of EVERY mutating meeting-notes route (POST/PUT/PATCH/DELETE
 * under /api/meeting-notes and /api/companies/ai-settings): refuses a
 * cross-origin browser request (403 MEETING_NOTE_ORIGIN_FORBIDDEN, see
 * request-origin.ts) before any session lookup, rate-limit charge, or body
 * read, then authenticates and charges `rateLimit` like beginMeetingNoteRequest.
 */
export async function beginMeetingNoteMutation(
  request: Request,
  pathname: string,
  rateLimit: RateLimitedAction
): Promise<Result<MeetingNoteRouteContext>> {
  if (isCrossOriginMeetingNoteRequest(request)) {
    await request.body?.cancel().catch(() => undefined);
    return { ok: false, response: meetingNoteError(403, 'MEETING_NOTE_ORIGIN_FORBIDDEN', { correlationId: createCorrelationId() }) };
  }
  return beginMeetingNoteRequest(pathname, rateLimit);
}

/** A path id; anything that is not a UUID is answered as not found. */
export function parsePathId(
  raw: string | undefined,
  token: MeetingNoteErrorToken,
  ctx: { correlationId: string }
): Result<string> {
  const parsed = pathIdSchema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, response: notFound(token, ctx) };
}

/** Validation failure → 400 with the first issue's stable code. */
export function validationError(error: z.ZodError, ctx: { correlationId: string }): NextResponse {
  const issue = error.issues[0];
  const code = issue && /^[A-Z_]+$/.test(issue.message) ? issue.message : 'BAD_REQUEST';
  return meetingNoteError(400, code, ctx);
}

export function parseWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
  ctx: { correlationId: string }
): Result<z.infer<S>> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, response: validationError(parsed.error, ctx) };
}

/** A JSON object body of at most MEETING_NOTE_MAX_BODY_BYTES. */
export async function readJsonObject(request: Request, ctx: { correlationId: string }): Promise<Result<unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    await request.body?.cancel().catch(() => undefined);
    return { ok: false, response: meetingNoteError(415, 'UNSUPPORTED_MEDIA_TYPE', ctx) };
  }
  const body = await readBoundedBody(request, MEETING_NOTE_MAX_BODY_BYTES);
  if (!body.ok) {
    return {
      ok: false,
      response: meetingNoteError(body.reason === 'too_large' ? 413 : 400, body.reason === 'too_large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', ctx),
    };
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, response: meetingNoteError(400, 'BAD_REQUEST', ctx) };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, response: meetingNoteError(400, 'BAD_REQUEST', ctx) };
  }
}

/** 500 without SQL, details, or request data (they could carry note text). */
export function internalError(error: unknown, ctx: { correlationId: string }, context: string): NextResponse {
  const cause =
    error instanceof MeetingNoteDbError
      ? { code: error.sqlstate, message: error.token ?? 'unexpected database error' }
      : { message: error instanceof Error ? error.name : 'unknown' };
  return jsonError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', {
    correlationId: ctx.correlationId,
    cause,
    context,
  });
}

/** Maps a documented RPC refusal (other than a stale revision) to HTTP. */
function refusalResponse(error: MeetingNoteDbError, ctx: { correlationId: string }, context: string): NextResponse {
  const token = error.token;
  if (token === null) return internalError(error, ctx, context);
  switch (error.sqlstate) {
    case '42501':
      return meetingNoteError(403, token, ctx, context);
    case 'P0002':
      return meetingNoteError(404, token, ctx, context);
    case '22023':
      return meetingNoteError(token === 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE' ? 413 : 400, token, ctx, context);
    default:
      return internalError(error, ctx, context);
  }
}

function isStale(error: unknown, token: 'MEETING_NOTE_STALE_REVISION' | 'MEETING_NOTE_ITEM_STALE_REVISION'): error is MeetingNoteDbError {
  return error instanceof MeetingNoteDbError && error.sqlstate === 'P0001' && error.token === token;
}

/**
 * A failed note mutation → response. A stale revision → 409 carrying the
 * note's current state (read with the caller's session) so the UI can show it.
 */
export async function noteMutationErrorResponse(
  error: unknown,
  ctx: MeetingNoteRouteContext,
  noteId: string,
  context: string
): Promise<NextResponse> {
  if (isStale(error, 'MEETING_NOTE_STALE_REVISION')) {
    try {
      const current = await loadMeetingNoteDetail(ctx.repository, ctx.dbUser, noteId);
      if (!current) return notFound('MEETING_NOTE_NOT_FOUND', ctx);
      return conflict('MEETING_NOTE_STALE_REVISION', current.revision, { note: current }, ctx);
    } catch (loadError) {
      return internalError(loadError, ctx, `${context}.loadCurrent`);
    }
  }
  if (error instanceof MeetingNoteDbError) return refusalResponse(error, ctx, context);
  return internalError(error, ctx, context);
}

/** Same for an action-item mutation; the 409 carries the item's current state. */
export async function itemMutationErrorResponse(
  error: unknown,
  ctx: MeetingNoteRouteContext,
  itemId: string,
  companyId: string | null,
  context: string
): Promise<NextResponse> {
  if (isStale(error, 'MEETING_NOTE_ITEM_STALE_REVISION')) {
    try {
      const item = await ctx.repository.findActionItemById(itemId);
      if (!item) return notFound('MEETING_NOTE_ITEM_NOT_FOUND', ctx);
      const [view] = await loadActionItemViews(ctx.repository, companyId, [item]);
      return conflict('MEETING_NOTE_ITEM_STALE_REVISION', view.revision, { item: view }, ctx);
    } catch (loadError) {
      return internalError(loadError, ctx, `${context}.loadCurrent`);
    }
  }
  if (error instanceof MeetingNoteDbError) return refusalResponse(error, ctx, context);
  return internalError(error, ctx, context);
}

function conflict(
  code: 'MEETING_NOTE_STALE_REVISION' | 'MEETING_NOTE_ITEM_STALE_REVISION',
  currentRevision: number,
  current: Record<string, unknown>,
  ctx: { correlationId: string }
): NextResponse {
  return NextResponse.json(
    { error: messageFor(code), code, currentRevision, correlationId: ctx.correlationId, ...current },
    { status: 409, headers: { 'x-correlation-id': ctx.correlationId } }
  );
}

/**
 * The item addressed by /api/meeting-notes/[id]/items/[itemId], read with the
 * caller's session; 404 unless it is visible AND belongs to that note (the
 * item RPCs take only the item id, and an item's note_id is immutable).
 */
export async function resolveItemInNote(
  ctx: MeetingNoteRouteContext,
  rawNoteId: string | undefined,
  rawItemId: string | undefined
): Promise<Result<ActionItem>> {
  const noteId = parsePathId(rawNoteId, 'MEETING_NOTE_ITEM_NOT_FOUND', ctx);
  if (!noteId.ok) return noteId;
  const itemId = parsePathId(rawItemId, 'MEETING_NOTE_ITEM_NOT_FOUND', ctx);
  if (!itemId.ok) return itemId;
  try {
    const item = await ctx.repository.findActionItemById(itemId.value);
    if (!item || item.noteId !== noteId.value) {
      return { ok: false, response: notFound('MEETING_NOTE_ITEM_NOT_FOUND', ctx) };
    }
    return { ok: true, value: item };
  } catch (error) {
    return { ok: false, response: internalError(error, ctx, 'meetingNotes.item.resolve') };
  }
}

/** A success body with the correlation header. */
export function ok<T>(body: T, ctx: { correlationId: string }, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: { 'x-correlation-id': ctx.correlationId } });
}
