import { z } from 'zod';

export const knockRequestBodySchema = z.object({
  sessionId: z.string().uuid(),
  spaceId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export const knockResponseBodySchema = z.object({
  sessionId: z.string().uuid(),
  requestId: z.string().uuid(),
  decision: z.enum(['APPROVE', 'DENY']),
});

export const knockRequestIdSchema = z.string().uuid();

export const knockPendingQuerySchema = z.object({
  sessionId: z.string().uuid(),
  spaceId: z.string().uuid(),
});

export const knockStatusQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

export const knockRpcResultSchema = z.object({
  ok: z.boolean(),
  code: z.string(),
  requestId: z.string().optional(),
  status: z.string().optional(),
  decision: z.enum(['APPROVE', 'DENY']).nullable().optional(),
  responderId: z.string().uuid().nullable().optional(),
  requesterUserId: z.string().uuid().nullable().optional(),
  spaceId: z.string().uuid().optional(),
  expiresAt: z.string().optional(),
  consumedAt: z.string().nullable().optional(),
  requesterLocationVersion: z.number().int().nonnegative().optional(),
  requesterLocationVersionBefore: z.number().int().nonnegative().nullable().optional(),
  requesterLocationVersionAfter: z.number().int().nonnegative().nullable().optional(),
  requesterAccessRevision: z.number().int().positive().nullable().optional(),
  responderAccessRevision: z.number().int().positive().nullable().optional(),
  spaceAccessRevision: z.number().int().positive().nullable().optional(),
  recipientCount: z.number().int().nonnegative().optional(),
  retryAfterSeconds: z.number().int().positive().optional(),
  usable: z.boolean().optional(),
  alreadyApplied: z.boolean().optional(),
  requests: z.array(z.object({
    requestId: z.string().uuid(),
    requester: z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      avatarUrl: z.string().nullable(),
    }),
    spaceId: z.string().uuid(),
    createdAt: z.string(),
    expiresAt: z.string(),
  })).optional(),
}).passthrough();

export type KnockRpcResult = z.infer<typeof knockRpcResultSchema>;

export type KnockExpiryResult =
  | 'live'
  | 'expired'
  | 'terminal'
  | 'usable'
  | 'unusable'
  | null;

export function knockExpiryResult(result: KnockRpcResult | undefined): KnockExpiryResult {
  if (!result) return null;
  if (result.code === 'KNOCK_EXPIRED' || result.status === 'expired') return 'expired';
  if (result.status === 'denied' || result.status === 'consumed') return 'terminal';
  if (result.usable === true) return 'usable';
  if (result.usable === false) return 'unusable';
  if (result.expiresAt) return 'live';
  return null;
}

export function toPublicKnockRpcResult(result: KnockRpcResult): Record<string, unknown> {
  const publicResult: Record<string, unknown> = { ...result };
  delete publicResult.requesterUserId;
  delete publicResult.requesterLocationVersionBefore;
  delete publicResult.requesterLocationVersionAfter;
  delete publicResult.requesterAccessRevision;
  delete publicResult.responderAccessRevision;
  delete publicResult.spaceAccessRevision;
  return publicResult;
}

const KNOCK_ERROR_STATUS: Readonly<Record<string, number>> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  SESSION_INVALID: 409,
  SPACE_NOT_FOUND: 404,
  CROSS_COMPANY_SPACE: 403,
  SPACE_UNAVAILABLE: 409,
  KNOCK_NOT_REQUIRED: 409,
  NO_KNOCK_RECIPIENTS: 409,
  KNOCK_ALREADY_PENDING: 409,
  KNOCK_RATE_LIMITED: 429,
  KNOCK_NOT_FOUND: 404,
  KNOCK_ALREADY_RESOLVED: 409,
  KNOCK_SUPERSEDED: 409,
  KNOCK_EXPIRED: 410,
};

export function knockErrorStatus(code: string): number {
  return KNOCK_ERROR_STATUS[code] ?? 500;
}

export function knockErrorMessage(code: string): string {
  switch (code) {
    case 'SESSION_INVALID':
      return 'Your presence session is no longer active. Please refresh and try again.';
    case 'SPACE_NOT_FOUND':
      return 'Space not found.';
    case 'CROSS_COMPANY_SPACE':
      return 'You cannot knock on a space outside your company.';
    case 'SPACE_UNAVAILABLE':
      return 'This space is currently unavailable.';
    case 'KNOCK_NOT_REQUIRED':
      return 'You are already in this space.';
    case 'NO_KNOCK_RECIPIENTS':
      return 'No one is available to answer in this space.';
    case 'KNOCK_ALREADY_PENDING':
      return 'You already have a pending knock for this space.';
    case 'KNOCK_RATE_LIMITED':
      return 'Please wait before knocking again.';
    case 'KNOCK_NOT_FOUND':
      return 'Knock request not found.';
    case 'KNOCK_ALREADY_RESOLVED':
      return 'This knock request was already answered.';
    case 'KNOCK_SUPERSEDED':
      return 'This knock is no longer valid because the room or requester changed.';
    case 'KNOCK_EXPIRED':
      return 'This knock request expired.';
    case 'INVALID_REQUEST':
      return 'Invalid knock request.';
    default:
      return 'Knock operation failed.';
  }
}
