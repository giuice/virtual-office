import { z } from 'zod';

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
export const screenSharePresenterNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => Array.from(name).length <= 100, {
    message: 'Presenter name must contain at most 100 Unicode code points.',
  });

export const screenShareSpaceParamsSchema = z.object({
  spaceId: uuidSchema,
}).strict();

export const screenShareClaimRequestSchema = z.object({
  presenceSessionId: uuidSchema,
  shareId: uuidSchema,
}).strict();

export const screenShareRenewRequestSchema = z.object({
  presenceSessionId: uuidSchema,
  shareId: uuidSchema,
}).strict();

export const screenShareStopReasonSchema = z.enum([
  'user-stop',
  'track-ended',
  'scope-changed',
  'error-cleanup',
]);

export const screenShareReleaseRequestSchema = z.object({
  presenceSessionId: uuidSchema,
  shareId: uuidSchema,
  stopReason: screenShareStopReasonSchema.optional(),
}).strict();

export const screenShareActiveQuerySchema = z.object({
  presenceSessionId: uuidSchema,
}).strict();

export const screenSharePublicShareSchema = z.object({
  companyId: uuidSchema,
  spaceId: uuidSchema,
  presenterUserId: uuidSchema,
  presenterName: screenSharePresenterNameSchema,
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

const screenShareCommonRpcErrorCodeValues = [
  'INVALID_REQUEST',
  'AUTH_INVALID',
  'SESSION_INVALID',
  'RETRY_LOCK_SET',
  'PRESENTER_PROFILE_INVALID',
] as const;

const screenShareClaimRpcErrorCodeValues = [
  ...screenShareCommonRpcErrorCodeValues,
  'PRESENTER_BUSY',
] as const;

const screenShareReleaseRpcErrorCodeValues = [
  'INVALID_REQUEST',
  'AUTH_INVALID',
  'SESSION_INVALID',
  'RETRY_LOCK_SET',
  'LEASE_NOT_FOUND',
  'LEASE_NOT_OWNER',
] as const;

const screenShareRenewRpcErrorCodeValues = [
  'INVALID_REQUEST',
  'AUTH_INVALID',
  'SESSION_INVALID',
  'RETRY_LOCK_SET',
  'LEASE_STALE',
] as const;

export const screenShareClaimRpcErrorCodeSchema = z.enum(screenShareClaimRpcErrorCodeValues);
export const screenShareRenewRpcErrorCodeSchema = z.enum(screenShareRenewRpcErrorCodeValues);
export const screenShareReleaseRpcErrorCodeSchema = z.enum(screenShareReleaseRpcErrorCodeValues);
export const screenShareActiveRpcErrorCodeSchema = z.enum(screenShareCommonRpcErrorCodeValues);

const screenShareClaimRpcErrorSchema = z.object({
  ok: z.literal(false),
  code: screenShareClaimRpcErrorCodeSchema,
}).strict();

const screenShareReleaseRpcErrorSchema = z.object({
  ok: z.literal(false),
  code: screenShareReleaseRpcErrorCodeSchema,
}).strict();

const screenShareRenewRpcErrorSchema = z.object({
  ok: z.literal(false),
  code: screenShareRenewRpcErrorCodeSchema,
}).strict();

const screenShareActiveRpcErrorSchema = z.object({
  ok: z.literal(false),
  code: screenShareActiveRpcErrorCodeSchema,
}).strict();

const screenShareClaimRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('CLAIMED'),
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
  presenterName: screenSharePresenterNameSchema,
}).strict();

const screenShareReleaseRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('RELEASED'),
  alreadyReleased: z.boolean(),
}).strict();

export const screenShareLegacyClaimCommittedResultSchema = z.object({
  ok: z.literal(true),
  code: z.literal('CLAIMED'),
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

const screenShareRenewRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('RENEWED'),
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

const screenShareActiveRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('ACTIVE_READ'),
  active: z.object({
    spaceId: uuidSchema,
    presenterUserId: uuidSchema,
    presenterName: screenSharePresenterNameSchema,
    shareId: uuidSchema,
    expiresAt: isoDateTimeSchema,
  }).strict().nullable(),
}).strict();

export const screenShareClaimRpcResultSchema = z.union([
  screenShareClaimRpcSuccessSchema,
  screenShareClaimRpcErrorSchema,
]);

export const screenShareReleaseRpcResultSchema = z.union([
  screenShareReleaseRpcSuccessSchema,
  screenShareReleaseRpcErrorSchema,
]);

export const screenShareRenewRpcResultSchema = z.union([
  screenShareRenewRpcSuccessSchema,
  screenShareRenewRpcErrorSchema,
]);

export const screenShareActiveRpcResultSchema = z.union([
  screenShareActiveRpcSuccessSchema,
  screenShareActiveRpcErrorSchema,
]);

export const screenSharePublicErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'ACCESS_DENIED',
  'SESSION_INVALID',
  'SPACE_NOT_FOUND',
  'SPACE_UNAVAILABLE',
  'PRESENTER_BUSY',
  'LEASE_NOT_FOUND',
  'LEASE_NOT_OWNER',
  'LEASE_STALE',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'MEMBERSHIP_SCOPE_INVALID',
  'PRESENTER_PROFILE_INVALID',
  'DATABASE_CONTRACT_INCOMPATIBLE',
  'INTERNAL_ERROR',
]);

export const screenSharePublicErrorSchema = z.object({
  success: z.literal(false),
  code: screenSharePublicErrorCodeSchema,
  error: z.string().min(1),
  retryable: z.boolean(),
  correlationId: uuidSchema.optional(),
}).strict();

export const screenShareClaimResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('CLAIMED'),
  share: screenSharePublicShareSchema,
}).strict();

export const screenShareReleaseResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('RELEASED'),
  alreadyReleased: z.boolean(),
}).strict();

export const screenShareRenewResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('RENEWED'),
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

export const screenShareActiveResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('ACTIVE_READ'),
  active: screenSharePublicShareSchema.nullable(),
}).strict();

export const screenShareSignalResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('SIGNAL_SENT'),
}).strict();

const signalingScopeSchema = {
  sourceUserId: uuidSchema,
  sourcePresenceSessionId: uuidSchema,
  sourceConnectionId: uuidSchema,
  companyId: uuidSchema,
  spaceId: uuidSchema,
  shareId: uuidSchema.nullable(),
} as const;

const signalRequestScopeSchema = {
  presenceSessionId: uuidSchema,
  connectionId: uuidSchema,
  shareId: uuidSchema.nullable(),
} as const;

const targetedSignalingScopeSchema = {
  ...signalingScopeSchema,
  targetUserId: uuidSchema,
  targetPresenceSessionId: uuidSchema,
  targetConnectionId: uuidSchema,
} as const;

const targetedSignalRequestScopeSchema = {
  ...signalRequestScopeSchema,
  targetUserId: uuidSchema,
  targetPresenceSessionId: uuidSchema,
  targetConnectionId: uuidSchema,
} as const;

const sessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().min(1).max(100_000),
}).strict();

const iceCandidateSchema = z.object({
  candidate: z.string().min(1).max(8_192),
  sdpMid: z.string().min(1).max(256).nullable(),
  sdpMLineIndex: z.number().int().nonnegative().nullable(),
  usernameFragment: z.string().min(1).max(256).nullable().optional(),
}).strict();

export const screenShareHandshakePayloadSchema = z.object({
  type: z.literal('handshake'),
  ...signalingScopeSchema,
}).strict();

export const screenShareDescriptionPayloadSchema = z.object({
  type: z.literal('description'),
  ...targetedSignalingScopeSchema,
  description: sessionDescriptionSchema,
}).strict();

export const screenShareIcePayloadSchema = z.object({
  type: z.literal('ice'),
  ...targetedSignalingScopeSchema,
  candidate: iceCandidateSchema,
}).strict();

export const screenSharePresenterHintPayloadSchema = z.object({
  type: z.literal('presenter-hint'),
  ...targetedSignalingScopeSchema,
  presenterUserId: uuidSchema,
  presenterName: screenSharePresenterNameSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

export const screenSharePresenterInvalidatedPayloadSchema = z.object({
  type: z.literal('presenter-invalidated'),
  ...signalingScopeSchema,
  shareId: uuidSchema,
}).strict();

export const screenShareHandshakeRequestSchema = z.object({
  type: z.literal('handshake'),
  ...signalRequestScopeSchema,
}).strict();

export const screenShareDescriptionRequestSchema = z.object({
  type: z.literal('description'),
  ...targetedSignalRequestScopeSchema,
  description: sessionDescriptionSchema,
}).strict();

export const screenShareIceRequestSchema = z.object({
  type: z.literal('ice'),
  ...targetedSignalRequestScopeSchema,
  candidate: iceCandidateSchema,
}).strict();

export const screenShareSignalRequestSchema = z.discriminatedUnion('type', [
  screenShareHandshakeRequestSchema,
  screenShareDescriptionRequestSchema,
  screenShareIceRequestSchema,
]);

export const screenShareSignalingPayloadSchema = z.union([
  screenShareHandshakePayloadSchema,
  screenShareDescriptionPayloadSchema,
  screenShareIcePayloadSchema,
  screenSharePresenterHintPayloadSchema,
  screenSharePresenterInvalidatedPayloadSchema,
]);

export interface ScreenSharePublicShare {
  companyId: string;
  spaceId: string;
  presenterUserId: string;
  presenterName: string;
  shareId: string;
  expiresAt: string;
}

export type ScreenShareClaimRequest = z.infer<typeof screenShareClaimRequestSchema>;
export type ScreenShareRenewRequest = z.infer<typeof screenShareRenewRequestSchema>;
export type ScreenShareReleaseRequest = z.infer<typeof screenShareReleaseRequestSchema>;
export type ScreenShareActiveQuery = z.infer<typeof screenShareActiveQuerySchema>;
export type ScreenShareSignalRequest = z.infer<typeof screenShareSignalRequestSchema>;
export type ScreenShareClaimRpcResult = z.infer<typeof screenShareClaimRpcResultSchema>;
export type ScreenShareRenewRpcResult = z.infer<typeof screenShareRenewRpcResultSchema>;
export type ScreenShareReleaseRpcResult = z.infer<typeof screenShareReleaseRpcResultSchema>;
export type ScreenShareActiveRpcResult = z.infer<typeof screenShareActiveRpcResultSchema>;
export type ScreenShareSignalingPayload = z.infer<typeof screenShareSignalingPayloadSchema>;
export type ScreenSharePublicError = z.infer<typeof screenSharePublicErrorSchema>;
export type ScreenSharePublicResult =
  | z.infer<typeof screenShareClaimResponseSchema>
  | z.infer<typeof screenShareRenewResponseSchema>
  | z.infer<typeof screenShareReleaseResponseSchema>
  | z.infer<typeof screenShareActiveResponseSchema>
  | z.infer<typeof screenShareSignalResponseSchema>
  | ScreenSharePublicError;

export function screenShareMediaTopic(companyId: string, spaceId: string): string {
  return `company:${companyId}:space:${spaceId}:media:v2`;
}

export function toPublicScreenShare(share: ScreenSharePublicShare): ScreenSharePublicShare {
  return {
    companyId: share.companyId,
    spaceId: share.spaceId,
    presenterUserId: share.presenterUserId,
    presenterName: share.presenterName,
    shareId: share.shareId,
    expiresAt: share.expiresAt,
  };
}

export interface ScreenShareErrorContract {
  code: z.infer<typeof screenSharePublicErrorCodeSchema>;
  status: number;
  error: string;
  retryable: boolean;
}

const SCREEN_SHARE_ERROR_CONTRACTS: Readonly<Record<string, ScreenShareErrorContract>> = {
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    status: 400,
    error: 'Invalid screen share request.',
    retryable: false,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    status: 401,
    error: 'Authentication required',
    retryable: false,
  },
  AUTH_SESSION_REVOKED: {
    code: 'SESSION_INVALID',
    status: 409,
    error: 'Your presence session is no longer active.',
    retryable: false,
  },
  USER_NOT_FOUND: {
    code: 'MEMBERSHIP_SCOPE_INVALID',
    status: 403,
    error: 'Your company membership changed. Refresh before using screen sharing.',
    retryable: false,
  },
  AUTH_INVALID: {
    code: 'MEMBERSHIP_SCOPE_INVALID',
    status: 403,
    error: 'Your company membership changed. Refresh before using screen sharing.',
    retryable: false,
  },
  SESSION_INVALID: {
    code: 'SESSION_INVALID',
    status: 409,
    error: 'Your presence session is no longer active.',
    retryable: false,
  },
  SPACE_NOT_FOUND: { code: 'SPACE_NOT_FOUND', status: 404, error: 'Space not found.', retryable: false },
  CROSS_COMPANY_SPACE: {
    code: 'ACCESS_DENIED',
    status: 403,
    error: 'Screen sharing is not available in this space.',
    retryable: false,
  },
  SPACE_UNAVAILABLE: {
    code: 'SPACE_UNAVAILABLE',
    status: 409,
    error: 'Screen sharing is not available in this space.',
    retryable: false,
  },
  PRESENTER_BUSY: {
    code: 'PRESENTER_BUSY',
    status: 409,
    error: 'Another participant is already sharing this space.',
    retryable: false,
  },
  LEASE_NOT_FOUND: {
    code: 'LEASE_NOT_FOUND',
    status: 404,
    error: 'The screen share lease was not found.',
    retryable: false,
  },
  LEASE_NOT_OWNER: {
    code: 'LEASE_NOT_OWNER',
    status: 403,
    error: 'You do not own this screen share lease.',
    retryable: false,
  },
  LEASE_STALE: {
    code: 'LEASE_STALE',
    status: 409,
    error: 'This screen share lease is no longer active.',
    retryable: false,
  },
  RETRY_LOCK_SET: {
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    error: 'Screen sharing is temporarily unavailable.',
    retryable: true,
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    status: 429,
    error: 'Screen-share signaling is temporarily rate limited.',
    retryable: true,
  },
  MEMBERSHIP_SCOPE_INVALID: {
    code: 'MEMBERSHIP_SCOPE_INVALID',
    status: 403,
    error: 'Your company membership changed. Refresh before using screen sharing.',
    retryable: false,
  },
  PRESENTER_PROFILE_INVALID: {
    code: 'PRESENTER_PROFILE_INVALID',
    status: 409,
    error: 'The presenter profile is unavailable for screen sharing.',
    retryable: false,
  },
  DATABASE_CONTRACT_INCOMPATIBLE: {
    code: 'DATABASE_CONTRACT_INCOMPATIBLE',
    status: 426,
    error: 'Screen sharing is unavailable until server compatibility is restored.',
    retryable: false,
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    status: 500,
    error: 'Screen share operation failed.',
    retryable: true,
  },
};

const screenShareRpcContractErrorCodes = new Set([
  'PGRST202',
  'PGRST203',
  '42883',
  '42501',
]);

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error;
  return typeof code === 'string' ? code : null;
}

export function screenShareRpcContractError(error: unknown): ScreenShareErrorContract | null {
  const code = errorCode(error);
  if (!code || !screenShareRpcContractErrorCodes.has(code)) {
    return null;
  }

  return SCREEN_SHARE_ERROR_CONTRACTS.DATABASE_CONTRACT_INCOMPATIBLE;
}

export function screenShareErrorContract(code: string): ScreenShareErrorContract {
  return SCREEN_SHARE_ERROR_CONTRACTS[code] ?? {
    code: 'INTERNAL_ERROR',
    status: 500,
    error: 'Screen share operation failed.',
    retryable: true,
  };
}
