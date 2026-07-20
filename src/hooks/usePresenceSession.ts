'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import {
  invalidatePresenceClientLifecycle,
  subscribeToPresenceClientInvalidation,
} from '@/lib/presence/client-lifecycle';

const REGISTER_URL = '/api/presence/sessions';
const HEARTBEAT_INTERVAL_MS = 30_000;
const REGISTER_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;
const SESSION_RETIRED_CODE = 'SESSION_RETIRED';
const AUTH_SESSION_REVOKED_CODE = 'AUTH_SESSION_REVOKED';
const NO_COMPANY_CODE = 'NO_COMPANY';
const COMPANY_SCOPE_CHANGED_CODE = 'PRESENCE_COMPANY_SCOPE_CHANGED';

interface PresenceSessionResponse {
  sessionId?: unknown;
  session_id?: unknown;
  code?: unknown;
  companyId?: unknown;
}

interface UsePresenceSessionResult {
  sessionId: string | null;
  status: 'idle' | 'registering' | 'registered' | 'rotating';
  rotateSession: () => Promise<string | null>;
}

interface RegisterOptions {
  hasRotatedForCycle: boolean;
  retryAttempt: number;
}

interface RetirementOptions {
  source: 'register' | 'heartbeat';
  hasRotatedForCycle: boolean;
  requestUserId: string;
  requestCompanyId: string | null;
}

function getRandomRegistrationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  throw new Error('crypto.randomUUID is required to register a presence session');
}

function getRetirementCode(payload: PresenceSessionResponse | null): string | null {
  return typeof payload?.code === 'string' ? payload.code : null;
}

function getSessionId(payload: PresenceSessionResponse | null): string | null {
  if (typeof payload?.sessionId === 'string') {
    return payload.sessionId;
  }

  if (typeof payload?.session_id === 'string') {
    return payload.session_id;
  }

  return null;
}

async function readJson(response: Response): Promise<PresenceSessionResponse | null> {
  try {
    return (await response.json()) as PresenceSessionResponse;
  } catch {
    return null;
  }
}

function getRegisterRetryDelay(attempt: number): number {
  return REGISTER_RETRY_DELAYS_MS[Math.min(attempt, REGISTER_RETRY_DELAYS_MS.length - 1)];
}

export function usePresenceSession(
  currentUserId: string | null,
  companyId?: string | null
): UsePresenceSessionResult {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<UsePresenceSessionResult['status']>('idle');

  const registrationIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerInFlightRef = useRef(false);
  const registerRequestIdRef = useRef(0);
  const heartbeatInFlightSessionRef = useRef<string | null>(null);
  const retirementInFlightRef = useRef(false);
  const isMountedRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const activeCompanyIdRef = useRef<string | null>(null);
  const previousIdentityRef = useRef<string | null | undefined>(undefined);
  const registerRef = useRef<(options: RegisterOptions) => Promise<string | null>>(async () => null);
  const explicitRotationPromiseRef = useRef<Promise<string | null> | null>(null);
  const explicitRotationGenerationRef = useRef(0);
  const disconnectedSessionIdsRef = useRef(new Set<string>());

  const clearHeartbeatInterval = (): void => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const clearRetryTimeout = (): void => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const setCurrentSessionId = (nextSessionId: string | null): void => {
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
  };

  const ensureRegistrationId = (): string => {
    if (!registrationIdRef.current) {
      registrationIdRef.current = getRandomRegistrationId();
    }

    return registrationIdRef.current;
  };

  const rotateRegistrationId = (): string => {
    registrationIdRef.current = getRandomRegistrationId();
    return registrationIdRef.current;
  };

  const stopSessionState = (): void => {
    clearHeartbeatInterval();
    clearRetryTimeout();
    registerInFlightRef.current = false;
    heartbeatInFlightSessionRef.current = null;
    retirementInFlightRef.current = false;
    registerRequestIdRef.current += 1;
    explicitRotationGenerationRef.current += 1;
    explicitRotationPromiseRef.current = null;
    setCurrentSessionId(null);
    setStatus('idle');
  };

  const isCurrentUserRequest = (requestUserId: string, requestCompanyId: string | null): boolean => {
    return isMountedRef.current &&
      activeUserIdRef.current === requestUserId &&
      activeCompanyIdRef.current === requestCompanyId;
  };

  const sendDisconnectBeacon = (sessionToDisconnect = sessionIdRef.current): void => {
    if (!sessionToDisconnect || disconnectedSessionIdsRef.current.has(sessionToDisconnect)) {
      return;
    }
    disconnectedSessionIdsRef.current.add(sessionToDisconnect);

    const url = `/api/presence/sessions/${sessionToDisconnect}/disconnect`;
    const didQueue = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      ? navigator.sendBeacon(url, '{}')
      : false;

    if (!didQueue) {
      void fetch(url, { method: 'POST', keepalive: true }).catch((error: unknown) => {
        console.error('[PresenceSession] Failed to send disconnect keepalive request:', error);
      });
    }
  };

  const startHeartbeatInterval = (heartbeat: () => void): void => {
    clearHeartbeatInterval();
    heartbeatIntervalRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  };

  const register = async (options: RegisterOptions): Promise<string | null> => {
    if (!currentUserId || !companyId || registerInFlightRef.current) {
      return null;
    }

    const requestUserId = currentUserId;
    const requestCompanyId = companyId;
    const registerRequestId = registerRequestIdRef.current + 1;
    registerRequestIdRef.current = registerRequestId;
    registerInFlightRef.current = true;
    if (status !== 'rotating') setStatus('registering');
    clearRetryTimeout();

    try {
      const registrationId = ensureRegistrationId();
      const response = await fetch(REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          expectedCompanyId: requestCompanyId,
        }),
      });
      const payload = await readJson(response);

      if (
        !isCurrentUserRequest(requestUserId, requestCompanyId) ||
        registerRequestIdRef.current !== registerRequestId
      ) {
        if (response.ok) {
          sendDisconnectBeacon(getSessionId(payload));
        }
        return null;
      }

      if (response.ok) {
        const nextSessionId = getSessionId(payload);
        const responseCompanyId =
          typeof payload === 'object' &&
          payload !== null &&
          typeof (payload as PresenceSessionResponse).companyId === 'string'
            ? (payload as PresenceSessionResponse).companyId
            : null;
        if (!nextSessionId || responseCompanyId !== requestCompanyId) {
          throw new Error('Presence session register response did not include sessionId');
        }

        retirementInFlightRef.current = false;
        setCurrentSessionId(nextSessionId);
        setStatus('registered');
        if (requestCompanyId) {
          void queryClient.invalidateQueries({
            queryKey: presenceQueryKeys.snapshot(
              requestCompanyId,
              requestUserId,
            ),
            exact: true,
            refetchType: 'active',
          });
        }
        startHeartbeatInterval(() => {
          void heartbeat();
        });
        return nextSessionId;
      }

      if (
        response.status === 401 &&
        getRetirementCode(payload) === AUTH_SESSION_REVOKED_CODE
      ) {
        invalidatePresenceClientLifecycle({
          reason: 'auth-session-revoked',
          companyId: requestCompanyId ?? undefined,
          userId: requestUserId,
        });
        return null;
      }

      if (
        (response.status === 403 && getRetirementCode(payload) === NO_COMPANY_CODE) ||
        (response.status === 409 &&
          getRetirementCode(payload) === COMPANY_SCOPE_CHANGED_CODE)
      ) {
        invalidatePresenceClientLifecycle({
          reason: 'membership-scope-invalidated',
          companyId: requestCompanyId,
          userId: requestUserId,
        });
        return null;
      }

      if (response.status === 409 && getRetirementCode(payload) === SESSION_RETIRED_CODE) {
        if (registerRequestIdRef.current === registerRequestId) {
          registerInFlightRef.current = false;
        }
        await handleSessionRetired({
          source: 'register',
          hasRotatedForCycle: options.hasRotatedForCycle,
          requestUserId,
          requestCompanyId,
        });
        return sessionIdRef.current;
      }

      scheduleRegisterRetry(options.retryAttempt, requestUserId, requestCompanyId, options.hasRotatedForCycle);
      return null;
    } catch (error) {
      if (
        !isCurrentUserRequest(requestUserId, requestCompanyId) ||
        registerRequestIdRef.current !== registerRequestId
      ) {
        return null;
      }
      if (error instanceof Error && error.message.includes('sessionId')) {
        console.error('[PresenceSession] Failed to register presence session:', error);
      }
      scheduleRegisterRetry(options.retryAttempt, requestUserId, requestCompanyId, options.hasRotatedForCycle);
      return null;
    } finally {
      if (registerRequestIdRef.current === registerRequestId) {
        registerInFlightRef.current = false;
      }
    }
  };
  useEffect(() => {
    registerRef.current = register;
  });

  const rotateSession = useCallback((): Promise<string | null> => {
    if (explicitRotationPromiseRef.current) return explicitRotationPromiseRef.current;

    const requestUserId = activeUserIdRef.current;
    const requestCompanyId = activeCompanyIdRef.current;
    if (!requestUserId || !isMountedRef.current) return Promise.resolve(null);
    const rotationGeneration = explicitRotationGenerationRef.current + 1;
    explicitRotationGenerationRef.current = rotationGeneration;

    const rotation = (async () => {
      retirementInFlightRef.current = true;
      clearHeartbeatInterval();
      clearRetryTimeout();
      registerInFlightRef.current = false;
      setStatus('rotating');
      setCurrentSessionId(null);
      rotateRegistrationId();
      const nextSessionId = await registerRef.current({
        hasRotatedForCycle: true,
        retryAttempt: 0,
      });
      return isCurrentUserRequest(requestUserId, requestCompanyId)
        ? (nextSessionId ?? sessionIdRef.current)
        : null;
    })().finally(() => {
      if (explicitRotationGenerationRef.current === rotationGeneration) {
        explicitRotationPromiseRef.current = null;
        retirementInFlightRef.current = false;
      }
    });
    explicitRotationPromiseRef.current = rotation;
    return rotation;
  }, []);

  const scheduleRegisterRetry = (
    retryAttempt: number,
    requestUserId: string,
    requestCompanyId: string | null,
    hasRotatedForCycle: boolean
  ): void => {
    if (!currentUserId || !isCurrentUserRequest(requestUserId, requestCompanyId)) {
      return;
    }

    const delay = getRegisterRetryDelay(retryAttempt);
    retryTimeoutRef.current = setTimeout(() => {
      if (isCurrentUserRequest(requestUserId, requestCompanyId)) {
        void register({ hasRotatedForCycle, retryAttempt: retryAttempt + 1 });
      }
    }, delay);
  };

  const handleSessionRetired = async (options: RetirementOptions): Promise<void> => {
    if (!isCurrentUserRequest(options.requestUserId, options.requestCompanyId)) {
      return;
    }

    if (options.hasRotatedForCycle) {
      console.warn('[PresenceSession] Session registration retired twice; stopping rotation cycle.');
      retirementInFlightRef.current = false;
      return;
    }

    if (retirementInFlightRef.current && options.source === 'heartbeat') {
      return;
    }

    retirementInFlightRef.current = true;
    setStatus('rotating');
    clearHeartbeatInterval();
    setCurrentSessionId(null);
    rotateRegistrationId();
    await register({ hasRotatedForCycle: true, retryAttempt: 0 });
  };

  const heartbeat = async (): Promise<void> => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId || heartbeatInFlightSessionRef.current === activeSessionId) {
      return;
    }

    const requestUserId = currentUserId;
    const requestCompanyId = companyId ?? null;
    if (!requestUserId) {
      return;
    }

    heartbeatInFlightSessionRef.current = activeSessionId;

    try {
      const response = await fetch(`/api/presence/sessions/${activeSessionId}/heartbeat`, {
        method: 'POST',
      });
      const payload = await readJson(response);

      if (
        response.status === 401 &&
        getRetirementCode(payload) === AUTH_SESSION_REVOKED_CODE &&
        sessionIdRef.current === activeSessionId &&
        isCurrentUserRequest(requestUserId, requestCompanyId)
      ) {
        invalidatePresenceClientLifecycle({
          reason: 'auth-session-revoked',
          companyId: requestCompanyId ?? undefined,
          userId: requestUserId,
        });
        return;
      }

      if (
        response.status === 403 &&
        getRetirementCode(payload) === NO_COMPANY_CODE &&
        sessionIdRef.current === activeSessionId &&
        isCurrentUserRequest(requestUserId, requestCompanyId)
      ) {
        invalidatePresenceClientLifecycle({
          reason: 'membership-scope-invalidated',
          companyId: requestCompanyId ?? undefined,
          userId: requestUserId,
        });
        return;
      }

      if (
        response.status === 409 &&
        getRetirementCode(payload) === SESSION_RETIRED_CODE &&
        sessionIdRef.current === activeSessionId &&
        isCurrentUserRequest(requestUserId, requestCompanyId)
      ) {
        await handleSessionRetired({
          source: 'heartbeat',
          hasRotatedForCycle: false,
          requestUserId,
          requestCompanyId,
        });
      }
    } catch {
      // Network failures do not stop the heartbeat interval; the server lease owns expiry.
    } finally {
      if (heartbeatInFlightSessionRef.current === activeSessionId) {
        heartbeatInFlightSessionRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!currentUserId || !companyId) {
      previousIdentityRef.current = null;
      isMountedRef.current = false;
      activeUserIdRef.current = null;
      activeCompanyIdRef.current = null;
      stopSessionState();
      return undefined;
    }

    isMountedRef.current = true;
    activeUserIdRef.current = currentUserId;
    activeCompanyIdRef.current = companyId ?? null;
    const currentIdentity = `${companyId ?? ''}:${currentUserId}`;

    if (previousIdentityRef.current !== undefined && previousIdentityRef.current !== currentIdentity) {
      stopSessionState();
      rotateRegistrationId();
    }
    previousIdentityRef.current = currentIdentity;

    const reconcilePresence = (): void => {
      void heartbeat();
      if (companyId && currentUserId) {
        void queryClient.invalidateQueries({
          queryKey: presenceQueryKeys.snapshot(companyId, currentUserId),
        });
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        reconcilePresence();
      }
    };

    const handlePageShow = (): void => {
      reconcilePresence();
    };

    const handleOnline = (): void => {
      reconcilePresence();
    };

    const handleDisconnect = (): void => {
      sendDisconnectBeacon();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handleDisconnect);
    window.addEventListener('beforeunload', handleDisconnect);

    const unsubscribeInvalidation = subscribeToPresenceClientInvalidation(
      (invalidation) => {
        if (
          (invalidation.reason === 'auth-session-revoked' ||
            invalidation.reason === 'membership-scope-invalidated') &&
          (!invalidation.userId || invalidation.userId === currentUserId) &&
          (!invalidation.companyId || invalidation.companyId === (companyId ?? null))
        ) {
          stopSessionState();
          isMountedRef.current = false;
          activeUserIdRef.current = null;
          activeCompanyIdRef.current = null;
        }
      },
    );

    void register({ hasRotatedForCycle: false, retryAttempt: 0 });

    return () => {
      sendDisconnectBeacon();
      isMountedRef.current = false;
      if (
        activeUserIdRef.current === currentUserId &&
        activeCompanyIdRef.current === (companyId ?? null)
      ) {
        activeUserIdRef.current = null;
        activeCompanyIdRef.current = null;
      }
      clearHeartbeatInterval();
      clearRetryTimeout();
      unsubscribeInvalidation();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handleDisconnect);
      window.removeEventListener('beforeunload', handleDisconnect);
    };
  // Identity scope owns this lifecycle; request helpers intentionally read the
  // latest render through refs and must not restart registration every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, currentUserId, queryClient]);

  return { sessionId, status, rotateSession };
}
