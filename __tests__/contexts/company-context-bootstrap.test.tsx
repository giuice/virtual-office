import React, { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, Space, User } from '@/types/database';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const passiveEffectControl = vi.hoisted(() => ({
  shouldDefer: false,
  pending: [] as Array<() => unknown>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      const [effect, dependencies] = args;
      return actual.useEffect(() => {
        if (passiveEffectControl.shouldDefer) {
          passiveEffectControl.pending.push(effect);
          return undefined;
        }
        return effect();
      }, dependencies);
    },
  };
});
import { __resetProfileSyncCache } from '@/lib/bootstrap/profile-sync';
import { CompanyProvider, useCompany } from '@/contexts/CompanyContext';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { ApiError } from '@/lib/api/client-error';
import { invalidatePresenceClientLifecycle } from '@/lib/presence/client-lifecycle';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  syncUserProfile: vi.fn(),
  getUserById: vi.fn(),
  updateOwnProfile: vi.fn(),
  updateUserRole: vi.fn(),
  removeUserFromCompany: vi.fn(),
  createCompany: vi.fn(),
  getCompany: vi.fn(),
  updateCompany: vi.fn(),
  getUsersByCompany: vi.fn(),
  getSpacesByCompany: vi.fn(),
  usePresenceSession: vi.fn(),
  usePresenceSnapshot: vi.fn(),
  usePresenceRealtime: vi.fn(),
  useLocationTransition: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/lib/api', () => ({
  syncUserProfile: mocks.syncUserProfile,
  getUserById: mocks.getUserById,
  updateOwnProfile: mocks.updateOwnProfile,
  updateUserRole: mocks.updateUserRole,
  removeUserFromCompany: mocks.removeUserFromCompany,
  createCompany: mocks.createCompany,
  getCompany: mocks.getCompany,
  updateCompany: mocks.updateCompany,
  getUsersByCompany: mocks.getUsersByCompany,
  getSpacesByCompany: mocks.getSpacesByCompany,
}));

vi.mock('@/hooks/usePresenceSession', () => ({
  usePresenceSession: mocks.usePresenceSession,
}));

vi.mock('@/hooks/queries/usePresenceSnapshot', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/queries/usePresenceSnapshot')>();
  return {
    ...actual,
    usePresenceSnapshot: mocks.usePresenceSnapshot,
  };
});

vi.mock('@/hooks/usePresenceRealtime', () => ({
  usePresenceRealtime: mocks.usePresenceRealtime,
}));

vi.mock('@/hooks/useLocationTransition', () => ({
  useLocationTransition: mocks.useLocationTransition,
}));

const timestamp = '2026-07-15T00:00:00.000Z';

function makeUser(supabaseUid: string, companyId: string): User {
  return {
    id: `db-${supabaseUid}`,
    supabase_uid: supabaseUid,
    companyId,
    email: `${supabaseUid}@example.com`,
    displayName: `User ${supabaseUid}`,
    status: 'online',
    preferences: {},
    role: 'admin',
    lastActive: timestamp,
    createdAt: timestamp,
    currentSpaceId: null,
  };
}

function makeCompany(id: string): Company {
  return {
    id,
    name: `Company ${id}`,
    adminIds: [`db-${id}`],
    createdAt: timestamp,
    settings: {},
  };
}

function makeSpace(companyId: string): Space {
  return {
    id: `space-${companyId}`,
    companyId,
    name: `Space ${companyId}`,
    type: 'workspace',
    status: 'active',
    capacity: 10,
    features: [],
    position: { x: 0, y: 0, width: 1, height: 1 },
    accessControl: { isPublic: true },
  };
}

function authState(userId: string | null) {
  return {
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
          user_metadata: { name: `User ${userId}` },
        }
      : null,
    isAuthReady: true,
  };
}

interface CompanyStateSnapshot {
  companyId: string | null;
  companyName: string | null;
  profileUid: string | null;
  userIds: string[];
  spaceIds: string[];
  isLoading: boolean;
  error: string | null;
  bootstrapErrorKind: 'unauthenticated' | 'rate-limited' | 'server' | null;
}

interface CompanyStateProbeProps {
  onRender?: (snapshot: CompanyStateSnapshot) => void;
  captureCreateNewCompany?: (createNewCompany: (name: string) => Promise<string>) => void;
  captureRefreshCompanyData?: (refreshCompanyData: () => Promise<void>) => void;
  captureUpdateCompanyDetails?: (updateCompanyDetails: (data: Partial<Company>) => Promise<void>) => void;
  captureUpdateUserProfile?: (updateUserProfile: (data: Partial<User>) => Promise<void>) => void;
}

function CompanyStateProbe({
  onRender,
  captureCreateNewCompany,
  captureRefreshCompanyData,
  captureUpdateCompanyDetails,
  captureUpdateUserProfile,
}: CompanyStateProbeProps = {}) {
  const {
    company,
    companyUsers,
    currentUserProfile,
    spaces,
    isLoading,
    error,
    bootstrapError,
    createNewCompany,
    refreshCompanyData,
    updateCompanyDetails,
    updateUserProfile,
  } = useCompany();
  const snapshot = {
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    profileUid: currentUserProfile?.supabase_uid ?? null,
    userIds: companyUsers.map((user) => user.supabase_uid),
    spaceIds: spaces.map((space) => space.id),
    isLoading,
    error,
    bootstrapErrorKind: bootstrapError?.kind ?? null,
  };

  onRender?.(snapshot);
  captureCreateNewCompany?.(createNewCompany);
  captureRefreshCompanyData?.(refreshCompanyData);
  captureUpdateCompanyDetails?.(updateCompanyDetails);
  captureUpdateUserProfile?.(updateUserProfile);

  return (
    <output data-testid="company-state">
      {JSON.stringify(snapshot)}
    </output>
  );
}

function providerTree(probeProps: CompanyStateProbeProps = {}) {
  return (
    <StrictMode>
      <CompanyProvider>
        <CompanyStateProbe {...probeProps} />
      </CompanyProvider>
    </StrictMode>
  );
}

function renderProvider(probeProps: CompanyStateProbeProps = {}) {
  return render(providerTree(probeProps));
}

function renderProviderWithPresence(probeProps: CompanyStateProbeProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StrictMode>
        <CompanyProvider>
          <PresenceProvider>
            <CompanyStateProbe {...probeProps} />
          </PresenceProvider>
        </CompanyProvider>
      </StrictMode>
    </QueryClientProvider>
  );
}

async function flushDeferredPassiveEffects(): Promise<void> {
  const pending = passiveEffectControl.pending.splice(0);
  passiveEffectControl.shouldDefer = false;
  await act(async () => {
    for (const effect of pending) {
      effect();
    }
    await Promise.resolve();
  });
}

function installMemoryLocalStorage(): void {
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
}

describe('CompanyContext bootstrap', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetProfileSyncCache();
    passiveEffectControl.shouldDefer = false;
    passiveEffectControl.pending.length = 0;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.usePresenceSession.mockReturnValue({
      sessionId: null,
      rotateSession: vi.fn(async () => null),
    });
    mocks.usePresenceSnapshot.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    mocks.usePresenceRealtime.mockReturnValue('disabled');
    mocks.useLocationTransition.mockReturnValue({
      transitionLocation: vi.fn(),
      beginManualIntent: vi.fn(),
      releaseManualIntent: vi.fn(),
      pendingTargetSpaceId: null,
    });
  });

  afterEach(() => {
    cleanup();
    __resetProfileSyncCache();
    vi.restoreAllMocks();
  });

  it('dedupes profile and company bootstrap requests in Strict Mode', async () => {
    const user = makeUser('user-a', 'company-a');
    const company = makeCompany('company-a');
    const spaces = [makeSpace('company-a')];

    let resolveProfileSync: (profile: User) => void = () => undefined;
    const delayedProfileSync = new Promise<User>((resolve) => {
      resolveProfileSync = resolve;
    });

    const currentAuthState = authState('user-a');
    mocks.useAuth.mockReturnValue(currentAuthState);
    mocks.syncUserProfile.mockReturnValue(delayedProfileSync);
    mocks.getCompany.mockResolvedValue(company);
    mocks.getUsersByCompany.mockResolvedValue([user]);
    mocks.getSpacesByCompany.mockResolvedValue(spaces);

    renderProvider();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.syncUserProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveProfileSync(user);
      await delayedProfileSync;
    });

    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
    });

    expect(mocks.syncUserProfile).toHaveBeenCalledTimes(1);
    expect(mocks.getCompany).toHaveBeenCalledTimes(1);
    expect(mocks.getUsersByCompany).toHaveBeenCalledTimes(1);
    expect(mocks.getSpacesByCompany).toHaveBeenCalledTimes(1);
  });

  it('re-bootstrap clears the old company after remote membership removal', async () => {
    const companyUser = makeUser('user-a', 'company-a');
    const removedUser = { ...companyUser, companyId: null, role: 'member' as const };
    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile
      .mockResolvedValueOnce(companyUser)
      .mockResolvedValueOnce(removedUser);
    mocks.getCompany.mockResolvedValue(makeCompany('company-a'));
    mocks.getUsersByCompany.mockResolvedValue([companyUser]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-a')]);

    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent(
        '"companyId":"company-a"',
      );
    });

    act(() => {
      invalidatePresenceClientLifecycle({
        reason: 'membership-scope-invalidated',
        userId: companyUser.id,
        companyId: 'company-a',
      });
    });

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"companyId":null');
      expect(state).toHaveTextContent('"userIds":[]');
      expect(state).toHaveTextContent('"spaceIds":[]');
      expect(mocks.syncUserProfile).toHaveBeenCalledTimes(2);
    });
  });

  it('does not retain the old membership profile when invalidation reload fails', async () => {
    const companyUser = makeUser('user-a', 'company-a');
    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile
      .mockResolvedValueOnce(companyUser)
      .mockRejectedValueOnce(new TypeError('membership reload offline'));
    mocks.getUserById.mockResolvedValue(null);
    mocks.getCompany.mockResolvedValue(makeCompany('company-a'));
    mocks.getUsersByCompany.mockResolvedValue([companyUser]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-a')]);

    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent(
        '"companyId":"company-a"',
      );
    });

    act(() => {
      invalidatePresenceClientLifecycle({
        reason: 'membership-scope-invalidated',
        userId: companyUser.id,
        companyId: 'company-a',
      });
    });

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(mocks.syncUserProfile).toHaveBeenCalledTimes(2);
      expect(state).toHaveTextContent('"profileUid":null');
      expect(state).toHaveTextContent('"companyId":null');
      expect(state).toHaveTextContent('"userIds":[]');
      expect(state).toHaveTextContent('"spaceIds":[]');
      expect(state).toHaveTextContent('"isLoading":false');
    });
  });

  it('membership generation fence rejects a delayed old-company bootstrap', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-a', 'company-b');
    const companyB = makeCompany('company-b');
    let resolveCompanyA: (company: Company) => void = () => undefined;
    const delayedCompanyA = new Promise<Company>((resolve) => {
      resolveCompanyA = resolve;
    });

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile
      .mockResolvedValueOnce(userA)
      .mockResolvedValueOnce(userB);
    mocks.getCompany
      .mockReturnValueOnce(delayedCompanyA)
      .mockResolvedValueOnce(companyB);
    mocks.getUsersByCompany.mockResolvedValue([userB]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-b')]);

    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent(
        '"profileUid":"user-a"',
      );
      expect(mocks.getCompany).toHaveBeenCalledWith('company-a');
    });

    act(() => {
      invalidatePresenceClientLifecycle({
        reason: 'membership-scope-invalidated',
        userId: userA.id,
        companyId: 'company-a',
      });
    });

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"space-company-b"');
    });

    await act(async () => {
      resolveCompanyA(makeCompany('company-a'));
      await delayedCompanyA;
    });

    const finalState = screen.getByTestId('company-state');
    expect(finalState).toHaveTextContent('"companyId":"company-b"');
    expect(finalState).not.toHaveTextContent('space-company-a');
  });

  it('drops delayed account A responses after logout and account B bootstrap', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    const spacesB = [makeSpace('company-b')];
    let resolveCompanyA: (company: Company | null) => void = () => undefined;
    const delayedCompanyA = new Promise<Company | null>((resolve) => {
      resolveCompanyA = resolve;
    });

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      companyId === 'company-a' ? delayedCompanyA : Promise.resolve(companyB)
    ));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-b' ? [userB] : [userA])
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-b' ? spacesB : [makeSpace('company-a')])
    ));

    const view = renderProvider();

    await waitFor(() => {
      expect(mocks.getCompany).toHaveBeenCalledWith('company-a');
    });

    currentAuthState = authState(null);
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );

    currentAuthState = authState('user-b');
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-b"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"companyId":"company-b"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-b"');
    });

    await act(async () => {
      resolveCompanyA(companyA);
      await delayedCompanyA;
    });

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).not.toHaveTextContent('company-a');
      expect(state).not.toHaveTextContent('user-a');
    });

    expect(mocks.getUsersByCompany).toHaveBeenCalledWith('company-b');
    expect(mocks.getSpacesByCompany).toHaveBeenCalledWith('company-b');
  });

  it('drops an account A load resolved during account B render before B passive effects', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    let resolveCompanyA: (company: Company | null) => void = () => undefined;
    const delayedCompanyA = new Promise<Company | null>((resolve) => {
      resolveCompanyA = resolve;
    });
    const renderSnapshots: CompanyStateSnapshot[] = [];
    const probeProps: CompanyStateProbeProps = {
      onRender: (snapshot) => renderSnapshots.push(snapshot),
    };

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      companyId === 'company-a' ? delayedCompanyA : Promise.resolve(companyB)
    ));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? [userA] : [userB])
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => (
      Promise.resolve([makeSpace(companyId)])
    ));

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(mocks.getCompany).toHaveBeenCalledWith('company-a');
    });

    renderSnapshots.length = 0;
    currentAuthState = authState('user-b');
    passiveEffectControl.shouldDefer = true;
    view.rerender(providerTree(probeProps));
    expect(renderSnapshots[0]?.profileUid).toBeNull();

    await act(async () => {
      resolveCompanyA(companyA);
      await delayedCompanyA;
      await Promise.resolve();
    });

    expect(mocks.getUsersByCompany).not.toHaveBeenCalledWith('company-a');
    await flushDeferredPassiveEffects();
    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
    });
  });

  it('rejects an account A mutation resolved during account B render before B passive effects', async () => {
    const userA = { ...makeUser('user-a', 'company-a'), companyId: null };
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    let resolveCreationProfile: (profile: User) => void = () => undefined;
    const delayedCreationProfile = new Promise<User>((resolve) => {
      resolveCreationProfile = resolve;
    });
    let createNewCompany: ((name: string) => Promise<string>) | null = null;
    const renderSnapshots: CompanyStateSnapshot[] = [];
    const probeProps: CompanyStateProbeProps = {
      onRender: (snapshot) => renderSnapshots.push(snapshot),
      captureCreateNewCompany: (create) => {
        createNewCompany = create;
      },
    };

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockResolvedValueOnce(userA).mockResolvedValue(userB);
    mocks.getCompany.mockResolvedValue(companyB);
    mocks.getUsersByCompany.mockResolvedValue([userB]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-b')]);

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
    });
    if (!createNewCompany) {
      throw new Error('createNewCompany was not captured from the provider');
    }
    mocks.syncUserProfile.mockReturnValueOnce(delayedCreationProfile);

    let creationPromise: Promise<string> | undefined;
    act(() => {
      creationPromise = createNewCompany?.('Account A Company');
    });
    if (!creationPromise) {
      throw new Error('createNewCompany did not return a promise');
    }
    const staleRejection = expect(creationPromise).rejects.toThrow(
      'Authentication changed during company creation'
    );
    await waitFor(() => {
      expect(mocks.syncUserProfile).toHaveBeenCalledTimes(2);
    });

    renderSnapshots.length = 0;
    currentAuthState = authState('user-b');
    passiveEffectControl.shouldDefer = true;
    view.rerender(providerTree(probeProps));
    expect(renderSnapshots[0]?.profileUid).toBeNull();

    await act(async () => {
      resolveCreationProfile(userA);
      await delayedCreationProfile;
      await Promise.resolve();
    });
    await staleRejection;
    expect(mocks.createCompany).not.toHaveBeenCalled();
    await flushDeferredPassiveEffects();
  });

  it('re-login of the same account while a stale load is in flight starts a fresh load (no deadlock)', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];

    let resolveFirstCompanyLoad: (company: Company | null) => void = () => undefined;
    const delayedFirstCompanyLoad = new Promise<Company | null>((resolve) => {
      resolveFirstCompanyLoad = resolve;
    });

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockResolvedValue(userA);
    // First bootstrap of A hangs on getCompany; the post-re-login one resolves.
    mocks.getCompany
      .mockImplementationOnce(() => delayedFirstCompanyLoad)
      .mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    const view = renderProvider();

    await waitFor(() => {
      expect(mocks.getCompany).toHaveBeenCalledTimes(1);
    });

    // Logout while A's first load is still stuck in flight…
    currentAuthState = authState(null);
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );

    // …then immediately log A back in.
    currentAuthState = authState('user-a');
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );

    // The stale in-flight load must NOT be reused: a fresh load completes the
    // bootstrap and loading settles (before the fix this deadlocked with
    // isLoading stuck true and no data committed).
    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-a"');
      expect(state).toHaveTextContent('"companyId":"company-a"');
      expect(state).toHaveTextContent('"isLoading":false');
    });
    expect(mocks.getCompany).toHaveBeenCalledTimes(2);

    // The stale load resolving later must not disturb the committed state.
    await act(async () => {
      resolveFirstCompanyLoad(companyA);
      await delayedFirstCompanyLoad;
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"profileUid":"user-a"');
    expect(state).toHaveTextContent('"companyId":"company-a"');
    expect(state).toHaveTextContent('"isLoading":false');
  });

  it('re-login of the same account does not await a stalled profile sync from the previous session', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];

    // First sync-profile request for A NEVER resolves (stalled network).
    const stalledSync = new Promise<User>(() => undefined);
    mocks.syncUserProfile
      .mockImplementationOnce(() => stalledSync)
      .mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);

    const view = renderProvider();

    await waitFor(() => {
      expect(mocks.syncUserProfile).toHaveBeenCalledTimes(1);
    });

    // Logout while the sync request is still stalled, then log A back in.
    currentAuthState = authState(null);
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );
    currentAuthState = authState('user-a');
    view.rerender(
      <StrictMode>
        <CompanyProvider>
          <CompanyStateProbe />
        </CompanyProvider>
      </StrictMode>
    );

    // A SECOND sync must start (the stalled one must not be reused) and the
    // bootstrap must complete.
    await waitFor(() => {
      expect(mocks.syncUserProfile).toHaveBeenCalledTimes(2);
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-a"');
      expect(state).toHaveTextContent('"companyId":"company-a"');
      expect(state).toHaveTextContent('"isLoading":false');
    });
  });
  it('masks account A data synchronously on a direct switch to account B', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    const spacesB = [makeSpace('company-b')];
    const renderSnapshots: CompanyStateSnapshot[] = [];
    const probeProps: CompanyStateProbeProps = {
      onRender: (snapshot) => renderSnapshots.push(snapshot),
    };

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? companyA : companyB)
    ));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? [userA] : [userB])
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? spacesA : spacesB)
    ));

    const view = renderProvider(probeProps);

    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"companyId":"company-a"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-a"');
    });

    renderSnapshots.length = 0;
    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));

    // This is the first render under B, before any awaited bootstrap work. It
    // must already be masked even though A owned the previously committed data.
    expect(renderSnapshots[0]).toEqual({
      companyId: null,
      companyName: null,
      profileUid: null,
      userIds: [],
      spaceIds: [],
      isLoading: true,
      error: null,
      bootstrapErrorKind: null,
    });
    const synchronousState = screen.getByTestId('company-state');
    expect(synchronousState).toHaveTextContent('"profileUid":null');
    expect(synchronousState).toHaveTextContent('"companyId":null');
    expect(synchronousState).toHaveTextContent('"userIds":[]');
    expect(synchronousState).toHaveTextContent('"spaceIds":[]');
    expect(synchronousState).toHaveTextContent('"isLoading":true');
    expect(synchronousState).toHaveTextContent('"error":null');
    expect(synchronousState).not.toHaveTextContent('user-a');
    expect(synchronousState).not.toHaveTextContent('company-a');

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"userIds":["user-b"]');
      expect(state).toHaveTextContent('"space-company-b"');
      expect(state).toHaveTextContent('"isLoading":false');
    });
  });

  it('masks account A bootstrap error on account B first render', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    const renderSnapshots: CompanyStateSnapshot[] = [];
    const probeProps: CompanyStateProbeProps = {
      onRender: (snapshot) => renderSnapshots.push(snapshot),
    };

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      companyId === 'company-a'
        ? Promise.reject(new Error('Account A bootstrap failed'))
        : Promise.resolve(companyB)
    ));
    mocks.getUsersByCompany.mockResolvedValue([userB]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-b')]);

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent(
        '"error":"Account A bootstrap failed"'
      );
    });

    renderSnapshots.length = 0;
    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));

    expect(renderSnapshots[0]?.error).toBeNull();
    expect(screen.getByTestId('company-state')).toHaveTextContent('"error":null');

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
    });
  });

  it('masks account A sync error before ownership exists on account B first render', async () => {
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    const renderSnapshots: CompanyStateSnapshot[] = [];
    const probeProps: CompanyStateProbeProps = {
      onRender: (snapshot) => renderSnapshots.push(snapshot),
    };

    let currentAuthState = authState('user-a');
    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      supabase_uid === 'user-a'
        ? Promise.reject(new Error('Account A profile sync failed'))
        : Promise.resolve(userB)
    ));
    mocks.getUserById.mockResolvedValue(null);
    mocks.getCompany.mockResolvedValue(companyB);
    mocks.getUsersByCompany.mockResolvedValue([userB]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-b')]);

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent(
        'Failed to sync or retrieve user profile for Supabase UID user-a'
      );
    });

    renderSnapshots.length = 0;
    currentAuthState = authState('user-b');
    passiveEffectControl.shouldDefer = true;
    view.rerender(providerTree(probeProps));

    expect(renderSnapshots[0]).toMatchObject({
      companyId: null,
      profileUid: null,
      userIds: [],
      spaceIds: [],
      isLoading: true,
      error: null,
      bootstrapErrorKind: null,
    });

    await flushDeferredPassiveEffects();
    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"error":null');
      expect(state).toHaveTextContent('"isLoading":false');
    });
  });

  it('does not restart bootstrap when the auth user object changes with the same UID', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let currentAuthState = authState('user-a');

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    const view = renderProvider();

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-a"');
      expect(state).toHaveTextContent('"companyId":"company-a"');
      expect(state).toHaveTextContent('"isLoading":false');
    });

    currentAuthState = {
      ...currentAuthState,
      user: currentAuthState.user ? { ...currentAuthState.user } : null,
    };
    view.rerender(providerTree());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.syncUserProfile).toHaveBeenCalledTimes(1);
    expect(mocks.getCompany).toHaveBeenCalledTimes(1);
    expect(mocks.getUsersByCompany).toHaveBeenCalledTimes(1);
    expect(mocks.getSpacesByCompany).toHaveBeenCalledTimes(1);
  });

  it('retains confirmed company state when a refresh is rate limited', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany
      .mockResolvedValueOnce(spacesA)
      .mockRejectedValueOnce(new ApiError('Request rate limit reached', {
        status: 429,
        code: 'RATE_LIMITED',
        correlationId: 'corr-rate-limit',
      }));

    renderProviderWithPresence({
      captureRefreshCompanyData: (refresh) => {
        refreshCompanyData = refresh;
      },
    });

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"companyId":"company-a"');
      expect(state).toHaveTextContent('"space-company-a"');
      expect(state).toHaveTextContent('"isLoading":false');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"rate-limited"');
    expect(state).toHaveTextContent('"profileUid":"user-a"');
    expect(state).toHaveTextContent('"companyId":"company-a"');
    expect(state).toHaveTextContent('"userIds":["user-a"]');
    expect(state).toHaveTextContent('"spaceIds":["space-company-a"]');
    expect(mocks.usePresenceSession).toHaveBeenLastCalledWith(userA.id, 'company-a');
  });

  it('does not rotate a current lease from a potentially stale disconnected snapshot', async () => {
    const userA = makeUser('user-a', 'company-a');
    const rotateSession = vi.fn(async () => 'session-2');
    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(makeCompany('company-a'));
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-a')]);
    mocks.usePresenceSession.mockReturnValue({
      sessionId: 'session-1',
      rotateSession,
    });
    mocks.useLocationTransition.mockReturnValue({
      transitionLocation: vi.fn(),
      beginManualIntent: vi.fn(),
      releaseManualIntent: vi.fn(),
      pendingTargetSpaceId: null,
      confirmedSessionId: 'session-1',
      isSessionRecoveryInProgress: false,
      isTransitionPending: false,
    });
    mocks.usePresenceSnapshot.mockReturnValue({
      data: {
        serverTime: '2026-07-18T18:00:00.000Z',
        companyId: 'company-a',
        viewerUserId: userA.id,
        currentUser: { initialPlacementCompletedAt: timestamp },
        users: [{
          id: userA.id,
          displayName: userA.displayName,
          avatarUrl: null,
          currentSpaceId: null,
          locationVersion: 2,
          availabilityStatus: 'online',
          isConnected: false,
          isOccupyingCurrentSpace: false,
          displayStatus: 'offline',
          statusMessage: null,
        }],
      },
      isLoading: false,
      error: null,
    });

    renderProviderWithPresence();

    await waitFor(() => expect(mocks.usePresenceSnapshot).toHaveBeenCalled());
    expect(rotateSession).not.toHaveBeenCalled();
  });

  it('retains presence identity when a refresh fails with a server error', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany
      .mockResolvedValueOnce(spacesA)
      .mockRejectedValueOnce(new ApiError('Service unavailable', {
        status: 503,
        code: 'INTERNAL_ERROR',
        correlationId: 'corr-server-error',
      }));

    renderProviderWithPresence({
      captureRefreshCompanyData: (refresh) => {
        refreshCompanyData = refresh;
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-a"');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"server"');
    expect(state).toHaveTextContent('"spaceIds":["space-company-a"]');
    expect(mocks.usePresenceSession).toHaveBeenLastCalledWith(userA.id, 'company-a');
  });

  it('retains presence identity when profile sync and fallback fail at network level', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile
      .mockResolvedValueOnce(userA)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mocks.getUserById.mockResolvedValue(null);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    renderProviderWithPresence({
      captureRefreshCompanyData: (refresh) => {
        refreshCompanyData = refresh;
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-a"');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"server"');
    expect(state).toHaveTextContent('"error":"Failed to fetch"');
    expect(state).toHaveTextContent('"profileUid":"user-a"');
    expect(state).toHaveTextContent('"spaceIds":["space-company-a"]');
    expect(mocks.usePresenceSession).toHaveBeenLastCalledWith(userA.id, 'company-a');
  });

  it('tears down identity on 401 and passes null to the presence session', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany
      .mockResolvedValueOnce(companyA)
      .mockRejectedValueOnce(new ApiError('Session expired', {
        status: 401,
        code: 'UNAUTHORIZED',
        correlationId: 'corr-unauthorized',
      }));
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <StrictMode>
          <CompanyProvider>
            <PresenceProvider>
              <CompanyStateProbe
                captureRefreshCompanyData={(refresh) => {
                  refreshCompanyData = refresh;
                }}
              />
            </PresenceProvider>
          </CompanyProvider>
        </StrictMode>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
      expect(mocks.usePresenceSession).toHaveBeenCalledWith(userA.id, 'company-a');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"unauthenticated"');
    expect(state).toHaveTextContent('"profileUid":null');
    expect(state).toHaveTextContent('"companyId":null');
    expect(state).toHaveTextContent('"userIds":[]');
    expect(state).toHaveTextContent('"spaceIds":[]');
    expect(mocks.usePresenceSession).toHaveBeenLastCalledWith(null, null);
  });

  it('does not retain confirmed state for a non-transient 403', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany
      .mockResolvedValueOnce(companyA)
      .mockRejectedValueOnce(new ApiError('Access denied', {
        status: 403,
        code: 'FORBIDDEN',
        correlationId: 'corr-forbidden',
      }));
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    renderProvider({
      captureRefreshCompanyData: (refresh) => {
        refreshCompanyData = refresh;
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-a"');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"server"');
    expect(state).toHaveTextContent('"profileUid":null');
    expect(state).toHaveTextContent('"companyId":null');
    expect(state).toHaveTextContent('"userIds":[]');
    expect(state).toHaveTextContent('"spaceIds":[]');
  });

  it('preserves the original ApiError when profile-sync fallback finds no user', async () => {
    const userA = makeUser('user-a', 'company-a');
    const companyA = makeCompany('company-a');
    const spacesA = [makeSpace('company-a')];
    let refreshCompanyData: (() => Promise<void>) | null = null;

    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile
      .mockResolvedValueOnce(userA)
      .mockRejectedValueOnce(new ApiError('Session expired during profile sync', {
        status: 401,
        code: 'UNAUTHORIZED',
        correlationId: 'corr-sync-auth',
      }));
    mocks.getUserById.mockResolvedValue(null);
    mocks.getCompany.mockResolvedValue(companyA);
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesA);

    renderProvider({
      captureRefreshCompanyData: (refresh) => {
        refreshCompanyData = refresh;
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"space-company-a"');
    });
    if (!refreshCompanyData) {
      throw new Error('refreshCompanyData was not captured from the provider');
    }

    await act(async () => {
      await refreshCompanyData?.();
    });

    const state = screen.getByTestId('company-state');
    expect(state).toHaveTextContent('"bootstrapErrorKind":"unauthenticated"');
    expect(state).toHaveTextContent('"error":"Session expired during profile sync"');
    expect(state).toHaveTextContent('"profileUid":null');
  });

  it('masks authenticated company data while ownership is still unknown on first render', async () => {
    const userA = makeUser('user-a', 'company-a');
    const renderSnapshots: CompanyStateSnapshot[] = [];
    mocks.useAuth.mockReturnValue(authState('user-a'));
    mocks.syncUserProfile.mockResolvedValue(userA);
    mocks.getCompany.mockResolvedValue(makeCompany('company-a'));
    mocks.getUsersByCompany.mockResolvedValue([userA]);
    mocks.getSpacesByCompany.mockResolvedValue([makeSpace('company-a')]);
    passiveEffectControl.shouldDefer = true;

    renderProvider({ onRender: (snapshot) => renderSnapshots.push(snapshot) });

    expect(renderSnapshots[0]).toMatchObject({
      companyId: null,
      companyName: null,
      profileUid: null,
      userIds: [],
      spaceIds: [],
      isLoading: true,
      error: null,
      bootstrapErrorKind: null,
    });

    await flushDeferredPassiveEffects();
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
    });
  });

  it('does not start a stale mutation during the account-switch pre-effect window', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-b', 'company-b');
    let currentAuthState = authState('user-a');
    const capturedMutation: {
      updateUserProfile?: (data: Partial<User>) => Promise<void>;
    } = {};
    const probeProps: CompanyStateProbeProps = {
      captureUpdateUserProfile: (update) => {
        capturedMutation.updateUserProfile = update;
      },
    };

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => Promise.resolve(makeCompany(companyId)));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => Promise.resolve(
      companyId === 'company-a' ? [userA] : [userB],
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => Promise.resolve([makeSpace(companyId)]));

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
    });
    const updateUserProfile = capturedMutation.updateUserProfile;
    if (!updateUserProfile) throw new Error('updateUserProfile was not captured');

    passiveEffectControl.shouldDefer = true;
    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));

    await expect(updateUserProfile({ statusMessage: 'must not reach account A' })).rejects.toThrow(
      'Authentication changed during profile update',
    );
    expect(mocks.updateOwnProfile).not.toHaveBeenCalled();

    await flushDeferredPassiveEffects();
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-b"');
    });
  });

  it('does not commit a delayed account A profile update after account B bootstraps', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-b', 'company-b');
    const companyA = makeCompany('company-a');
    const companyB = makeCompany('company-b');
    let resolveProfileUpdate: () => void = () => undefined;
    const delayedProfileUpdate = new Promise<void>((resolve) => {
      resolveProfileUpdate = resolve;
    });
    let currentAuthState = authState('user-a');
    let updateUserProfile: ((data: Partial<User>) => Promise<void>) | null = null;
    const probeProps: CompanyStateProbeProps = {
      captureUpdateUserProfile: (update) => {
        updateUserProfile = update;
      },
    };

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? companyA : companyB)
    ));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? [userA] : [userB])
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => (
      Promise.resolve([makeSpace(companyId)])
    ));
    mocks.updateOwnProfile.mockReturnValue(delayedProfileUpdate);

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"isLoading":false');
    });
    if (!updateUserProfile) throw new Error('updateUserProfile was not captured');

    let profileUpdatePromise: Promise<void> | undefined;
    act(() => {
      profileUpdatePromise = updateUserProfile?.({ displayName: 'Stale Account A Name' });
    });
    if (!profileUpdatePromise) throw new Error('updateUserProfile returned no promise');
    const staleRejection = expect(profileUpdatePromise).rejects.toThrow(
      'Authentication changed during profile update',
    );
    await waitFor(() => expect(mocks.updateOwnProfile).toHaveBeenCalledWith(
      userA.id,
      expect.objectContaining({ displayName: 'Stale Account A Name' }),
    ));

    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));
    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"isLoading":false');
    });

    await act(async () => {
      resolveProfileUpdate();
      await delayedProfileUpdate;
    });
    await staleRejection;

    const finalState = screen.getByTestId('company-state');
    expect(finalState).toHaveTextContent('"profileUid":"user-b"');
    expect(finalState).toHaveTextContent('"companyId":"company-b"');
    expect(finalState).toHaveTextContent('"error":null');
    expect(finalState).toHaveTextContent('"isLoading":false');
    expect(finalState).not.toHaveTextContent('Stale Account A Name');
  });

  it('does not commit a delayed account A admin company update after account B bootstraps', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-b', 'company-b');
    const companyA = { ...makeCompany('company-a'), adminIds: [userA.id] };
    const companyB = { ...makeCompany('company-b'), adminIds: [userB.id] };
    let resolveCompanyUpdate: () => void = () => undefined;
    const delayedCompanyUpdate = new Promise<void>((resolve) => {
      resolveCompanyUpdate = resolve;
    });
    let currentAuthState = authState('user-a');
    let updateCompanyDetails: ((data: Partial<Company>) => Promise<void>) | null = null;
    const probeProps: CompanyStateProbeProps = {
      captureUpdateCompanyDetails: (update) => {
        updateCompanyDetails = update;
      },
    };

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? companyA : companyB)
    ));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => (
      Promise.resolve(companyId === 'company-a' ? [userA] : [userB])
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => (
      Promise.resolve([makeSpace(companyId)])
    ));
    mocks.updateCompany.mockReturnValue(delayedCompanyUpdate);

    const view = renderProvider(probeProps);
    await waitFor(() => {
      expect(screen.getByTestId('company-state')).toHaveTextContent('"companyId":"company-a"');
      expect(screen.getByTestId('company-state')).toHaveTextContent('"isLoading":false');
    });
    if (!updateCompanyDetails) throw new Error('updateCompanyDetails was not captured');

    let companyUpdatePromise: Promise<void> | undefined;
    act(() => {
      companyUpdatePromise = updateCompanyDetails?.({ name: 'Stale Account A Company' });
    });
    if (!companyUpdatePromise) throw new Error('updateCompanyDetails returned no promise');
    const staleRejection = expect(companyUpdatePromise).rejects.toThrow(
      'Authentication changed during company update',
    );
    await waitFor(() => expect(mocks.updateCompany).toHaveBeenCalledWith(
      'company-a',
      expect.objectContaining({ name: 'Stale Account A Company' }),
    ));

    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));
    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"companyName":"Company company-b"');
      expect(state).toHaveTextContent('"isLoading":false');
    });

    await act(async () => {
      resolveCompanyUpdate();
      await delayedCompanyUpdate;
    });
    await staleRejection;

    const finalState = screen.getByTestId('company-state');
    expect(finalState).toHaveTextContent('"companyName":"Company company-b"');
    expect(finalState).toHaveTextContent('"error":null');
    expect(finalState).toHaveTextContent('"isLoading":false');
    expect(finalState).not.toHaveTextContent('Stale Account A Company');
  });

  it('does not publish a stale account A mutation rejection into account B', async () => {
    const userA = makeUser('user-a', 'company-a');
    const userB = makeUser('user-b', 'company-b');
    let rejectProfileUpdate: (error: Error) => void = () => undefined;
    const delayedProfileUpdate = new Promise<void>((_resolve, reject) => {
      rejectProfileUpdate = reject;
    });
    let currentAuthState = authState('user-a');
    let updateUserProfile: ((data: Partial<User>) => Promise<void>) | null = null;
    const probeProps: CompanyStateProbeProps = {
      captureUpdateUserProfile: (update) => {
        updateUserProfile = update;
      },
    };

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile.mockImplementation(({ supabase_uid }: { supabase_uid: string }) => (
      Promise.resolve(supabase_uid === 'user-a' ? userA : userB)
    ));
    mocks.getCompany.mockImplementation((companyId: string) => Promise.resolve(makeCompany(companyId)));
    mocks.getUsersByCompany.mockImplementation((companyId: string) => Promise.resolve(
      companyId === 'company-a' ? [userA] : [userB],
    ));
    mocks.getSpacesByCompany.mockImplementation((companyId: string) => Promise.resolve([makeSpace(companyId)]));
    mocks.updateOwnProfile.mockReturnValue(delayedProfileUpdate);

    const view = renderProvider(probeProps);
    await waitFor(() => expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-a"'));
    if (!updateUserProfile) throw new Error('updateUserProfile was not captured');

    let profileUpdatePromise: Promise<void> | undefined;
    act(() => {
      profileUpdatePromise = updateUserProfile?.({ statusMessage: 'Account A only' });
    });
    if (!profileUpdatePromise) throw new Error('updateUserProfile returned no promise');
    const staleRejection = expect(profileUpdatePromise).rejects.toThrow(
      'Authentication changed during profile update',
    );
    await waitFor(() => expect(mocks.updateOwnProfile).toHaveBeenCalled());

    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));
    await waitFor(() => expect(screen.getByTestId('company-state')).toHaveTextContent('"profileUid":"user-b"'));

    await act(async () => {
      rejectProfileUpdate(new Error('Account A mutation failed'));
      await delayedProfileUpdate.catch(() => undefined);
    });
    await staleRejection;

    const finalState = screen.getByTestId('company-state');
    expect(finalState).toHaveTextContent('"profileUid":"user-b"');
    expect(finalState).toHaveTextContent('"error":null');
    expect(finalState).toHaveTextContent('"isLoading":false');
    expect(finalState).not.toHaveTextContent('Account A mutation failed');
  });

  it('rejects createNewCompany and commits no stale data when auth changes mid-creation', async () => {
    const userA = { ...makeUser('user-a', 'company-a'), companyId: null };
    const userB = makeUser('user-b', 'company-b');
    const companyB = makeCompany('company-b');
    const spacesB = [makeSpace('company-b')];
    const createdCompanyA = makeCompany('created-company-a');

    let resolveCreationProfile: (profile: User) => void = () => undefined;
    const delayedCreationProfile = new Promise<User>((resolve) => {
      resolveCreationProfile = resolve;
    });
    let resolveCreatedCompany: (company: Company) => void = () => undefined;
    const delayedCreatedCompany = new Promise<Company>((resolve) => {
      resolveCreatedCompany = resolve;
    });

    let currentAuthState = authState('user-a');
    let createNewCompany: ((name: string) => Promise<string>) | null = null;
    const probeProps: CompanyStateProbeProps = {
      captureCreateNewCompany: (create) => {
        createNewCompany = create;
      },
    };

    mocks.useAuth.mockImplementation(() => currentAuthState);
    mocks.syncUserProfile
      .mockResolvedValueOnce(userA)
      .mockReturnValueOnce(delayedCreationProfile)
      .mockResolvedValue(userB);
    mocks.createCompany.mockReturnValue(delayedCreatedCompany);
    mocks.getCompany.mockResolvedValue(companyB);
    mocks.getUsersByCompany.mockResolvedValue([userB]);
    mocks.getSpacesByCompany.mockResolvedValue(spacesB);

    const view = renderProvider(probeProps);

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-a"');
      expect(state).toHaveTextContent('"companyId":null');
      expect(state).toHaveTextContent('"isLoading":false');
    });

    if (!createNewCompany) {
      throw new Error('createNewCompany was not captured from the provider');
    }

    let creationPromise: Promise<string> | undefined;
    act(() => {
      creationPromise = createNewCompany?.('Account A Company');
    });
    if (!creationPromise) {
      throw new Error('createNewCompany did not return a promise');
    }
    const staleRejection = expect(creationPromise).rejects.toThrow(
      'Authentication changed during company creation'
    );

    await act(async () => {
      resolveCreationProfile(userA);
      await delayedCreationProfile;
    });
    await waitFor(() => {
      expect(mocks.createCompany).toHaveBeenCalledWith('Account A Company', {});
    });

    currentAuthState = authState('user-b');
    view.rerender(providerTree(probeProps));

    const synchronousState = screen.getByTestId('company-state');
    expect(synchronousState).not.toHaveTextContent('user-a');
    expect(synchronousState).not.toHaveTextContent('created-company-a');

    await waitFor(() => {
      const state = screen.getByTestId('company-state');
      expect(state).toHaveTextContent('"profileUid":"user-b"');
      expect(state).toHaveTextContent('"companyId":"company-b"');
      expect(state).toHaveTextContent('"space-company-b"');
    });

    await act(async () => {
      resolveCreatedCompany(createdCompanyA);
      await delayedCreatedCompany;
    });
    await staleRejection;

    const finalState = screen.getByTestId('company-state');
    expect(finalState).toHaveTextContent('"profileUid":"user-b"');
    expect(finalState).toHaveTextContent('"companyId":"company-b"');
    expect(finalState).not.toHaveTextContent('user-a');
    expect(finalState).not.toHaveTextContent('created-company-a');
  });
});
