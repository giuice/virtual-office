// src/app/api/meeting-notes/[id]/ai/process/route.ts
// Start of AI processing (Phase 6 T12; SPEC FR-015–FR-017, FR-020–FR-022,
// FR-031, BR-013).
//
// POST, body { ticket, idempotencyKey? }. In order:
//   1. origin guard, session (auth.getUser → users.supabase_uid), rate limit
//      (beginMeetingNoteMutation);
//   2. the ticket's signature and 24-hour validity (its key included) BEFORE
//      any operation lookup: an expired ticket is refused whether or not an
//      operation record still exists, and is never dispatched;
//   3. the ticket's user, company, and note must be the authenticated
//      application user's (users.id), their CURRENT company, and the path
//      note; a client-sent key must equal the ticket's;
//   4. admission, dispatch, and settlement (src/lib/meeting-notes/ai/processing.ts):
//      the service-role client is built only now, after steps 1–3, and the
//      actor passed to admission is the route's users.id.
// Responses never contain the API key, the transcript, provider text, or the
// ticket secret. A replay returns the operation's status only (operations
// keep no content). Error bodies carry a stable `code` and a sanitized
// message; provider failures carry `retryable` ("Try again" = a new ticket
// and a new admission).
import { NextRequest, NextResponse } from 'next/server';

import { MEETING_NOTE_AI_CAPABILITIES } from '@/lib/meeting-notes/ai/capabilities';
import { runMeetingNoteAiProcessing, type MeetingNoteAiProcessingOutcome } from '@/lib/meeting-notes/ai/processing';
import { MeetingNoteAiTicketConfigError, verifyMeetingNoteAiTicket } from '@/lib/meeting-notes/ai/ticket';
import type { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import {
  beginMeetingNoteMutation,
  internalError,
  meetingNoteError,
  meetingNoteErrorWithData,
  notFound,
  ok,
  parsePathId,
  parseWith,
  readJsonObject,
  type MeetingNoteRouteContext,
} from '@/lib/meeting-notes/route-support';
import { startMeetingNoteAiProcessingBodySchema } from '@/lib/meeting-notes/validation';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import type { MeetingNoteAiProcessResponse, MeetingNoteAiProvider } from '@/types/meeting-notes';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PATH = '/api/meeting-notes/[id]/ai/process';
/** Client closed the request (nginx convention); the browser never reads it. */
const CLIENT_CLOSED_STATUS = 499;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isProvider(value: unknown): value is MeetingNoteAiProvider {
  return typeof value === 'string' && Object.hasOwn(MEETING_NOTE_AI_CAPABILITIES, value);
}

/** Admission refusal → HTTP, with the non-sensitive hints the UI needs. */
function admissionRefusal(error: MeetingNoteDbError, ctx: MeetingNoteRouteContext): NextResponse {
  const detail = error.detail ?? {};
  switch (error.token) {
    case 'MEETING_NOTE_AI_TICKET_EXPIRED':
      return meetingNoteError(410, error.token, ctx);
    case 'MEETING_NOTE_AI_BINDING_MISMATCH':
      return meetingNoteError(409, error.token, ctx);
    case 'MEETING_NOTE_AI_NOT_CONFIGURED':
      return meetingNoteErrorWithData(409, error.token, ctx, { canConfigure: ctx.dbUser.role === 'admin' });
    case 'MEETING_NOTE_AI_SETTINGS_STALE': {
      const provider = detail.provider;
      return meetingNoteErrorWithData(409, error.token, ctx, {
        // FR-015: the NEW notice (provider name) the user must see before processing.
        settings: {
          provider: isProvider(provider) ? provider : null,
          providerLabel: isProvider(provider) ? MEETING_NOTE_AI_CAPABILITIES[provider].label : null,
          model: str(detail.model),
          reasoningLevel: str(detail.reasoning_level),
          revision: num(detail.current_revision),
        },
      });
    }
    case 'MEETING_NOTE_AI_SOURCE_STALE':
      return meetingNoteErrorWithData(409, error.token, ctx, {
        currentRevision: num(detail.current_revision),
        transcriptId: str(detail.transcript_id),
      });
    case 'MEETING_NOTE_AI_LIMIT_REACHED': {
      const resetAt = str(detail.reset_at);
      return meetingNoteErrorWithData(429, error.token, ctx, {
        limit: num(detail.limit),
        used: num(detail.used),
        usageDay: str(detail.usage_day),
        resetAt: resetAt ? new Date(resetAt).toISOString() : null,
      });
    }
    case 'MEETING_NOTE_NOT_FOUND':
      return notFound('MEETING_NOTE_NOT_FOUND', ctx);
    case 'MEETING_NOTE_FORBIDDEN':
      return meetingNoteError(403, error.token, ctx, 'meetingNotes.aiProcess.authorize');
    default:
      return internalError(error, ctx, 'meetingNotes.aiProcess.admit');
  }
}

function withData(status: number, code: string, message: string, ctx: MeetingNoteRouteContext, data: Record<string, unknown>) {
  return NextResponse.json(
    { error: message, code, correlationId: ctx.correlationId, ...data },
    { status, headers: { 'x-correlation-id': ctx.correlationId } }
  );
}

function outcomeResponse(
  outcome: MeetingNoteAiProcessingOutcome,
  ctx: MeetingNoteRouteContext,
  binding: { sourceRevision: number; transcriptId: string }
): NextResponse {
  switch (outcome.kind) {
    case 'refused':
      return admissionRefusal(outcome.error, ctx);
    case 'replay': {
      const body: MeetingNoteAiProcessResponse = {
        operationId: outcome.replay.operationId,
        status: outcome.replay.status,
        replay: true,
        sourceRevision: binding.sourceRevision,
        transcriptId: binding.transcriptId,
        draft: null,
        usage: outcome.usage,
      };
      return ok(body, ctx);
    }
    case 'preflight_refused':
      return withData(422, outcome.failure.code, outcome.failure.message, ctx, {
        operationId: outcome.operationId,
        status: outcome.status,
        retryable: outcome.failure.retryable,
        estimatedInputTokens: outcome.failure.estimatedInputTokens ?? null,
        maxInputTokens: outcome.failure.maxInputTokens ?? null,
        usage: outcome.usage,
      });
    case 'cancelled_before_send':
    case 'client_gone':
      return meetingNoteErrorWithData(CLIENT_CLOSED_STATUS, 'MEETING_NOTE_AI_CANCELLED', ctx, {
        operationId: outcome.operationId,
        status: outcome.status,
      });
    case 'not_dispatchable':
      return meetingNoteErrorWithData(409, 'MEETING_NOTE_AI_OPERATION_ENDED', ctx, {
        operationId: outcome.operationId,
        status: outcome.status,
        retryable: true,
      });
    case 'provider_failure':
      return withData(502, outcome.failure.code, outcome.failure.message, ctx, {
        operationId: outcome.operationId,
        status: outcome.status,
        retryable: outcome.failure.retryable,
        usage: outcome.usage,
      });
    case 'access_lost':
      return outcome.reason === 'not_found'
        ? meetingNoteErrorWithData(404, 'MEETING_NOTE_NOT_FOUND', ctx, { operationId: outcome.operationId, status: outcome.status })
        : meetingNoteErrorWithData(403, 'MEETING_NOTE_FORBIDDEN', ctx, { operationId: outcome.operationId, status: outcome.status });
    case 'settled_elsewhere':
      return meetingNoteErrorWithData(409, 'MEETING_NOTE_AI_DRAFT_DISCARDED', ctx, {
        operationId: outcome.operationId,
        status: outcome.status,
        retryable: true,
      });
    case 'succeeded': {
      const body: MeetingNoteAiProcessResponse = {
        operationId: outcome.operationId,
        status: 'succeeded',
        replay: false,
        sourceRevision: outcome.sourceRevision,
        transcriptId: outcome.transcriptId,
        draft: outcome.draft,
        usage: outcome.usage,
      };
      return ok(body, ctx);
    }
  }
}

/**
 * POST /api/meeting-notes/[id]/ai/process { ticket, idempotencyKey? }
 * 200 MeetingNoteAiProcessResponse — a new operation's draft, or a replay's status (no draft).
 * 400 MEETING_NOTE_AI_TICKET_INVALID (malformed, bad signature, issued in the future);
 * 410 MEETING_NOTE_AI_TICKET_EXPIRED; 409 MEETING_NOTE_AI_BINDING_MISMATCH;
 * 404 MEETING_NOTE_NOT_FOUND / 403 MEETING_NOTE_FORBIDDEN (also when access was lost while processing);
 * 409 MEETING_NOTE_AI_NOT_CONFIGURED {canConfigure} / _SETTINGS_STALE {settings} / _SOURCE_STALE {currentRevision, transcriptId}
 *     / _OPERATION_ENDED / _DRAFT_DISCARDED;
 * 429 MEETING_NOTE_AI_LIMIT_REACHED {limit, used, usageDay, resetAt};
 * 422 MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL (FR-020; not counted);
 * 502 provider failure codes (src/lib/meeting-notes/ai/provider-errors.ts) {retryable, status, usage};
 * 499 MEETING_NOTE_AI_CANCELLED (the client left); 503 MEETING_NOTE_AI_UNAVAILABLE (ticket secret missing).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const begun = await beginMeetingNoteMutation(request, PATH, 'meeting-note:ai-process');
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
  const body = parseWith(startMeetingNoteAiProcessingBodySchema, raw.value, ctx);
  if (!body.ok) return body.response;

  // 2. Signature and expiry first: no operation is looked up for a bad or old ticket.
  let verified;
  try {
    verified = verifyMeetingNoteAiTicket(body.value.ticket);
  } catch (error) {
    if (error instanceof MeetingNoteAiTicketConfigError) {
      console.error(JSON.stringify({ event: 'meeting_notes_ticket_secret_unconfigured', correlationId: ctx.correlationId }));
      return meetingNoteError(503, 'MEETING_NOTE_AI_UNAVAILABLE', ctx, 'meetingNotes.aiProcess.config');
    }
    return internalError(error, ctx, 'meetingNotes.aiProcess.ticket');
  }
  if (!verified.ok) {
    return verified.reason === 'expired'
      ? meetingNoteError(410, 'MEETING_NOTE_AI_TICKET_EXPIRED', ctx)
      : meetingNoteError(400, 'MEETING_NOTE_AI_TICKET_INVALID', ctx);
  }
  const ticket = verified.payload;

  // 3. The ticket must belong to this caller, their current company, and this note.
  if (ticket.userId !== ctx.dbUser.id) {
    return meetingNoteError(409, 'MEETING_NOTE_AI_BINDING_MISMATCH', ctx, 'meetingNotes.aiProcess.binding');
  }
  if (!ctx.dbUser.companyId || ticket.companyId !== ctx.dbUser.companyId) {
    return notFound('MEETING_NOTE_NOT_FOUND', ctx);
  }
  if (
    ticket.noteId.toLowerCase() !== id.value.toLowerCase() ||
    (body.value.idempotencyKey !== undefined && body.value.idempotencyKey.toLowerCase() !== ticket.idempotencyKey.toLowerCase())
  ) {
    return meetingNoteError(409, 'MEETING_NOTE_AI_BINDING_MISMATCH', ctx, 'meetingNotes.aiProcess.binding');
  }

  // 4. Server-only RPCs, after the caller was authorized above.
  try {
    const service = await createSupabaseServerClient('service_role');
    const outcome = await runMeetingNoteAiProcessing({ ...ctx, service }, ticket, request.signal);
    return outcomeResponse(outcome, ctx, { sourceRevision: ticket.sourceRevision, transcriptId: ticket.transcriptId });
  } catch (error) {
    return internalError(error, ctx, 'meetingNotes.aiProcess');
  }
}
