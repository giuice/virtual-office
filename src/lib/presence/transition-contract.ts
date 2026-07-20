import { NextResponse } from 'next/server';
import { z } from 'zod';

export const locationTransitionReasons = [
  'manual-enter',
  'manual-leave',
  'knock-enter',
  'auto-first-placement',
  'auto-rejoin',
  'auto-fallback',
  'teleport-accept',
  'logout',
] as const;

export const presenceTransitionCodes = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'AUTH_SESSION_REVOKED',
  'SESSION_INVALID',
  'SPACE_NOT_FOUND',
  'CROSS_COMPANY_SPACE',
  'SPACE_UNAVAILABLE',
  'SPACE_FULL',
  'SPACE_ACCESS_DENIED',
  'SPACE_ACCESS_CONFIGURATION_INVALID',
  'KNOCK_INVALID',
  'KNOCK_NOT_READY',
  'KNOCK_EXPIRED',
  'KNOCK_ALREADY_CONSUMED',
  'KNOCK_SUPERSEDED',
  'IDEMPOTENCY_CONFLICT',
  'LOCATION_SUPERSEDED',
  'LOCATION_UPDATED',
  'LOCATION_UNCHANGED',
  'PRESENCE_MAINTENANCE',
  'LEGACY_AUDIT_UNAVAILABLE',
  'CLIENT_UPGRADE_REQUIRED',
  'INTERNAL_ERROR',
] as const;

export type LocationTransitionReason = (typeof locationTransitionReasons)[number];
export type PresenceTransitionCode = (typeof presenceTransitionCodes)[number];

export interface PresenceTransitionCodeContract {
  status: number;
  retryable: boolean;
  message: string;
}

export const PRESENCE_TRANSITION_CODE_CONTRACT: Record<
  PresenceTransitionCode,
  PresenceTransitionCodeContract
> = {
  INVALID_REQUEST: {
    status: 400,
    retryable: false,
    message: 'Invalid location transition request',
  },
  UNAUTHORIZED: { status: 401, retryable: true, message: 'Authentication required' },
  AUTH_SESSION_REVOKED: {
    status: 401,
    retryable: false,
    message: 'Authentication session revoked',
  },
  SESSION_INVALID: { status: 409, retryable: true, message: 'Presence session is invalid' },
  SPACE_NOT_FOUND: { status: 404, retryable: false, message: 'Space was not found' },
  CROSS_COMPANY_SPACE: {
    status: 403,
    retryable: false,
    message: 'Cannot enter a space outside your company',
  },
  SPACE_UNAVAILABLE: { status: 409, retryable: false, message: 'Space is unavailable' },
  SPACE_FULL: { status: 409, retryable: false, message: 'Space is full' },
  SPACE_ACCESS_DENIED: { status: 403, retryable: false, message: 'Space access denied' },
  SPACE_ACCESS_CONFIGURATION_INVALID: {
    status: 409,
    retryable: false,
    message: 'Space access configuration is invalid',
  },
  KNOCK_INVALID: { status: 403, retryable: false, message: 'Knock request is invalid' },
  KNOCK_NOT_READY: { status: 409, retryable: true, message: 'Knock approval is not ready' },
  KNOCK_EXPIRED: { status: 410, retryable: false, message: 'Knock request expired' },
  KNOCK_ALREADY_CONSUMED: {
    status: 409,
    retryable: false,
    message: 'Knock request was already consumed',
  },
  KNOCK_SUPERSEDED: { status: 409, retryable: false, message: 'Knock request was superseded' },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    retryable: false,
    message: 'Transition id was reused with a different request',
  },
  LOCATION_SUPERSEDED: {
    status: 409,
    retryable: false,
    message: 'Location transition was superseded',
  },
  LOCATION_UPDATED: { status: 200, retryable: false, message: 'Location updated' },
  LOCATION_UNCHANGED: { status: 200, retryable: false, message: 'Location unchanged' },
  PRESENCE_MAINTENANCE: {
    status: 503,
    retryable: true,
    message: 'Presence is temporarily unavailable',
  },
  LEGACY_AUDIT_UNAVAILABLE: {
    status: 503,
    retryable: true,
    message: 'Presence audit is temporarily unavailable',
  },
  CLIENT_UPGRADE_REQUIRED: {
    status: 426,
    retryable: false,
    message: 'Client upgrade required',
  },
  INTERNAL_ERROR: { status: 500, retryable: true, message: 'Presence operation failed' },
};

// 'logout' is reserved for /api/presence/logout (dedicated fence/sign-out
// flow); accepting it here would let a client fence its auth session while
// skipping local-scope sign-out and fence confirmation.
export const locationRouteReasons = [
  'manual-enter',
  'manual-leave',
  'knock-enter',
  'auto-first-placement',
  'auto-rejoin',
  'auto-fallback',
  'teleport-accept',
] as const;

export const locationTransitionBodySchema = z
  .object({
    sessionId: z.string().uuid(),
    transitionId: z.string().uuid(),
    spaceId: z.string().uuid().nullable(),
    reason: z.enum(locationRouteReasons),
    knockRequestId: z.string().uuid().nullable(),
    expectedLocationVersion: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const logoutTransitionBodySchema = z
  .object({
    transitionId: z.string().uuid(),
  })
  .strict();

export const transitionRpcRowSchema = z
  .object({
    ok: z.boolean(),
    code: z.enum(presenceTransitionCodes),
    message: z.string().nullable().optional(),
    transition_id: z.string().uuid(),
    previous_space_id: z.string().uuid().nullable(),
    current_space_id: z.string().uuid().nullable(),
    location_version: z.number().int().nullable(),
    already_applied: z.boolean(),
    authorized_by: z.string().uuid().nullable().optional(),
    previous_location_version: z.number().int().nonnegative().nullable(),
    authorization_mode: z.enum(['public', 'direct', 'rejoin', 'knock']).nullable(),
  })
  .passthrough();

export type LocationTransitionBody = z.infer<typeof locationTransitionBodySchema>;
export type TransitionRpcRow = z.infer<typeof transitionRpcRowSchema>;

export interface TransitionSuccessResponse {
  success: true;
  code: 'LOCATION_UPDATED' | 'LOCATION_UNCHANGED';
  transitionId: string;
  previousSpaceId: string | null;
  currentSpaceId: string | null;
  locationVersion: number | null;
  alreadyApplied: boolean;
}

export interface TransitionErrorResponse {
  success: false;
  code: PresenceTransitionCode;
  message: string;
  retryable: boolean;
  transitionId: string | null;
}

export function extractParsedTransitionId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const transitionId = (body as { transitionId?: unknown }).transitionId;
  const parsedTransitionId = z.string().uuid().safeParse(transitionId);
  return parsedTransitionId.success ? parsedTransitionId.data : null;
}

export function validateReasonShape(body: LocationTransitionBody): boolean {
  const expectedLocationVersion = body.expectedLocationVersion ?? null;
  const requiresExpectedVersion = [
    'auto-first-placement',
    'auto-rejoin',
    'auto-fallback',
    'knock-enter',
  ].includes(body.reason);

  if (requiresExpectedVersion !== (expectedLocationVersion !== null)) {
    return false;
  }

  if (body.reason === 'manual-leave') {
    return body.spaceId === null && body.knockRequestId === null;
  }

  if (body.reason === 'knock-enter') {
    return body.spaceId !== null && body.knockRequestId !== null;
  }

  return body.spaceId !== null && body.knockRequestId === null;
}

export function transitionErrorResponse(
  code: PresenceTransitionCode,
  transitionId: string | null,
  statusOverride?: number
): NextResponse<TransitionErrorResponse> {
  const contract = PRESENCE_TRANSITION_CODE_CONTRACT[code];

  return NextResponse.json(
    {
      success: false,
      code,
      message: contract.message,
      retryable: contract.retryable,
      transitionId,
    },
    { status: statusOverride ?? contract.status }
  );
}

export function transitionSuccessResponse(row: TransitionRpcRow): NextResponse<TransitionSuccessResponse> {
  const code = row.code === 'LOCATION_UPDATED' ? 'LOCATION_UPDATED' : 'LOCATION_UNCHANGED';

  return NextResponse.json({
    success: true,
    code,
    transitionId: row.transition_id,
    previousSpaceId: row.previous_space_id,
    currentSpaceId: row.current_space_id,
    locationVersion: row.location_version,
    alreadyApplied: row.already_applied,
  });
}

export function parseTransitionRpcRow(data: unknown): TransitionRpcRow | null {
  const firstRow = Array.isArray(data) ? data[0] : data;
  const parsed = transitionRpcRowSchema.safeParse(firstRow);
  return parsed.success ? parsed.data : null;
}
