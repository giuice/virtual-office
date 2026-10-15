// src/repositories/implementations/supabase/SupabaseMeetingNoteAiOperationRepository.ts
// AI usage and processing operations (Phase 6 T9; migration 20261013154823).
// Construct with the user's server client for getOwnCompanyUsage (RPC granted
// to authenticated, scoped to the caller's company), and with the
// service-role client for admit / markDispatched / settle / finalizeSuccess (service_role-only
// RPCs), only after the route authorized the application user. Server-only:
// an admission carries a decrypted API key and the transcript text.
// Deliberately not re-exported from the implementations index, which client
// code may import.
import 'server-only';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import type {
  AdmitMeetingNoteAiOperationParams,
  IMeetingNoteAiOperationRepository,
  MeetingNoteAiAdmission,
  MeetingNoteAiCompanyUsage,
  MeetingNoteAiOperationTransition,
  MeetingNoteAiReplay,
  MeetingNoteAiFinalizationAccess,
  MeetingNoteAiSettlement,
  MeetingNoteAiSuccessFinalization,
} from '@/repositories/interfaces/IMeetingNoteAiOperationRepository';
import type {
  MeetingNoteAiOperationStatus,
  MeetingNoteAiProvider,
  MeetingNoteAiSettlementOutcome,
  MeetingNoteAiUsage,
} from '@/types/meeting-notes';

const PROVIDERS: ReadonlySet<string> = new Set<MeetingNoteAiProvider>(['anthropic', 'openai', 'kimi', 'glm']);
const STATUSES: ReadonlySet<string> = new Set<MeetingNoteAiOperationStatus>([
  'admitted',
  'dispatched',
  'succeeded',
  'failed',
  'discarded',
  'refunded',
  'released',
]);

type Row = Record<string, unknown>;

function toDbError(error: PostgrestError): MeetingNoteDbError {
  return new MeetingNoteDbError(error.code, error.message, error.details);
}

/** A fixed message: never the payload (it could carry the key or transcript). */
function invalidShape(what: string): MeetingNoteDbError {
  return new MeetingNoteDbError(undefined, `${what} returned an unexpected shape`, null);
}

function asRow(data: unknown, what: string): Row {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidShape(what);
  return data as Row;
}

function str(row: Row, key: string, what: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw invalidShape(what);
  return value;
}

function int(row: Row, key: string, what: string): number {
  const raw = row[key];
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalidShape(what);
  return value;
}

function bool(row: Row, key: string, what: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') throw invalidShape(what);
  return value;
}

function provider(row: Row, what: string): MeetingNoteAiProvider {
  const value = row.provider;
  if (typeof value !== 'string' || !PROVIDERS.has(value)) throw invalidShape(what);
  return value as MeetingNoteAiProvider;
}

function status(row: Row, what: string): MeetingNoteAiOperationStatus {
  const value = row.status;
  if (typeof value !== 'string' || !STATUSES.has(value)) throw invalidShape(what);
  return value as MeetingNoteAiOperationStatus;
}

function usage(row: Row, what: string): MeetingNoteAiUsage {
  return {
    limit: int(row, 'limit', what),
    used: int(row, 'used', what),
    usageDay: str(row, 'usage_day', what),
    resetAt: new Date(str(row, 'reset_at', what)).toISOString(),
  };
}

const ACCESS: ReadonlySet<string> = new Set<MeetingNoteAiFinalizationAccess>(['ok', 'not_found', 'forbidden']);

function settlement(row: Row, what: string): MeetingNoteAiSettlement {
  return {
    operationId: str(row, 'operation_id', what),
    status: status(row, what),
    changed: bool(row, 'changed', what),
    counted: bool(row, 'counted', what),
    admissionDay: str(row, 'admission_day', what),
  };
}

export class SupabaseMeetingNoteAiOperationRepository implements IMeetingNoteAiOperationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOwnCompanyUsage(): Promise<MeetingNoteAiCompanyUsage> {
    const what = 'get_meeting_note_ai_usage';
    const { data, error } = await this.supabase.rpc(what);
    if (error) throw toDbError(error);
    const row = asRow(data, what);
    return {
      configured: bool(row, 'configured', what),
      ...usage({ ...row, limit: row.daily_limit }, what),
    };
  }

  async admit(params: AdmitMeetingNoteAiOperationParams): Promise<MeetingNoteAiAdmission | MeetingNoteAiReplay> {
    const what = 'admit_meeting_note_ai_operation';
    const { data, error } = await this.supabase.rpc(what, {
      p_actor_user_id: params.actorUserId,
      p_company_id: params.companyId,
      p_note_id: params.noteId,
      p_idempotency_key: params.idempotencyKey,
      p_ticket_issued_at: params.ticketIssuedAt,
      p_source_revision: params.sourceRevision,
      p_transcript_id: params.transcriptId,
      p_settings_revision: params.settingsRevision,
    });
    if (error) throw toDbError(error);
    const row = asRow(data, what);
    const base = {
      operationId: str(row, 'operation_id', what),
      admissionDay: str(row, 'admission_day', what),
      provider: provider(row, what),
      model: str(row, 'model', what),
      reasoningLevel: str(row, 'reasoning_level', what),
      settingsRevision: int(row, 'settings_revision', what),
    };
    if (bool(row, 'replay', what)) {
      return { replay: true, status: status(row, what), ...base };
    }
    if (status(row, what) !== 'admitted') throw invalidShape(what);
    return {
      replay: false,
      status: 'admitted',
      ...base,
      sourceRevision: int(row, 'source_revision', what),
      transcriptId: str(row, 'transcript_id', what),
      apiKey: str(row, 'api_key', what),
      transcript: str(row, 'transcript', what),
      usage: usage(asRow(row.usage, what), what),
    };
  }

  async markDispatched(operationId: string): Promise<MeetingNoteAiOperationTransition> {
    const what = 'mark_meeting_note_ai_operation_dispatched';
    const { data, error } = await this.supabase.rpc(what, { p_operation_id: operationId });
    if (error) throw toDbError(error);
    const row = asRow(data, what);
    return { operationId: str(row, 'operation_id', what), status: status(row, what), changed: bool(row, 'changed', what) };
  }

  async settle(operationId: string, outcome: MeetingNoteAiSettlementOutcome): Promise<MeetingNoteAiSettlement> {
    const what = 'settle_meeting_note_ai_operation';
    const { data, error } = await this.supabase.rpc(what, { p_operation_id: operationId, p_outcome: outcome });
    if (error) throw toDbError(error);
    return settlement(asRow(data, what), what);
  }

  async finalizeSuccess(operationId: string, actorUserId: string): Promise<MeetingNoteAiSuccessFinalization> {
    const what = 'finalize_meeting_note_ai_success';
    const { data, error } = await this.supabase.rpc(what, { p_operation_id: operationId, p_actor_user_id: actorUserId });
    if (error) throw toDbError(error);
    const row = asRow(data, what);
    const access = row.access;
    if (typeof access !== 'string' || !ACCESS.has(access)) throw invalidShape(what);
    const result: MeetingNoteAiSuccessFinalization = {
      ...settlement(row, what),
      access: access as MeetingNoteAiFinalizationAccess,
      usage: row.usage === null || row.usage === undefined ? null : usage(asRow(row.usage, what), what),
    };
    // Success is only ever reported together with a confirmed access.
    if (result.status === 'succeeded' && result.changed && (result.access !== 'ok' || result.usage === null)) {
      throw invalidShape(what);
    }
    return result;
  }
}
