import type { PropsWithChildren, ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers: Array<{
    kind: string;
    filter: Record<string, string>;
    callback: () => void;
  }> = [];
  let subscriptionCallback: ((status: string) => void) | null = null;
  const track = vi.fn().mockResolvedValue(undefined);
  const untrack = vi.fn().mockResolvedValue(undefined);
  const emitPresenceEvent = vi.fn();
  const channel = {
    on: vi.fn((kind: string, filter: Record<string, string>, callback: () => void) => {
      handlers.push({ kind, filter, callback });
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscriptionCallback = callback;
      return channel;
    }),
    track,
    untrack,
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
  };

  return {
    handlers,
    channel,
    client,
    track,
    untrack,
    emitPresenceEvent,
    getSubscriptionCallback: () => subscriptionCallback,
    resetSubscriptionCallback: () => {
      subscriptionCallback = null;
    },
  };
});

vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => mocks.client,
}));
vi.mock('@/lib/presence/observability', () => ({
  emitPresenceEvent: mocks.emitPresenceEvent,
}));

import { usePresenceRealtime } from '@/hooks/usePresenceRealtime';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import {
  getPresenceScopeInvalidationReason,
  groupPresenceUsersBySpace,
} from '@/hooks/useUserPresence';
import { PresenceSnapshotRequestError } from '@/hooks/queries/usePresenceSnapshot';
import type { UserPresenceData } from '@/types/database';

const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';

describe('Presence scope invalidation', () => {
  it('classifies membership loss separately from Auth revocation', () => {
    expect(
      getPresenceScopeInvalidationReason(
        new PresenceSnapshotRequestError({
          status: 409,
          code: 'PRESENCE_VIEWER_NO_COMPANY',
          message: 'Viewer has no company',
          retryable: false,
        }),
      ),
    ).toBe('membership-scope-invalidated');

    expect(
      getPresenceScopeInvalidationReason(
        new PresenceSnapshotRequestError({
          status: 401,
          code: 'AUTH_SESSION_REVOKED',
          message: 'Auth session revoked',
          retryable: false,
        }),
      ),
    ).toBe('auth-session-revoked');

    expect(
      getPresenceScopeInvalidationReason(
        new PresenceSnapshotRequestError({
          status: 200,
          code: 'SNAPSHOT_IDENTITY_MISMATCH',
          message: 'Company scope changed',
          retryable: false,
        }),
      ),
    ).toBe('membership-scope-invalidated');
  });
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mocks.handlers.splice(0);
  mocks.resetSubscriptionCallback();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('presence Realtime invalidation', () => {
  it('groups only revision-valid occupants with a non-null space', () => {
    const base: UserPresenceData = {
      id: USER_ID,
      displayName: 'Ada',
      currentSpaceId: '55555555-5555-4555-8555-555555555555',
      isOccupyingCurrentSpace: true,
    };
    const grouped = groupPresenceUsersBySpace([
      base,
      { ...base, id: '22222222-2222-4222-8222-222222222222', currentSpaceId: null },
      { ...base, id: '44444444-4444-4444-8444-444444444444', isOccupyingCurrentSpace: false },
    ]);

    expect([...grouped.keys()]).toEqual([base.currentSpaceId]);
    expect(grouped.get(base.currentSpaceId)).toEqual([base]);
    expect(grouped.has(null)).toBe(false);
  });

  it('subscribes to one private company topic with a non-authoritative payload', async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => usePresenceRealtime(COMPANY_ID, USER_ID, SESSION_ID),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());
    expect(mocks.client.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:presence`,
      { config: { private: true, presence: { key: USER_ID } } },
    );

    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
    });

    expect(result.current).toBe('subscribed');
    expect(mocks.track).toHaveBeenCalledWith({ payloadVersion: 1 });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /status|space|avatar|last_seen|access/i,
    );
  });

  it('does not track until the authoritative session registration has committed', async () => {
    const queryClient = new QueryClient();
    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) =>
        usePresenceRealtime(COMPANY_ID, USER_ID, sessionId),
      {
        initialProps: { sessionId: null as string | null },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());
    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
    });
    expect(mocks.track).not.toHaveBeenCalled();

    rerender({ sessionId: SESSION_ID });
    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith({ payloadVersion: 1 }),
    );
    expect(mocks.client.channel).toHaveBeenCalledOnce();

    rerender({ sessionId: null });
    await waitFor(() => expect(mocks.untrack).toHaveBeenCalledOnce());
  });

  it('coalesces acceleration bursts while invalidating only the scoped snapshot', async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => usePresenceRealtime(COMPANY_ID, USER_ID, SESSION_ID), {
      wrapper: createWrapper(queryClient),
    });
    await act(async () => Promise.resolve());
    expect(mocks.channel.subscribe).toHaveBeenCalledOnce();

    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
      for (const handler of mocks.handlers) handler.callback();
    });

    expect(mocks.handlers).toHaveLength(5);
    expect(invalidate).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(2_000));
    expect(invalidate).toHaveBeenCalledTimes(2);

    await act(async () => {
      for (const handler of mocks.handlers) handler.callback();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(invalidate).toHaveBeenCalledTimes(3);
    for (const call of invalidate.mock.calls) {
      expect(call[0]).toEqual({
        queryKey: presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
        exact: true,
        refetchType: 'active',
      });
    }
  });

  it('reconciles immediately and again two seconds after subscribe or reconnect', async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => usePresenceRealtime(COMPANY_ID, USER_ID, SESSION_ID), {
      wrapper: createWrapper(queryClient),
    });
    await act(async () => Promise.resolve());

    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(2_000));
    expect(invalidate).toHaveBeenCalledTimes(2);

    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
    });
    expect(invalidate).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      category: 'realtime',
      action: 'subscription',
      resultCode: 'SUBSCRIBED',
    }));
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      category: 'realtime',
      action: 'subscription',
      resultCode: 'RECONNECTED',
    }));
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      category: 'realtime',
      action: 'reconcile',
      resultCode: 'RECONCILE_INVALIDATED',
      stateTransition: 'subscribe-delayed',
    }));
  });

  it('reuses an authoritative snapshot already in flight when subscribing', async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'isFetching').mockReturnValue(1);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => usePresenceRealtime(COMPANY_ID, USER_ID, SESSION_ID), {
      wrapper: createWrapper(queryClient),
    });
    await act(async () => Promise.resolve());

    await act(async () => {
      mocks.getSubscriptionCallback()?.('SUBSCRIBED');
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(2_000));
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('does not recreate the channel for snapshot data changes and exposes degradation', async () => {
    const queryClient = new QueryClient();
    const { result, rerender } = renderHook(
      ({ revision }: { revision: number }) => {
        void revision;
        return usePresenceRealtime(COMPANY_ID, USER_ID, SESSION_ID);
      },
      {
        initialProps: { revision: 1 },
        wrapper: createWrapper(queryClient),
      },
    );
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());

    rerender({ revision: 2 });
    expect(mocks.client.channel).toHaveBeenCalledOnce();

    act(() => mocks.getSubscriptionCallback()?.('CHANNEL_ERROR'));
    expect(result.current).toBe('degraded');
  });
});
