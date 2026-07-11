import { z } from 'zod';

export const registerSessionBodySchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict();

export const sessionIdParamSchema = z.string().uuid();

export interface RegisterSessionResponse {
  sessionId: string;
  registrationId: string;
  expiresAt: string;
  sessionSpaceId: string | null;
}

export interface HeartbeatSessionResponse {
  expiresAt: string;
}

export interface DisconnectSessionResponse {
  retiredAt: string;
  alreadyDisconnected: boolean;
}

export interface PresenceSessionErrorResponse {
  error: string;
  code: string;
}

export const presenceSessionRpcErrorCodes = [
  'AUTH_SESSION_REVOKED',
  'NO_COMPANY',
  'USER_NOT_FOUND',
  'SESSION_RETIRED',
  'REGISTRATION_CONFLICT',
] as const;

export type PresenceSessionRpcErrorCode = (typeof presenceSessionRpcErrorCodes)[number];

export const PRESENCE_SESSION_RPC_ERROR_STATUS: Record<PresenceSessionRpcErrorCode, number> = {
  AUTH_SESSION_REVOKED: 401,
  NO_COMPANY: 403,
  USER_NOT_FOUND: 404,
  SESSION_RETIRED: 409,
  REGISTRATION_CONFLICT: 409,
};

export const registerPresenceSessionRpcSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      sessionId: z.string().uuid(),
      registrationId: z.string().uuid(),
      sessionSpaceId: z.string().uuid().nullable(),
      expiresAt: z.string(),
      refreshed: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(presenceSessionRpcErrorCodes),
    })
    .strict(),
]);

export const heartbeatPresenceSessionRpcSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      expiresAt: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(presenceSessionRpcErrorCodes),
    })
    .strict(),
]);

export const disconnectPresenceSessionRpcSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      retiredAt: z.string(),
      alreadyDisconnected: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(presenceSessionRpcErrorCodes),
    })
    .strict(),
]);

export type RegisterPresenceSessionRpcResult = z.infer<typeof registerPresenceSessionRpcSchema>;
export type HeartbeatPresenceSessionRpcResult = z.infer<typeof heartbeatPresenceSessionRpcSchema>;
export type DisconnectPresenceSessionRpcResult = z.infer<typeof disconnectPresenceSessionRpcSchema>;
