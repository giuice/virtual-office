import { z } from 'zod';

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const presenterNameSchema = z.string().trim().min(1).max(100);

export const screenShareSpaceParamsSchema = z.object({
  spaceId: uuidSchema,
}).strict();

export const screenShareClaimRequestSchema = z.object({
  presenceSessionId: uuidSchema,
  shareId: uuidSchema,
}).strict();

export const screenShareReleaseRequestSchema = z.object({
  presenceSessionId: uuidSchema,
  shareId: uuidSchema,
}).strict();

export const screenShareActiveQuerySchema = z.object({
  presenceSessionId: uuidSchema,
}).strict();

export const screenSharePublicShareSchema = z.object({
  companyId: uuidSchema,
  spaceId: uuidSchema,
  presenterUserId: uuidSchema,
  presenterName: presenterNameSchema,
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

const screenShareErrorCodeValues = [
  'INVALID_REQUEST',
  'AUTH_INVALID',
  'SESSION_INVALID',
  'SPACE_NOT_FOUND',
  'CROSS_COMPANY_SPACE',
  'SPACE_UNAVAILABLE',
  'PRESENTER_BUSY',
  'LEASE_NOT_FOUND',
  'LEASE_NOT_OWNER',
  'LEASE_STALE',
  'RETRY_LOCK_SET',
] as const;

export const screenShareErrorCodeSchema = z.enum(screenShareErrorCodeValues);

const screenShareRpcErrorSchema = z.object({
  ok: z.literal(false),
  code: screenShareErrorCodeSchema,
}).strict();

const screenShareClaimRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('CLAIMED'),
  shareId: uuidSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

const screenShareReleaseRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('RELEASED'),
  alreadyReleased: z.boolean(),
}).strict();

const screenShareActiveRpcSuccessSchema = z.object({
  ok: z.literal(true),
  code: z.literal('ACTIVE_READ'),
  active: z.object({
    spaceId: uuidSchema,
    presenterUserId: uuidSchema,
    shareId: uuidSchema,
    expiresAt: isoDateTimeSchema,
  }).strict().nullable(),
}).strict();

export const screenShareClaimRpcResultSchema = z.union([
  screenShareClaimRpcSuccessSchema,
  screenShareRpcErrorSchema,
]);

export const screenShareReleaseRpcResultSchema = z.union([
  screenShareReleaseRpcSuccessSchema,
  screenShareRpcErrorSchema,
]);

export const screenShareActiveRpcResultSchema = z.union([
  screenShareActiveRpcSuccessSchema,
  screenShareRpcErrorSchema,
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
  'INTERNAL_ERROR',
]);

export const screenSharePublicErrorSchema = z.object({
  success: z.literal(false),
  code: screenSharePublicErrorCodeSchema,
  error: z.string().min(1),
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

export const screenShareActiveResponseSchema = z.object({
  success: z.literal(true),
  code: z.literal('ACTIVE_READ'),
  active: screenSharePublicShareSchema.nullable(),
}).strict();

const signalingScopeSchema = {
  sourceUserId: uuidSchema,
  targetUserId: uuidSchema,
  companyId: uuidSchema,
  spaceId: uuidSchema,
  shareId: uuidSchema,
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
  ...signalingScopeSchema,
  description: sessionDescriptionSchema,
}).strict();

export const screenShareIcePayloadSchema = z.object({
  type: z.literal('ice'),
  ...signalingScopeSchema,
  candidate: iceCandidateSchema,
}).strict();

export const screenSharePresenterHintPayloadSchema = z.object({
  type: z.literal('presenter-hint'),
  ...signalingScopeSchema,
  presenterUserId: uuidSchema,
  presenterName: presenterNameSchema,
  expiresAt: isoDateTimeSchema,
}).strict();

export const screenSharePresenterInvalidatedPayloadSchema = z.object({
  type: z.literal('presenter-invalidated'),
  ...signalingScopeSchema,
}).strict();

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
export type ScreenShareReleaseRequest = z.infer<typeof screenShareReleaseRequestSchema>;
export type ScreenShareActiveQuery = z.infer<typeof screenShareActiveQuerySchema>;
export type ScreenShareClaimRpcResult = z.infer<typeof screenShareClaimRpcResultSchema>;
export type ScreenShareReleaseRpcResult = z.infer<typeof screenShareReleaseRpcResultSchema>;
export type ScreenShareActiveRpcResult = z.infer<typeof screenShareActiveRpcResultSchema>;
export type ScreenShareSignalingPayload = z.infer<typeof screenShareSignalingPayloadSchema>;
export type ScreenSharePublicError = z.infer<typeof screenSharePublicErrorSchema>;
export type ScreenSharePublicResult =
  | z.infer<typeof screenShareClaimResponseSchema>
  | z.infer<typeof screenShareReleaseResponseSchema>
  | z.infer<typeof screenShareActiveResponseSchema>
  | ScreenSharePublicError;

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
}

const SCREEN_SHARE_ERROR_CONTRACTS: Readonly<Record<string, ScreenShareErrorContract>> = {
  INVALID_REQUEST: { code: 'INVALID_REQUEST', status: 400, error: 'Invalid screen share request.' },
  AUTH_INVALID: { code: 'UNAUTHORIZED', status: 401, error: 'Authentication required.' },
  SESSION_INVALID: { code: 'SESSION_INVALID', status: 409, error: 'Your presence session is no longer active.' },
  SPACE_NOT_FOUND: { code: 'SPACE_NOT_FOUND', status: 404, error: 'Space not found.' },
  CROSS_COMPANY_SPACE: { code: 'ACCESS_DENIED', status: 403, error: 'Screen sharing is not available in this space.' },
  SPACE_UNAVAILABLE: { code: 'SPACE_UNAVAILABLE', status: 409, error: 'Screen sharing is not available in this space.' },
  PRESENTER_BUSY: { code: 'PRESENTER_BUSY', status: 409, error: 'Another participant is already sharing this space.' },
  LEASE_NOT_FOUND: { code: 'LEASE_NOT_FOUND', status: 404, error: 'The screen share lease was not found.' },
  LEASE_NOT_OWNER: { code: 'LEASE_NOT_OWNER', status: 403, error: 'You do not own this screen share lease.' },
  LEASE_STALE: { code: 'LEASE_STALE', status: 409, error: 'This screen share lease is no longer active.' },
  RETRY_LOCK_SET: { code: 'SERVICE_UNAVAILABLE', status: 503, error: 'Screen sharing is temporarily unavailable.' },
};

export function screenShareErrorContract(code: string): ScreenShareErrorContract {
  return SCREEN_SHARE_ERROR_CONTRACTS[code] ?? {
    code: 'INTERNAL_ERROR',
    status: 500,
    error: 'Screen share operation failed.',
  };
}
