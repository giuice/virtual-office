import React, { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, Space, User } from '@/types/database';

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

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  syncUserProfile: vi.fn(),
  getUserById: vi.fn(),
  updateUserStatus: vi.fn(),
  updateUserRole: vi.fn(),
  removeUserFromCompany: vi.fn(),
  createCompany: vi.fn(),
  getCompany: vi.fn(),
  updateCompany: vi.fn(),
  getUsersByCompany: vi.fn(),
  getSpacesByCompany: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/lib/api', () => ({
  syncUserProfile: mocks.syncUserProfile,
  getUserById: mocks.getUserById,
  updateUserStatus: mocks.updateUserStatus,
  updateUserRole: mocks.updateUserRole,
  removeUserFromCompany: mocks.removeUserFromCompany,
  createCompany: mocks.createCompany,
  getCompany: mocks.getCompany,
  updateCompany: mocks.updateCompany,
  getUsersByCompany: mocks.getUsersByCompany,
  getSpacesByCompany: mocks.getSpacesByCompany,
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
  profileUid: string | null;
  userIds: string[];
  spaceIds: string[];
  isLoading: boolean;
  error: string | null;
}

interface CompanyStateProbeProps {
  onRender?: (snapshot: CompanyStateSnapshot) => void;
  captureCreateNewCompany?: (createNewCompany: (name: string) => Promise<string>) => void;
}

function CompanyStateProbe({ onRender, captureCreateNewCompany }: CompanyStateProbeProps = {}) {
  const {
    company,
    companyUsers,
    currentUserProfile,
    spaces,
    isLoading,
    error,
    createNewCompany,
  } = useCompany();
  const snapshot = {
    companyId: company?.id ?? null,
    profileUid: currentUserProfile?.supabase_uid ?? null,
    userIds: companyUsers.map((user) => user.supabase_uid),
    spaceIds: spaces.map((space) => space.id),
    isLoading,
    error,
  };

  onRender?.(snapshot);
  captureCreateNewCompany?.(createNewCompany);

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

describe('CompanyContext bootstrap', () => {
  beforeEach(() => {
    __resetProfileSyncCache();
    passiveEffectControl.shouldDefer = false;
    passiveEffectControl.pending.length = 0;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
      profileUid: null,
      userIds: [],
      spaceIds: [],
      isLoading: true,
      error: null,
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
      expect(mocks.createCompany).toHaveBeenCalledWith('Account A Company', 'user-a', {});
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
