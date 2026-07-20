import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getPresenceClientEpoch,
  invalidatePresenceClientLifecycle,
} from '@/lib/presence/client-lifecycle';
import { presenceQueryKeys } from '@/lib/presence/query-keys';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: mocks.signOut,
    },
  },
}));

function logoutSuccess(transitionId: string, alreadyApplied = false) {
  return {
    success: true as const,
    code: 'LOCATION_UPDATED' as const,
    transitionId,
    previousSpaceId: '11111111-1111-4111-8111-111111111111',
    currentSpaceId: null,
    locationVersion: 2,
    alreadyApplied,
  };
}

function logoutFailure(
  transitionId: string,
  options: { code: string; message: string; retryable: boolean },
) {
  return {
    success: false as const,
    transitionId,
    ...options,
  };
}

function transitionIdFromRequest(init?: RequestInit): string {
  return JSON.parse(String(init?.body)).transitionId as string;
}

function renderAuthHook() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return {
    queryClient,
    ...renderHook(() => useAuth(), { wrapper: Wrapper }),
  };
}

describe('AuthContext atomic presence logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({
      user: { id: 'auth-user-1' },
      session: { access_token: 'not-logged' },
      loading: false,
      error: null,
      initialized: true,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fences presence before clearing the local browser session', async () => {
    const epochBefore = getPresenceClientEpoch();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      Response.json(logoutSuccess(transitionIdFromRequest(init))),
    ));
    vi.stubGlobal('fetch', fetchMock);
    mocks.signOut.mockImplementationOnce(async () => {
      expect(getPresenceClientEpoch()).toBe(epochBefore + 1);
      return { error: null };
    });
    const { result } = renderAuthHook();

    await act(async () => result.current.signOut());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/presence/logout');
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody.transitionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
  });

  it('retries a transient failure with the same transition id', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => Promise.resolve(
      Response.json(logoutFailure(transitionIdFromRequest(init), {
        code: 'PRESENCE_MAINTENANCE',
        message: 'temporarily unavailable',
        retryable: true,
      }), { status: 503 }),
    ));
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => Promise.resolve(
      Response.json(logoutSuccess(transitionIdFromRequest(init))),
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAuthHook();

    await act(async () => result.current.signOut());

    const transitionIds = fetchMock.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)).transitionId
    );
    expect(transitionIds).toHaveLength(2);
    expect(new Set(transitionIds).size).toBe(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('still clears the local auth session when presence storage throws', async () => {
    const epochBefore = getPresenceClientEpoch();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        length: 1,
        key: () => 'vo:presence:company:user:last-space',
        removeItem: () => { throw new DOMException('blocked', 'SecurityError'); },
      },
    });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      Response.json(logoutSuccess(transitionIdFromRequest(init))),
    )));
    const { result, queryClient } = renderAuthHook();
    queryClient.setQueryData([...presenceQueryKeys.all, 'cached'], { tenant: 'a' });

    await act(async () => result.current.signOut());

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getPresenceClientEpoch()).toBe(epochBefore + 1);
    expect(queryClient.getQueriesData({ queryKey: presenceQueryKeys.all })).toEqual([]);
  });

  it('cleans up and signs out locally after a nonretryable Presence failure', async () => {
    const epochBefore = getPresenceClientEpoch();
    const { result, queryClient } = renderAuthHook();
    queryClient.setQueryData([...presenceQueryKeys.all, 'cached'], { tenant: 'a' });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
      logoutFailure(transitionIdFromRequest(init), {
        code: 'INTERNAL_ERROR',
        message: 'logout failed',
        retryable: false,
      }),
      { status: 500 },
    ))));

    await expect(act(async () => result.current.signOut())).rejects.toThrow('logout failed');

    expect(getPresenceClientEpoch()).toBe(epochBefore + 1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(queryClient.getQueriesData({ queryKey: presenceQueryKeys.all })).toEqual([]);
  });

  it('invalidates Presence even when local auth sign-out fails', async () => {
    const epochBefore = getPresenceClientEpoch();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(
      Response.json(logoutSuccess(transitionIdFromRequest(init))),
    )));
    mocks.signOut.mockResolvedValueOnce({ error: new Error('cookie clear failed') });
    const { result } = renderAuthHook();

    await expect(act(async () => result.current.signOut())).rejects.toThrow('cookie clear failed');

    expect(getPresenceClientEpoch()).toBe(epochBefore + 1);
  });

  it('retries network failures to the bound, then still signs out and cleans up', async () => {
    const epochBefore = getPresenceClientEpoch();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAuthHook();

    await expect(act(async () => result.current.signOut())).rejects.toThrow(
      'Unable to reach the authentication service',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const transitionIds = fetchMock.mock.calls.map((call) => transitionIdFromRequest(call[1]));
    expect(new Set(transitionIds).size).toBe(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getPresenceClientEpoch()).toBe(epochBefore + 1);
  });

  it('surfaces exhausted retryable responses after unconditional cleanup', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
      logoutFailure(transitionIdFromRequest(init), {
        code: 'PRESENCE_MAINTENANCE',
        message: 'maintenance window',
        retryable: true,
      }),
      { status: 503 },
    )));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAuthHook();

    await expect(act(async () => result.current.signOut())).rejects.toThrow('maintenance window');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each(['AUTH_SESSION_REVOKED', 'UNAUTHORIZED'])(
    'treats %s as a terminal server fence and completes local sign-out',
    async (code) => {
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
        logoutFailure(transitionIdFromRequest(init), {
          code,
          message: code === 'UNAUTHORIZED' ? 'Authentication required' : 'Authentication session revoked',
          retryable: false,
        }),
        { status: 401 },
      ))));
      const { result } = renderAuthHook();

      await act(async () => result.current.signOut());

      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(result.current.actionError).toBeNull();
    },
  );

  it('accepts an auth-session-revoked follow-up after a lost logout response', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection reset after commit'))
      .mockImplementationOnce((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
        logoutFailure(transitionIdFromRequest(init), {
          code: 'AUTH_SESSION_REVOKED',
          message: 'Authentication session revoked',
          retryable: false,
        }),
        { status: 401 },
      )));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAuthHook();

    await act(async () => result.current.signOut());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const transitionIds = fetchMock.mock.calls.map((call) => transitionIdFromRequest(call[1]));
    expect(new Set(transitionIds).size).toBe(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('prioritizes and preserves both local and Presence boundary errors', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(Response.json(
      logoutFailure(transitionIdFromRequest(init), {
        code: 'INTERNAL_ERROR',
        message: 'presence fence failed',
        retryable: false,
      }),
      { status: 500 },
    ))));
    mocks.signOut.mockResolvedValueOnce({ error: new Error('local credentials remained') });
    const { result } = renderAuthHook();

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.signOut();
      } catch (error) {
        thrownError = error;
      }
    });
    expect(thrownError).toEqual(expect.objectContaining({
      message: 'Local authentication sign-out failed: local credentials remained. Presence logout also failed: presence fence failed',
    }));

    expect(result.current.actionError).toContain('local credentials remained');
    expect(result.current.actionError).toContain('presence fence failed');
  });

  it('attempts local sign-out when the server reports an auth-session fence', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('cookie clear failed') });
    renderAuthHook();

    await act(async () => {
      invalidatePresenceClientLifecycle({
        reason: 'auth-session-revoked',
        companyId: 'company-1',
        userId: 'user-1',
      });
      await Promise.resolve();
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('isolates query cleanup failure and a rejected local sign-out after revocation', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.signOut.mockRejectedValueOnce(new Error('sign-out transport rejected'));
    const { queryClient } = renderAuthHook();
    vi.spyOn(queryClient, 'removeQueries').mockImplementationOnce(() => {
      throw new Error('query cache unavailable');
    });

    act(() => {
      invalidatePresenceClientLifecycle({
        reason: 'auth-session-revoked',
        companyId: 'company-1',
        userId: 'user-1',
      });
    });

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(warning).toHaveBeenCalledWith(
        'Presence query cleanup failed after Auth-session revocation',
      );
      expect(warning).toHaveBeenCalledWith(
        'Local Auth sign-out failed after Presence session revocation',
      );
    });
    warning.mockRestore();
  });
});
