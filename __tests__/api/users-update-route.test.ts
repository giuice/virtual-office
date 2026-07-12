import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { PATCH } from '@/app/api/users/update/route';

// Phase 3 write gate: unit tests exercise route logic, not the DB ledger.
// beginLegacyPresenceWrite is stubbed as an always-open legacy-mode gate.
vi.mock('@/lib/presence/legacy-write-gate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/presence/legacy-write-gate')>();
  return {
    ...actual,
    beginLegacyPresenceWrite: vi.fn(async () => ({
      requestId: '77777777-7777-4777-8777-777777777777',
      deadline: new Date(Date.now() + 60_000),
      assertCanStartDatabaseOperation: () => {},
      close: vi.fn(async () => {}),
    })),
  };
});

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';
const TARGET_USER_ID = 'target-user-1';
const COMPANY_ID = 'company-1';
const OTHER_COMPANY_ID = 'company-2';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findById: (id: string) => mocks.findById(id),
      update: (id: string, updates: Partial<User>) => mocks.update(id, updates),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: COMPANY_ID,
    supabase_uid: AUTH_USER_ID,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

function requestFor(userId: string, body: object): Request {
  return {
    url: `https://example.com/api/users/update?id=${userId}`,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

describe('/api/users/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser(),
    });
    mocks.update.mockImplementation(async (id: string, updates: Partial<User>) => makeUser({ id, ...updates }));
  });

  it('returns 401 when the auth helper rejects the request', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authentication required' }, { status: 401 }),
    });

    const response = await PATCH(requestFor(APP_USER_ID, { displayName: 'Ada' }));

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('strips forbidden self-update fields while preserving sign-out status updates', async () => {
    const response = await PATCH(requestFor(APP_USER_ID, {
      status: 'offline',
      currentSpaceId: null,
      role: 'admin',
      companyId: OTHER_COMPANY_ID,
      avatarUrl: 'https://example.com/avatar.png',
    }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(APP_USER_ID, {
      status: 'offline',
    });
  });

  it('strips self-updates that try to move through users/update instead of users/location', async () => {
    const response = await PATCH(requestFor(APP_USER_ID, {
      currentSpaceId: 'space-1',
    }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(APP_USER_ID, {});
  });

  it('blocks cross-user updates from non-admin users', async () => {
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID }));

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'admin' }));

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows an admin to update another same-company user role', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ role: 'admin' }),
    });
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID, role: 'member' }));

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'admin', displayName: 'Ignored' }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(TARGET_USER_ID, { role: 'admin' });
  });

  it('blocks admin role changes across companies', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ role: 'admin' }),
    });
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID, companyId: OTHER_COMPANY_ID }));

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'admin' }));

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
