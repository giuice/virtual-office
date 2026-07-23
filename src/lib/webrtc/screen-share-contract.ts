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
