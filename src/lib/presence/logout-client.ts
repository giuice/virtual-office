'use client';

import { z } from 'zod';
import { handleLegacyLocationClientUpgrade } from '@/lib/presence/legacy-client-upgrade';

const DEFAULT_ATTEMPT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;

const logoutSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    code: z.enum(['LOCATION_UPDATED', 'LOCATION_UNCHANGED']),
    transitionId: z.string().uuid(),
    previousSpaceId: z.string().uuid().nullable(),
    currentSpaceId: z.string().uuid().nullable(),
    locationVersion: z.number().int().nullable(),
    alreadyApplied: z.boolean(),
  })
  .strict();

const logoutErrorResponseSchema = z
  .object({
    success: z.literal(false),
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
    transitionId: z.string().uuid().nullable(),
  })
  .strict();

const logoutResponseSchema = z.union([
  logoutSuccessResponseSchema,
  logoutErrorResponseSchema,
]);

type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export type PresenceLogoutFenceStatus =
  | 'confirmed'
  | 'already-fenced'
  | 'already-unauthenticated';

export interface PresenceLogoutFenceResult {
  readonly transitionId: string;
  readonly status: PresenceLogoutFenceStatus;
}

export interface FencePresenceLogoutOptions {
  readonly fetcher?: typeof fetch;
  readonly randomUUID?: () => string;
  readonly maxAttempts?: number;
  readonly attemptTimeoutMs?: number;
}

export class PresenceLogoutError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly transitionId: string;

  constructor(
    message: string,
    options: {
      code: string;
      retryable: boolean;
      transitionId: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'PresenceLogoutError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.transitionId = options.transitionId;
  }
}

async function readLogoutResponse(response: Response): Promise<LogoutResponse | null> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = logoutResponseSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function terminalFenceStatus(code: string): PresenceLogoutFenceStatus | null {
  if (code === 'AUTH_SESSION_REVOKED') return 'already-fenced';
  if (code === 'UNAUTHORIZED') return 'already-unauthenticated';
  return null;
}

function isMatchingTransition(payload: LogoutResponse, transitionId: string): boolean {
  return payload.transitionId === transitionId;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  transitionId: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher('/api/presence/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fencePresenceLogout(
  options: FencePresenceLogoutOptions = {},
): Promise<PresenceLogoutFenceResult> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const attemptTimeoutMs = Math.max(1, options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS);
  const transitionId = randomUUID();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(fetcher, transitionId, attemptTimeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) continue;
      throw new PresenceLogoutError('Presence logout failed to fetch and could not be confirmed', {
        code: 'NETWORK_ERROR',
        retryable: true,
        transitionId,
        cause: error,
      });
    }

    const payload = await readLogoutResponse(response);
    if (!payload || !isMatchingTransition(payload, transitionId)) {
      const retryable = response.ok || response.status >= 500;
      if (retryable && attempt + 1 < maxAttempts) continue;
      throw new PresenceLogoutError('Presence logout returned an invalid response', {
        code: 'INVALID_RESPONSE',
        retryable,
        transitionId,
        cause: lastError,
      });
    }

    if (payload.success) {
      return { transitionId, status: 'confirmed' };
    }

    handleLegacyLocationClientUpgrade(response, payload);
    const terminalStatus = terminalFenceStatus(payload.code);
    if (terminalStatus) {
      return { transitionId, status: terminalStatus };
    }

    if (payload.retryable && attempt + 1 < maxAttempts) continue;
    throw new PresenceLogoutError(payload.message || 'Presence logout could not be confirmed', {
      code: payload.code,
      retryable: payload.retryable,
      transitionId,
    });
  }

  throw new PresenceLogoutError('Presence logout could not be confirmed', {
    code: 'INTERNAL_ERROR',
    retryable: true,
    transitionId,
    cause: lastError,
  });
}
