'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PRESENCE_QUERY_KEY = ['user-presence'] as const;
const REGISTER_URL = '/api/presence/sessions';
const HEARTBEAT_INTERVAL_MS = 30_000;
const REGISTER_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;
const SESSION_RETIRED_CODE = 'SESSION_RETIRED';

interface PresenceSessionResponse {
  sessionId?: unknown;
  session_id?: unknown;
  code?: unknown;
}

interface UsePresenceSessionResult {
  sessionId: string | null;
}

interface RegisterOptions {
  hasRotatedForCycle: boolean;
  retryAttempt: number;
}

interface RetirementOptions {
  source: 'register' | 'heartbeat';
  hasRotatedForCycle: boolean;
  requestUserId: string;
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

export function usePresenceSession(currentUserId: string | null): UsePresenceSessionResult {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const registrationIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerInFlightRef = useRef(false);
  const registerRequestIdRef = useRef(0);
  const heartbeatInFlightRef = useRef(false);
  const retirementInFlightRef = useRef(false);
  const isMountedRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

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
    heartbeatInFlightRef.current = false;
    retirementInFlightRef.current = false;
    setCurrentSessionId(null);
  };

  const isCurrentUserRequest = (requestUserId: string): boolean => {
    return isMountedRef.current && activeUserIdRef.current === requestUserId;
  };

  const sendDisconnectBeacon = (): void => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      return;
    }

    const url = `/api/presence/sessions/${activeSessionId}/disconnect`;
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

  const register = async (options: RegisterOptions): Promise<void> => {
    if (!currentUserId || registerInFlightRef.current) {
      return;
    }

    const requestUserId = currentUserId;
    const registerRequestId = registerRequestIdRef.current + 1;
    registerRequestIdRef.current = registerRequestId;
    registerInFlightRef.current = true;
    clearRetryTimeout();

    try {
      const registrationId = ensureRegistrationId();
      const response = await fetch(REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId }),
      });
      const payload = await readJson(response);

      if (response.ok) {
        const nextSessionId = getSessionId(payload);
        if (!nextSessionId) {
          throw new Error('Presence session register response did not include sessionId');
        }

        if (!isCurrentUserRequest(requestUserId)) {
          return;
        }

        retirementInFlightRef.current = false;
        setCurrentSessionId(nextSessionId);
        startHeartbeatInterval(() => {
          void heartbeat();
        });
        return;
      }

      if (response.status === 409 && getRetirementCode(payload) === SESSION_RETIRED_CODE) {
        if (!isCurrentUserRequest(requestUserId)) {
          return;
        }
        if (registerRequestIdRef.current === registerRequestId) {
          registerInFlightRef.current = false;
        }
        await handleSessionRetired({
          source: 'register',
          hasRotatedForCycle: options.hasRotatedForCycle,
          requestUserId,
        });
        return;
      }

      scheduleRegisterRetry(options.retryAttempt, requestUserId, options.hasRotatedForCycle);
    } catch (error) {
      if (error instanceof Error && error.message.includes('sessionId')) {
        console.error('[PresenceSession] Failed to register presence session:', error);
      }
      scheduleRegisterRetry(options.retryAttempt, requestUserId, options.hasRotatedForCycle);
    } finally {
      if (registerRequestIdRef.current === registerRequestId) {
        registerInFlightRef.current = false;
      }
    }
  };

  const scheduleRegisterRetry = (
    retryAttempt: number,
    requestUserId: string,
    hasRotatedForCycle: boolean
  ): void => {
    if (!currentUserId || !isCurrentUserRequest(requestUserId)) {
      return;
    }

    const delay = getRegisterRetryDelay(retryAttempt);
    retryTimeoutRef.current = setTimeout(() => {
      if (isCurrentUserRequest(requestUserId)) {
        void register({ hasRotatedForCycle, retryAttempt: retryAttempt + 1 });
      }
    }, delay);
  };

  const handleSessionRetired = async (options: RetirementOptions): Promise<void> => {
    if (!isCurrentUserRequest(options.requestUserId)) {
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
    clearHeartbeatInterval();
    setCurrentSessionId(null);
    rotateRegistrationId();
    await register({ hasRotatedForCycle: true, retryAttempt: 0 });
  };

  const heartbeat = async (): Promise<void> => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId || heartbeatInFlightRef.current) {
      return;
    }

    const requestUserId = currentUserId;
    if (!requestUserId) {
      return;
    }

    heartbeatInFlightRef.current = true;

    try {
      const response = await fetch(`/api/presence/sessions/${activeSessionId}/heartbeat`, {
        method: 'POST',
      });
      const payload = await readJson(response);

      if (response.status === 409 && getRetirementCode(payload) === SESSION_RETIRED_CODE) {
        await handleSessionRetired({ source: 'heartbeat', hasRotatedForCycle: false, requestUserId });
      }
    } catch {
      // Network failures do not stop the heartbeat interval; the server lease owns expiry.
    } finally {
      heartbeatInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!currentUserId) {
      previousUserIdRef.current = currentUserId;
      isMountedRef.current = false;
      activeUserIdRef.current = null;
      stopSessionState();
      return undefined;
    }

    isMountedRef.current = true;
    activeUserIdRef.current = currentUserId;

    if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== currentUserId) {
      stopSessionState();
    }
    previousUserIdRef.current = currentUserId;

    const reconcilePresence = (): void => {
      void heartbeat();
      void queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
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

    void register({ hasRotatedForCycle: false, retryAttempt: 0 });

    return () => {
      isMountedRef.current = false;
      if (activeUserIdRef.current === currentUserId) {
        activeUserIdRef.current = null;
      }
      clearHeartbeatInterval();
      clearRetryTimeout();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handleDisconnect);
      window.removeEventListener('beforeunload', handleDisconnect);
    };
  }, [currentUserId, queryClient]);

  return { sessionId };
}
