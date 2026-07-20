import type { PropsWithChildren, ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ snapshotError: null as unknown }));

vi.mock('@/hooks/queries/usePresenceSnapshot', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/queries/usePresenceSnapshot')>();
  return {
    ...actual,
    usePresenceSnapshot: () => ({
      data: undefined,
      isLoading: false,
      error: mocks.snapshotError,
    }),
  };
});

vi.mock('@/hooks/usePresenceRealtime', () => ({
  usePresenceRealtime: () => 'disabled',
}));

import { useUserPresence } from '@/hooks/useUserPresence';
import { PresenceSnapshotRequestError } from '@/hooks/queries/usePresenceSnapshot';
import { presenceQueryKeys } from '@/lib/presence/query-keys';
import { presenceStorageKeys } from '@/lib/presence/storage-keys';
import { subscribeToPresenceClientInvalidation } from '@/lib/presence/client-lifecycle';

const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function installMemoryLocalStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren): ReactElement {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

afterEach(() => {
  cleanup();
  mocks.snapshotError = null;
});

describe('remote Presence membership invalidation', () => {
  it('clears the old scope and emits a membership refresh event', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const storage = installMemoryLocalStorage();
    const storageKey = presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID);
    storage.setItem(storageKey, 'space-1');
    queryClient.setQueryData(
      presenceQueryKeys.snapshot(COMPANY_ID, USER_ID),
      { stale: 'old-company-snapshot' },
    );
    mocks.snapshotError = new PresenceSnapshotRequestError({
      status: 409,
      code: 'PRESENCE_VIEWER_NO_COMPANY',
      message: 'Viewer no longer belongs to a company',
      retryable: false,
    });

    const invalidations: string[] = [];
    const unsubscribe = subscribeToPresenceClientInvalidation((invalidation) => {
      invalidations.push(invalidation.reason);
    });
    renderHook(
      () => useUserPresence(USER_ID, COMPANY_ID, 'session-1'),
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() =>
      expect(invalidations).toContain('membership-scope-invalidated'),
    );
    expect(
      queryClient.getQueryData(presenceQueryKeys.snapshot(COMPANY_ID, USER_ID)),
    ).toBeUndefined();
    expect(storage.getItem(storageKey)).toBeNull();
    unsubscribe();
  });
});
