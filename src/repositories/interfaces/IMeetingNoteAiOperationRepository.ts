// src/repositories/interfaces/IMeetingNoteAiOperationRepository.ts
// AI usage and processing operations (Phase 6 T9; migration 20261013154823).
// The usage read runs under the caller's session (own company only); admit,
// markDispatched, settle, and finalizeSuccess are service_role-only RPCs called by server code
// AFTER the route authorized the application user and verified the ticket.
import type {
  MeetingNoteAiOperationStatus,
  MeetingNoteAiProvider,
  MeetingNoteAiSettlementOutcome,
  MeetingNoteAiUsage,
} from '@/types/meeting-notes';

export interface AdmitMeetingNoteAiOperationParams {
  /** Server-derived application users.id of the authenticated requester. */
  actorUserId: string;
  companyId: string;
  noteId: string;
  /** The server-generated key embedded in the verified ticket. */
  idempotencyKey: string;
  /** The ticket's issue time (ISO). */
  ticketIssuedAt: string;
  sourceRevision: number;
  transcriptId: string;
  settingsRevision: number;
}

/** A new admission: the snapshot, key, and transcript from ONE transaction (server code only). */
export interface MeetingNoteAiAdmission {
  replay: false;
  operationId: string;
  status: 'admitted';
  admissionDay: string;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  settingsRevision: number;
  sourceRevision: number;
  transcriptId: string;
  /** Decrypted provider key; never returned to a client or logged. */
  apiKey: string;
  /** The bound transcript text; never logged. */
  transcript: string;
  usage: MeetingNoteAiUsage;
}

/** A replay of an existing operation: its stored status only (no key, no transcript, nothing reserved). */
export interface MeetingNoteAiReplay {
  replay: true;
  operationId: string;
  status: MeetingNoteAiOperationStatus;
  admissionDay: string;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  settingsRevision: number;
}

export interface MeetingNoteAiOperationTransition {
  operationId: string;
  status: MeetingNoteAiOperationStatus;
  /** false when the call found the operation already in that (or a terminal) state. */
  changed: boolean;
}

export interface MeetingNoteAiSettlement extends MeetingNoteAiOperationTransition {
  /** Whether the operation counts toward its admission day's limit. */
  counted: boolean;
  admissionDay: string;
}

/** Access re-checked on locked rows by the success finalization. */
export type MeetingNoteAiFinalizationAccess = 'ok' | 'not_found' | 'forbidden';

/**
 * The atomic success finalization (migration 20261013191330): `succeeded`
 * with changed=true only when the actor was still a member and editor and the
 * note still existed under the locks; otherwise `discarded` (access lost) or
 * the unchanged terminal status. `usage` is the company's usage for today,
 * only when access = 'ok'.
 */
export interface MeetingNoteAiSuccessFinalization extends MeetingNoteAiSettlement {
  access: MeetingNoteAiFinalizationAccess;
  usage: MeetingNoteAiUsage | null;
}

export interface MeetingNoteAiCompanyUsage extends MeetingNoteAiUsage {
  configured: boolean;
}

export interface IMeetingNoteAiOperationRepository {
  /** The caller's own company usage for today (user session client). */
  getOwnCompanyUsage(): Promise<MeetingNoteAiCompanyUsage>;
  /** Admission or replay (service-role client). Refusals throw MeetingNoteDbError with a token. */
  admit(params: AdmitMeetingNoteAiOperationParams): Promise<MeetingNoteAiAdmission | MeetingNoteAiReplay>;
  /** Records that the one provider request is being sent (service-role client). */
  markDispatched(operationId: string): Promise<MeetingNoteAiOperationTransition>;
  /** Settles the operation once (service-role client); a terminal operation is returned unchanged. */
  settle(operationId: string, outcome: MeetingNoteAiSettlementOutcome): Promise<MeetingNoteAiSettlement>;
  /**
   * Records success ONLY if the actor still has editor access to the
   * existing note, in one transaction under actor → note → operation locks;
   * otherwise discards (counted). Service-role client.
   */
  finalizeSuccess(operationId: string, actorUserId: string): Promise<MeetingNoteAiSuccessFinalization>;
}
