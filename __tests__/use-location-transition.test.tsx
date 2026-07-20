import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocationTransition } from '@/hooks/useLocationTransition';
import { fetchPresenceSnapshot } from '@/hooks/queries/usePresenceSnapshot';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import { invalidatePresenceClientLifecycle } from '@/lib/presence/client-lifecycle';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';

function snapshot(spaceId: string | null, version: number) {
  return {
    serverTime: '2026-07-18T12:00:00.000Z',
    companyId: COMPANY_ID,
    viewerUserId: USER_ID,
    currentUser: { initialPlacementCompletedAt: '2026-07-01T00:00:00.000Z' },
    users: [{
      id: USER_ID,
      displayName: 'User',
      avatarUrl: null,
      currentSpaceId: spaceId,
      locationVersion: version,
      availabilityStatus: 'online',
      isConnected: true,
      isOccupyingCurrentSpace: spaceId !== null,
      displayStatus: 'online',
      statusMessage: null,
    }],
  };
}

describe('useLocationTransition reconcile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for a pre-commit snapshot without aborting it before authoritative reconciliation', async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    let snapshotRequests = 0;
    let preCommitSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/presence/snapshot') {
        snapshotRequests += 1;
        if (snapshotRequests === 1) {
          preCommitSignal = init?.signal ?? undefined;
          return oldResponse;
        }
        return Response.json(snapshot(SPACE_ID, 10));
      }
      return Response.json({
        success: true,
        code: 'LOCATION_UPDATED',
        transitionId: '55555555-5555-4555-8555-555555555555',
        previousSpaceId: null,
        currentSpaceId: SPACE_ID,
        locationVersion: 10,
        alreadyApplied: false,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFindSpy = vi.spyOn(queryClient.getQueryCache(), 'find');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const oldQuery = queryClient.fetchQuery({
      queryKey: presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
      queryFn: ({ signal }) => fetchPresenceSnapshot(COMPANY_ID, USER_ID, { signal }),
    }).catch(() => undefined);
    const { result } = renderHook(() => useLocationTransition({
      companyId: COMPANY_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
      rotateSession: async () => null,
    }), { wrapper });

    const transition = result.current.transitionLocation({ spaceId: SPACE_ID, reason: 'manual-enter' });
    await vi.waitFor(() => expect(queryFindSpy).toHaveBeenCalledWith({
      queryKey: presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
      exact: true,
    }));
    expect(snapshotRequests).toBe(1);
    expect(preCommitSignal?.aborted).toBe(false);

    resolveOld(Response.json(snapshot(null, 9)));
    let outcome: Awaited<ReturnType<typeof result.current.transitionLocation>> | null = null;
    await act(async () => {
      outcome = await transition;
    });

    expect(outcome).toMatchObject({ ok: true });
    expect(snapshotRequests).toBe(2);
    expect(preCommitSignal?.aborted).toBe(false);
    expect(queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID)))
      .toMatchObject({ users: [{ currentSpaceId: SPACE_ID, locationVersion: 10 }] });

    await oldQuery;
    expect(queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID)))
      .toMatchObject({ users: [{ currentSpaceId: SPACE_ID, locationVersion: 10 }] });
  });

  it('does not recreate scoped cache when disposed during a delayed direct reconcile', async () => {
    let resolveSnapshot!: (response: Response) => void;
    const delayedSnapshot = new Promise<Response>((resolve) => { resolveSnapshot = resolve; });
    let snapshotRequested = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/presence/snapshot') {
        snapshotRequested = true;
        return delayedSnapshot;
      }
      return Response.json({
        success: true,
        code: 'LOCATION_UPDATED',
        transitionId: '55555555-5555-4555-8555-555555555555',
        previousSpaceId: null,
        currentSpaceId: SPACE_ID,
        locationVersion: 10,
        alreadyApplied: false,
      });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useLocationTransition({
      companyId: COMPANY_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
      rotateSession: async () => null,
    }), { wrapper });

    const transition = hook.result.current.transitionLocation({
      spaceId: SPACE_ID,
      reason: 'manual-enter',
    });
    await vi.waitFor(() => expect(snapshotRequested).toBe(true));
    hook.unmount();
    queryClient.removeQueries({ queryKey: presenceQueryKeys.all });
    resolveSnapshot(Response.json(snapshot(SPACE_ID, 10)));

    expect(await transition).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
    expect(queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID))).toBeUndefined();
  });

  it('keeps the committed coordinator usable through the StrictMode effect probe', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/presence/snapshot'
        ? Response.json(snapshot(SPACE_ID, 10))
        : Response.json({
            success: true,
            code: 'LOCATION_UPDATED',
            transitionId: '55555555-5555-4555-8555-555555555555',
            previousSpaceId: null,
            currentSpaceId: SPACE_ID,
            locationVersion: 10,
            alreadyApplied: false,
          })
    ));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </React.StrictMode>
    );
    const { result } = renderHook(() => useLocationTransition({
      companyId: COMPANY_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
      rotateSession: async () => null,
    }), { wrapper });

    await expect(result.current.transitionLocation({ spaceId: SPACE_ID, reason: 'manual-enter' }))
      .resolves.toMatchObject({ ok: true });
  });

  it('does not repopulate cache after logout invalidates lifecycle while provider is mounted', async () => {
    let resolveSnapshot!: (response: Response) => void;
    const delayedSnapshot = new Promise<Response>((resolve) => { resolveSnapshot = resolve; });
    let snapshotRequested = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/presence/snapshot') {
        snapshotRequested = true;
        return delayedSnapshot;
      }
      return Response.json({
        success: true,
        code: 'LOCATION_UPDATED',
        transitionId: '55555555-5555-4555-8555-555555555555',
        previousSpaceId: null,
        currentSpaceId: SPACE_ID,
        locationVersion: 10,
        alreadyApplied: false,
      });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useLocationTransition({
      companyId: COMPANY_ID,
      userId: USER_ID,
      sessionId: SESSION_ID,
      rotateSession: async () => null,
    }), { wrapper });
    const transition = hook.result.current.transitionLocation({ spaceId: SPACE_ID, reason: 'manual-enter' });
    await vi.waitFor(() => expect(snapshotRequested).toBe(true));

    invalidatePresenceClientLifecycle();
    queryClient.removeQueries({ queryKey: presenceQueryKeys.all });
    resolveSnapshot(Response.json(snapshot(SPACE_ID, 10)));

    expect(await transition).toMatchObject({ ok: false });
    expect(queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID))).toBeUndefined();
    hook.unmount();
  });
});
