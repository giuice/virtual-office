// src/lib/messaging/message-attempts.ts
// Phase 5 T2 (FR-006, FR-011, FR-024, FR-034, BR-005) and T4 (mention ids):
// request parsing and replay comparison shared by POST /api/messages/create and
// POST /api/messages/fence. The database enforces attempt fencing
// (public.fence_message_attempt / public.create_message_attempt); this module
// only validates input and normalizes compositions.
import type { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api/server-error';
import type { ApiErrorBody } from '@/lib/api/error-contract';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

type FieldResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse<ApiErrorBody> };

/**
 * Optional attempt generation: a positive safe integer. Absent → undefined
 * (Phase 4 client). It is only meaningful together with a clientMessageId.
 */
export function parseAttemptGeneration(value: unknown, hasClientKey: boolean): FieldResult<number | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_ATTEMPT_GENERATION', 'attemptGeneration must be a positive integer'),
    };
  }
  if (!hasClientKey) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_ATTEMPT_GENERATION', 'attemptGeneration requires clientMessageId'),
    };
  }
  return { ok: true, value };
}

/**
 * Optional expected sender (users.id of the outbox item's owner, FR-011).
 * Required whenever an attempt generation is sent: every Phase 5 dispatch
 * carries both.
 */
export function parseExpectedSenderId(value: unknown, required: boolean): FieldResult<string | undefined> {
  if (value === undefined || value === null) {
    if (required) {
      return {
        ok: false,
        response: jsonError(400, 'INVALID_EXPECTED_SENDER', 'expectedSenderId is required with attemptGeneration'),
      };
    }
    return { ok: true, value: undefined };
  }
  if (!isUuid(value)) {
    return { ok: false, response: jsonError(400, 'INVALID_EXPECTED_SENDER', 'expectedSenderId must be a UUID') };
  }
  return { ok: true, value: value.toLowerCase() };
}

/**
 * Phase 5 T4 (FR-024): most mention ids one message may request (the database
 * enforces the same bound on the stored composition).
 */
export const MAX_MENTIONS_PER_MESSAGE = 50;

/**
 * Optional requested mention ids (users.id of the mentioned users): an array
 * of at most MAX_MENTIONS_PER_MESSAGE UUIDs, only together with a
 * clientMessageId (mentions travel in the stored original composition).
 * Absent → none. Returned lowercase, distinct and sorted. Which of them become
 * mentions (current members other than the sender) is decided by the
 * database at first creation.
 */
export function parseMentionIds(value: unknown, hasClientKey: boolean): FieldResult<string[]> {
  if (value === undefined || value === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value) || value.length > MAX_MENTIONS_PER_MESSAGE || value.some((id) => !isUuid(id))) {
    return {
      ok: false,
      response: jsonError(
        400,
        'INVALID_MENTION_IDS',
        `mentionIds must be an array of at most ${MAX_MENTIONS_PER_MESSAGE} user ids`
      ),
    };
  }
  if (!hasClientKey) {
    return {
      ok: false,
      response: jsonError(400, 'INVALID_MENTION_IDS', 'mentionIds requires clientMessageId'),
    };
  }
  return { ok: true, value: [...new Set((value as string[]).map((id) => id.toLowerCase()))].sort() };
}

/**
 * Phase 5 T2: the message stored under this key was deleted since. The key's
 * item was delivered; nothing was stored and it must not be resent.
 */
export function messageDeletedResponse(): NextResponse<ApiErrorBody> {
  return jsonError(410, 'MESSAGE_DELETED', 'The message sent with this clientMessageId was deleted');
}

/** BR-005: a newer attempt of the same key exists; clients ignore this outcome. */
export function attemptSupersededResponse(): NextResponse<ApiErrorBody> {
  return jsonError(409, 'ATTEMPT_SUPERSEDED', 'A newer attempt of this clientMessageId exists');
}
