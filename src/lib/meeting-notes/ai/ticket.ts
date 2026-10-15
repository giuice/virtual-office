// src/lib/meeting-notes/ai/ticket.ts
// Signed processing tickets for the meeting-note AI flow (Phase 6 T9; FR-015,
// FR-031). A ticket is issued by the server when the provider notice is shown
// and is presented by the start request. It carries its issue time, a
// SERVER-GENERATED idempotency key, and the binding (application user,
// company, note, source note revision, transcript identity, AI settings
// revision), signed with HMAC-SHA256. A client can neither choose a key nor
// move a key to a new ticket: changing any byte invalidates the signature.
//
// Format: "mnt1.<base64url(canonical JSON payload)>.<base64url(HMAC-SHA256)>",
// the MAC computed over "mnt1.<payload segment>".
//
// Secrets (server-only environment, never NEXT_PUBLIC_):
//   MEETING_NOTES_TICKET_SECRET           required, >= 32 bytes with >= 16 distinct
//                                         bytes (random); signs and verifies.
//   MEETING_NOTES_TICKET_SECRET_PREVIOUS  optional, >= 32 bytes when set; verifies
//                                         only, so a rotation keeps outstanding
//                                         tickets valid for their 24 hours.
// There is no fallback: a missing or short secret raises
// MeetingNoteAiTicketConfigError (callers answer with a configuration error).
// Neither secret is ever logged or included in an error message.
import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const PREFIX = 'mnt1';
const VERSION = 1;
/** A ticket and its idempotency key are valid for 24 hours after issuance. */
export const MEETING_NOTE_AI_TICKET_TTL_SECONDS = 24 * 60 * 60;
/** Accepted clock skew for an issue time in the future. */
const MAX_FUTURE_SKEW_SECONDS = 60;
const MIN_SECRET_BYTES = 32;
/** A random 32+ byte secret has far more distinct bytes; fewer means a placeholder or a typed word. */
const MIN_SECRET_DISTINCT_BYTES = 16;
/** A real ticket is ~450 characters; anything far longer is not a ticket. */
const MAX_TICKET_LENGTH = 2_048;
const MAC_BYTES = 32;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

export const MEETING_NOTES_TICKET_SECRET_ENV = 'MEETING_NOTES_TICKET_SECRET';
export const MEETING_NOTES_TICKET_SECRET_PREVIOUS_ENV = 'MEETING_NOTES_TICKET_SECRET_PREVIOUS';

/** What a ticket binds: the operation's identity apart from its key and time. */
export interface MeetingNoteAiTicketBinding {
  /** Application users.id of the authenticated requester. */
  userId: string;
  companyId: string;
  noteId: string;
  /** Note revision the notice was shown for (the draft's source revision). */
  sourceRevision: number;
  /** Stored-transcript identity the notice was shown for. */
  transcriptId: string;
  /** AI settings revision the notice was shown for. */
  settingsRevision: number;
}

export interface MeetingNoteAiTicketPayload extends MeetingNoteAiTicketBinding {
  v: typeof VERSION;
  /** Issue time, whole seconds since the Unix epoch. */
  iat: number;
  /** Server-generated idempotency key (UUID), unique per ticket. */
  idempotencyKey: string;
}

export interface IssuedMeetingNoteAiTicket {
  ticket: string;
  payload: MeetingNoteAiTicketPayload;
  /** ISO time after which the ticket and its key are rejected as expired. */
  expiresAt: string;
}

export type MeetingNoteAiTicketRejection = 'malformed' | 'invalid_signature' | 'expired' | 'not_yet_valid';

export type MeetingNoteAiTicketVerification =
  | { ok: true; payload: MeetingNoteAiTicketPayload; expiresAt: string }
  | { ok: false; reason: MeetingNoteAiTicketRejection };

/** The ticket secret is missing or too short (no fallback exists). */
export class MeetingNoteAiTicketConfigError extends Error {
  constructor() {
    super('The meeting-notes ticket secret is not configured.');
    this.name = 'MeetingNoteAiTicketConfigError';
  }
}

const uuid = z.guid();
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

const payloadSchema = z
  .object({
    v: z.literal(VERSION),
    iat: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotencyKey: uuid,
    userId: uuid,
    companyId: uuid,
    noteId: uuid,
    sourceRevision: revision,
    transcriptId: uuid,
    settingsRevision: revision,
  })
  .strict();

const bindingSchema = payloadSchema.omit({ v: true, iat: true, idempotencyKey: true });

function secretFrom(name: string, required: boolean): Buffer | null {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (required) throw new MeetingNoteAiTicketConfigError();
    return null;
  }
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length < MIN_SECRET_BYTES || new Set(bytes).size < MIN_SECRET_DISTINCT_BYTES) {
    throw new MeetingNoteAiTicketConfigError();
  }
  return bytes;
}

function currentSecret(): Buffer {
  const secret = secretFrom(MEETING_NOTES_TICKET_SECRET_ENV, true);
  if (!secret) throw new MeetingNoteAiTicketConfigError();
  return secret;
}

/** Throws MeetingNoteAiTicketConfigError unless tickets can be issued and verified. */
export function assertMeetingNoteAiTicketConfigured(): void {
  currentSecret();
  secretFrom(MEETING_NOTES_TICKET_SECRET_PREVIOUS_ENV, false);
}

function mac(secret: Buffer, signedPart: string): Buffer {
  return createHmac('sha256', secret).update(signedPart, 'utf8').digest();
}

/** Fixed key order: the payload bytes depend only on the values. */
function canonicalJson(payload: MeetingNoteAiTicketPayload): string {
  return JSON.stringify({
    v: payload.v,
    iat: payload.iat,
    idempotencyKey: payload.idempotencyKey,
    userId: payload.userId,
    companyId: payload.companyId,
    noteId: payload.noteId,
    sourceRevision: payload.sourceRevision,
    transcriptId: payload.transcriptId,
    settingsRevision: payload.settingsRevision,
  });
}

function expiresAtOf(iat: number): string {
  return new Date((iat + MEETING_NOTE_AI_TICKET_TTL_SECONDS) * 1000).toISOString();
}

/** The issue time as the ISO instant the admission RPC binds. */
export function meetingNoteAiTicketIssuedAt(payload: Pick<MeetingNoteAiTicketPayload, 'iat'>): string {
  return new Date(payload.iat * 1000).toISOString();
}

/**
 * Signs a new ticket with a fresh server-generated idempotency key. Call only
 * after the route authorized the user (current membership and editor rights).
 */
export function issueMeetingNoteAiTicket(
  binding: MeetingNoteAiTicketBinding,
  nowMs: number = Date.now()
): IssuedMeetingNoteAiTicket {
  const secret = currentSecret();
  secretFrom(MEETING_NOTES_TICKET_SECRET_PREVIOUS_ENV, false);
  const checked = bindingSchema.parse(binding);
  const payload: MeetingNoteAiTicketPayload = {
    v: VERSION,
    iat: Math.floor(nowMs / 1000),
    idempotencyKey: randomUUID(),
    ...checked,
  };
  const encoded = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url');
  const signedPart = `${PREFIX}.${encoded}`;
  const ticket = `${signedPart}.${mac(secret, signedPart).toString('base64url')}`;
  return { ticket, payload, expiresAt: expiresAtOf(payload.iat) };
}

function macMatches(secret: Buffer, signedPart: string, received: Buffer): boolean {
  const expected = mac(secret, signedPart);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Verifies a presented ticket: format, signature (current secret, then the
 * previous one), payload shape, and the 24-hour validity of the ticket and its
 * key. Throws MeetingNoteAiTicketConfigError when the secret is missing.
 */
export function verifyMeetingNoteAiTicket(ticket: unknown, nowMs: number = Date.now()): MeetingNoteAiTicketVerification {
  const current = currentSecret();
  const previous = secretFrom(MEETING_NOTES_TICKET_SECRET_PREVIOUS_ENV, false);

  if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_LENGTH) return { ok: false, reason: 'malformed' };
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !SEGMENT.test(parts[1]) || !SEGMENT.test(parts[2])) {
    return { ok: false, reason: 'malformed' };
  }
  const received = Buffer.from(parts[2], 'base64url');
  if (received.length !== MAC_BYTES || received.toString('base64url') !== parts[2]) {
    return { ok: false, reason: 'malformed' };
  }

  const signedPart = `${PREFIX}.${parts[1]}`;
  const signed = macMatches(current, signedPart, received) || (previous !== null && macMatches(previous, signedPart, received));
  if (!signed) return { ok: false, reason: 'invalid_signature' };

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(parts[1], 'base64url')));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, reason: 'malformed' };
  const payload = parsed.data;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (payload.iat > nowSeconds + MAX_FUTURE_SKEW_SECONDS) return { ok: false, reason: 'not_yet_valid' };
  if (nowSeconds >= payload.iat + MEETING_NOTE_AI_TICKET_TTL_SECONDS) return { ok: false, reason: 'expired' };

  return { ok: true, payload, expiresAt: expiresAtOf(payload.iat) };
}
