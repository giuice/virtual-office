// src/lib/meeting-notes/ai/processing.ts
// The server side of "Process transcript" after the start route verified the
// ticket and bound it to the authenticated application user (Phase 6 T12;
// SPEC FR-015, FR-016, FR-017, FR-020, FR-021, FR-022, FR-031, BR-013).
//
// Order (each step only after the previous one):
//   1. admission (service_role RPC, actor = the route's users.id): re-checks
//      current membership and editor rights FIRST, then replay / binding /
//      settings revision / source / limit, and reserves one unit. A replay
//      returns the stored status only — never a draft, never a dispatch.
//   2. normalize the transcript (FR-014) and run the FR-020 size preflight:
//      a refusal settles `released` (not counted) — nothing was sent.
//   3. client already gone → `released` (never sent).
//   4. mark dispatched; a refused transition (the stale job already failed
//      the operation) means the request is NOT sent.
//   5. exactly one provider request with the ADMITTED snapshot (provider,
//      model, reasoning level, key) — never the current settings — and an
//      AbortSignal tied to the client request plus the adapter deadline
//      (default 180 s, MEETING_NOTES_AI_TIMEOUT_MS; always far below the
//      10-minute stale job).
//   6. settlement, by outcome:
//        draft received, client still there, caller still a member and
//          editor, note still exists                → succeeded (counted),
//          recorded ONLY by finalize_meeting_note_ai_success, which re-checks
//          membership, editor rights, and note existence on locked rows
//          (actor users FOR KEY SHARE → note FOR UPDATE → operation) in the
//          same transaction that writes `succeeded`; it discards instead
//          when access was lost after the preliminary session read
//        draft received but the client left, or the caller lost access, or
//          the note is gone                         → discarded (counted)
//        processed_failure, client still there      → failed (counted)
//        processed_failure because the client left  → discarded (counted)
//        preprocessing_rejected (listed initial rejection) → refunded
//        never_sent after the dispatch mark (connection refused, cancelled
//          just before fetch)                       → refunded (`released`
//          is only valid from admitted)
//      A settlement that did not change the operation, or ended in another
//      status (e.g. the stale job failed it first), drops the draft.
//   Cancellation (FR-021/AC-034): the client signal is checked after EVERY
//   await that follows the provider call, up to the moment the finalization
//   request is sent; a cancellation seen there settles `discarded` (counted,
//   never refunded), so a replay reports `discarded`. Once the finalization
//   request was sent, that transaction alone decides the outcome: a
//   cancellation arriving while it runs or after it committed leaves
//   `succeeded` (the draft is still dropped, 499) — the database cannot
//   observe the closed connection. The usage returned with a draft comes
//   from the same finalization transaction; no read follows it.
// The decrypted key and the transcript live only in this call's memory; they
// are never logged, returned, or stored. Nothing here reads or writes note
// content: the draft is returned to the caller, and only Apply stores it.
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import { computeMeetingNoteRights } from '@/lib/meeting-notes/note-detail';
import { SupabaseMeetingNoteAiOperationRepository } from '@/repositories/implementations/supabase/SupabaseMeetingNoteAiOperationRepository';
import type { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import type {
  MeetingNoteAiAdmission,
  MeetingNoteAiReplay,
  MeetingNoteAiSuccessFinalization,
} from '@/repositories/interfaces/IMeetingNoteAiOperationRepository';
import type { User } from '@/types/database';
import type {
  MeetingNoteAiOperationStatus,
  MeetingNoteAiReviewDraft,
  MeetingNoteAiSettlementOutcome,
  MeetingNoteAiUsage,
} from '@/types/meeting-notes';

import {
  generateMeetingNoteDraft,
  MEETING_NOTE_AI_MAX_TIMEOUT_MS,
  preflightMeetingNoteAiTranscript,
  type MeetingNoteAiDraftFailure,
} from './adapters';
import { buildMeetingNoteAiReviewDraft } from './draft-review';
import { meetingNoteAiFailure, meetingNoteAiTooLongFailure } from './provider-errors';
import { meetingNoteAiTicketIssuedAt, type MeetingNoteAiTicketPayload } from './ticket';
import { normalizeTranscriptForProvider } from './transcript-normalizer';

/** Optional server-only override of the provider deadline (ms), clamped to 1 s – 300 s. */
export const MEETING_NOTES_AI_TIMEOUT_ENV = 'MEETING_NOTES_AI_TIMEOUT_MS';

function configuredTimeoutMs(): number | undefined {
  const raw = process.env[MEETING_NOTES_AI_TIMEOUT_ENV]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.floor(value), 1_000), MEETING_NOTE_AI_MAX_TIMEOUT_MS);
}

export interface MeetingNoteAiProcessingContext {
  correlationId: string;
  /** The user's server client (session cookies). */
  supabase: SupabaseClient;
  /** The user's repository (RLS). */
  repository: IMeetingNoteRepository;
  dbUser: User;
  /** Service-role client, built only after the route authenticated the user. */
  service: SupabaseClient;
}

export type MeetingNoteAiProcessingOutcome =
  /** Admission refused (expired, binding, rights, settings stale, source stale, limit, not configured). */
  | { kind: 'refused'; error: MeetingNoteDbError }
  /** The ticket's operation already exists: its status, no draft, no dispatch. */
  | { kind: 'replay'; replay: MeetingNoteAiReplay; usage: MeetingNoteAiUsage | null }
  /** FR-020 (or an out-of-matrix snapshot): refused before dispatch; released (not counted). */
  | { kind: 'preflight_refused'; operationId: string; status: MeetingNoteAiOperationStatus | null; failure: MeetingNoteAiDraftFailure; usage: MeetingNoteAiUsage | null }
  /** The client left before anything was sent; released. */
  | { kind: 'cancelled_before_send'; operationId: string; status: MeetingNoteAiOperationStatus | null }
  /** The operation could not be marked dispatched (already terminal); nothing sent. */
  | { kind: 'not_dispatchable'; operationId: string; status: MeetingNoteAiOperationStatus | null }
  /** The provider call failed; settled per its counting class. */
  | { kind: 'provider_failure'; operationId: string; status: MeetingNoteAiOperationStatus | null; failure: MeetingNoteAiDraftFailure; usage: MeetingNoteAiUsage | null }
  /** The client left after dispatch: discarded (counted), no draft. */
  | { kind: 'client_gone'; operationId: string; status: MeetingNoteAiOperationStatus | null }
  /** The caller lost membership/editor rights, or the note is gone: discarded, no draft. */
  | { kind: 'access_lost'; operationId: string; status: MeetingNoteAiOperationStatus | null; reason: 'not_found' | 'forbidden' }
  /** The settlement did not record success (e.g. the stale job failed it first): no draft. */
  | { kind: 'settled_elsewhere'; operationId: string; status: MeetingNoteAiOperationStatus | null }
  | {
      kind: 'succeeded';
      operationId: string;
      sourceRevision: number;
      transcriptId: string;
      draft: MeetingNoteAiReviewDraft;
      usage: MeetingNoteAiUsage | null;
    };

function logEvent(event: string, fields: Record<string, unknown>): void {
  // Identifiers and codes only — never the key, the transcript, or provider text.
  console.info(JSON.stringify({ event, ...fields }));
}

async function ownUsage(ctx: MeetingNoteAiProcessingContext): Promise<MeetingNoteAiUsage | null> {
  try {
    const usage = await new SupabaseMeetingNoteAiOperationRepository(ctx.supabase).getOwnCompanyUsage();
    return { limit: usage.limit, used: usage.used, usageDay: usage.usageDay, resetAt: usage.resetAt };
  } catch {
    // A removed member has no company usage to read; the response carries none.
    return null;
  }
}

/**
 * Settles the operation; returns the resulting status and whether this call
 * recorded `outcome`. A failing settlement is logged (ids only) and reported
 * as not recorded: the stale job then fails the operation (counted).
 */
async function settle(
  ctx: MeetingNoteAiProcessingContext,
  operations: SupabaseMeetingNoteAiOperationRepository,
  operationId: string,
  outcome: MeetingNoteAiSettlementOutcome
): Promise<{ status: MeetingNoteAiOperationStatus | null; recorded: boolean }> {
  try {
    const result = await operations.settle(operationId, outcome);
    return { status: result.status, recorded: result.changed && result.status === outcome };
  } catch (error) {
    // A refused transition still reports the operation's current status
    // (e.g. `released` refused because the dispatch mark committed).
    if (error instanceof MeetingNoteDbError && error.token === 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION') {
      const status = error.detail?.status;
      if (typeof status === 'string') {
        return { status: status as MeetingNoteAiOperationStatus, recorded: false };
      }
    }
    logEvent('meeting_notes_ai_settle_failed', {
      correlationId: ctx.correlationId,
      operationId,
      outcome,
      sqlstate: error instanceof MeetingNoteDbError ? error.sqlstate : undefined,
    });
    return { status: null, recorded: false };
  }
}

interface AccessCheck {
  ok: true;
  members: Array<{ userId: string; displayName: string }>;
  items: Array<{ id: string; description: string }>;
}

/**
 * FR-021 preliminary check: the caller must still be a member of the note's
 * company with editor rights, and the note must still exist. Read with the
 * caller's session (RLS hides the note from a removed member); also loads
 * what the review draft needs (current members, existing items). Access can
 * still be lost after this read, so success is recorded only by the atomic
 * finalization, which repeats the check on locked rows.
 */
async function recheckAccess(
  ctx: MeetingNoteAiProcessingContext,
  noteId: string
): Promise<AccessCheck | { ok: false; reason: 'not_found' | 'forbidden' }> {
  const { data: fresh, error } = await ctx.supabase
    .from('users')
    .select('id, company_id, role')
    .eq('id', ctx.dbUser.id)
    .maybeSingle<{ id: string; company_id: string | null; role: User['role'] }>();
  if (error) throw new MeetingNoteDbError(error.code, error.message, error.details);
  if (!fresh || !fresh.company_id) return { ok: false, reason: 'not_found' };

  const note = await ctx.repository.findById(noteId);
  if (!note || note.companyId !== fresh.company_id) return { ok: false, reason: 'not_found' };

  const participants = await ctx.repository.findParticipants(noteId);
  const rights = computeMeetingNoteRights(
    { id: fresh.id, companyId: fresh.company_id, role: fresh.role },
    note,
    participants.map((participant) => participant.userId)
  );
  if (!rights.canEdit) return { ok: false, reason: 'forbidden' };

  const [members, items] = await Promise.all([
    ctx.repository.listCurrentMembers(fresh.company_id),
    ctx.repository.findActionItems(noteId),
  ]);
  return { ok: true, members, items: items.map((item) => ({ id: item.id, description: item.description })) };
}

/**
 * Runs admission → preflight → one dispatch → settlement for a VERIFIED
 * ticket whose user/company/note already equal the authenticated caller's.
 */
export async function runMeetingNoteAiProcessing(
  ctx: MeetingNoteAiProcessingContext,
  ticket: MeetingNoteAiTicketPayload,
  signal: AbortSignal
): Promise<MeetingNoteAiProcessingOutcome> {
  const operations = new SupabaseMeetingNoteAiOperationRepository(ctx.service);

  let admitted: MeetingNoteAiAdmission | MeetingNoteAiReplay;
  try {
    admitted = await operations.admit({
      actorUserId: ctx.dbUser.id,
      companyId: ticket.companyId,
      noteId: ticket.noteId,
      idempotencyKey: ticket.idempotencyKey,
      ticketIssuedAt: meetingNoteAiTicketIssuedAt(ticket),
      sourceRevision: ticket.sourceRevision,
      transcriptId: ticket.transcriptId,
      settingsRevision: ticket.settingsRevision,
    });
  } catch (error) {
    if (error instanceof MeetingNoteDbError && error.token !== null) return { kind: 'refused', error };
    throw error;
  }

  if (admitted.replay) {
    return { kind: 'replay', replay: admitted, usage: await ownUsage(ctx) };
  }

  const admission = admitted;
  const operationId = admission.operationId;
  let marked = false;
  let settled = false;
  try {
    const transcript = normalizeTranscriptForProvider(admission.transcript);

    const preflight = preflightMeetingNoteAiTranscript({
      provider: admission.provider,
      model: admission.model,
      transcript,
    });
    if (!preflight.ok) {
      const result = await settle(ctx, operations, operationId, 'released');
      settled = true;
      // A snapshot outside the matrix (settings saved under an older matrix)
      // is a never-sent configuration error; nothing is sent either way.
      const failure =
        preflight.code === 'MEETING_NOTE_AI_TRANSCRIPT_TOO_LONG_FOR_MODEL'
          ? meetingNoteAiTooLongFailure(admission.provider, preflight)
          : meetingNoteAiFailure(admission.provider, 'MEETING_NOTE_AI_CONFIGURATION_INVALID', false);
      return { kind: 'preflight_refused', operationId, status: result.status, failure, usage: await ownUsage(ctx) };
    }

    if (signal.aborted) {
      const result = await settle(ctx, operations, operationId, 'released');
      settled = true;
      return { kind: 'cancelled_before_send', operationId, status: result.status };
    }

    try {
      await operations.markDispatched(operationId);
      marked = true;
    } catch (error) {
      if (error instanceof MeetingNoteDbError && error.token === 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION') {
        settled = true;
        const status = error.detail?.status;
        return {
          kind: 'not_dispatchable',
          operationId,
          status: typeof status === 'string' ? (status as MeetingNoteAiOperationStatus) : null,
        };
      }
      throw error;
    }

    const result = await generateMeetingNoteDraft({
      provider: admission.provider,
      model: admission.model,
      reasoningLevel: admission.reasoningLevel,
      apiKey: admission.apiKey,
      transcript,
      signal,
      timeoutMs: configuredTimeoutMs(),
    });

    if (!result.ok) {
      const clientLeft = signal.aborted && result.kind === 'processed_failure';
      const outcome: MeetingNoteAiSettlementOutcome =
        result.kind === 'processed_failure' ? (clientLeft ? 'discarded' : 'failed') : 'refunded';
      const settlement = await settle(ctx, operations, operationId, outcome);
      settled = true;
      logEvent('meeting_notes_ai_processing_failed', {
        correlationId: ctx.correlationId,
        operationId,
        kind: result.kind,
        code: result.code,
        status: settlement.status,
      });
      if (clientLeft) return { kind: 'client_gone', operationId, status: settlement.status };
      return { kind: 'provider_failure', operationId, status: settlement.status, failure: result, usage: await ownUsage(ctx) };
    }

    if (signal.aborted) {
      const settlement = await settle(ctx, operations, operationId, 'discarded');
      settled = true;
      return { kind: 'client_gone', operationId, status: settlement.status };
    }

    // Preliminary read with the caller's session: an early exit when access
    // is already gone, and the roster/items the review draft needs. It is NOT
    // the authorization of the result — the finalization below is.
    let access: Awaited<ReturnType<typeof recheckAccess>>;
    try {
      access = await recheckAccess(ctx, ticket.noteId);
    } catch (error) {
      await settle(ctx, operations, operationId, 'discarded');
      settled = true;
      throw error;
    }
    if (signal.aborted) {
      // Left while access was being read: nothing has been finalized yet.
      const settlement = await settle(ctx, operations, operationId, 'discarded');
      settled = true;
      return { kind: 'client_gone', operationId, status: settlement.status };
    }
    if (!access.ok) {
      const settlement = await settle(ctx, operations, operationId, 'discarded');
      settled = true;
      return { kind: 'access_lost', operationId, status: settlement.status, reason: access.reason };
    }

    const draft = buildMeetingNoteAiReviewDraft(result.draft, access.members, access.items);

    let finalization: MeetingNoteAiSuccessFinalization;
    try {
      finalization = await operations.finalizeSuccess(operationId, ctx.dbUser.id);
    } catch (error) {
      // Unknown whether it committed: never return the draft. `discarded` is a
      // no-op when the finalization did commit (a terminal operation never
      // changes), so the stored outcome is whichever committed first.
      logEvent('meeting_notes_ai_finalize_failed', {
        correlationId: ctx.correlationId,
        operationId,
        sqlstate: error instanceof MeetingNoteDbError ? error.sqlstate : undefined,
      });
      const settlement = await settle(ctx, operations, operationId, 'discarded');
      settled = true;
      return { kind: 'settled_elsewhere', operationId, status: settlement.status };
    }
    settled = true;
    if (finalization.changed && finalization.status === 'discarded' && finalization.access !== 'ok') {
      return { kind: 'access_lost', operationId, status: finalization.status, reason: finalization.access };
    }
    if (!finalization.changed || finalization.status !== 'succeeded' || finalization.access !== 'ok') {
      return { kind: 'settled_elsewhere', operationId, status: finalization.status };
    }
    if (signal.aborted) {
      // Left while the finalization ran or after it committed: the draft is
      // dropped; the operation stays `succeeded` (counted either way).
      return { kind: 'client_gone', operationId, status: finalization.status };
    }
    return {
      kind: 'succeeded',
      operationId,
      sourceRevision: admission.sourceRevision,
      transcriptId: admission.transcriptId,
      draft,
      usage: finalization.usage,
    };
  } finally {
    if (!settled) {
      // An unexpected error: never leave the reservation without an outcome
      // when one can be recorded (released before the dispatch mark, failed
      // after it — counted, as the request may have left).
      if (marked) {
        await settle(ctx, operations, operationId, 'failed');
      } else {
        // The provider was never called. If the dispatch mark committed but
        // its reply was lost, `released` is refused (valid only from
        // admitted): nothing was sent, so the operation is refunded.
        const released = await settle(ctx, operations, operationId, 'released');
        if (released.status === 'dispatched') await settle(ctx, operations, operationId, 'refunded');
      }
    }
  }
}
