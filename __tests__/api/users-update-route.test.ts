import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { PATCH } from '@/app/api/users/update/route';

// Only the retired persisted-offline path remains behind the Phase 3 gate.
vi.mock('@/lib/presence/legacy-write-gate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/presence/legacy-write-gate')>();
  return {
    ...actual,
    beginLegacyPresenceWrite: (...args: unknown[]) =>
      mocks.beginLegacyPresenceWrite(...args),
  };
});

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_COMPANY_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  supabase: {},
  recordLegacyRoute: vi.fn(),
  beginLegacyPresenceWrite: vi.fn(),
  closeLegacyWriteGate: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/presence/legacy-route-audit', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/presence/legacy-route-audit')>();
  return {
    ...actual,
    recordLegacyPresenceRouteCall: (...args: unknown[]) => mocks.recordLegacyRoute(...args),
  };
});

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    role: 'service_role',
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  })),
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
    mocks.recordLegacyRoute.mockResolvedValue(undefined);
    mocks.beginLegacyPresenceWrite.mockResolvedValue({
      requestId: '77777777-7777-4777-8777-777777777777',
      deadline: new Date(Date.now() + 60_000),
      assertCanStartDatabaseOperation: () => {},
      close: (...args: unknown[]) => mocks.closeLegacyWriteGate(...args),
    });
    mocks.closeLegacyWriteGate.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_MEMBER_ROLE_UPDATED',
        actorUserId: APP_USER_ID,
        targetUserId: TARGET_USER_ID,
        companyId: COMPANY_ID,
        role: 'admin',
        previousSpaceId: null,
        locationVersion: 0,
        presenceAccessRevision: 2,
        retiredSessionCount: 0,
        closedLogCount: 0,
        invalidatedInvitationCount: 0,
        operationTime: '2026-07-18T21:00:00.000Z',
      },
      error: null,
    });
  });

  it('returns 401 when the auth helper rejects the request', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authentication required' }, { status: 401 }),
    });

    const response = await PATCH(requestFor(APP_USER_ID, { displayName: 'Ada' }));

    expect(response.status).toBe(401);
    expect(mocks.beginLegacyPresenceWrite).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps ordinary profile writes available after the atomic cutover', async () => {
    const response = await PATCH(requestFor(APP_USER_ID, { displayName: 'Ada' }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(APP_USER_ID, { displayName: 'Ada' });
    expect(mocks.recordLegacyRoute).not.toHaveBeenCalled();
    expect(mocks.beginLegacyPresenceWrite).not.toHaveBeenCalled();
  });

  it('rejects persisted offline and forbidden self-update fields', async () => {
    const response = await PATCH(requestFor(APP_USER_ID, {
      status: 'offline',
      currentSpaceId: null,
      role: 'admin',
      companyId: OTHER_COMPANY_ID,
      avatarUrl: 'https://example.com/avatar.png',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'PERSISTED_OFFLINE_NOT_ALLOWED' });
    expect(mocks.recordLegacyRoute).toHaveBeenCalledWith('users-offline-status');
    expect(mocks.beginLegacyPresenceWrite).toHaveBeenCalledOnce();
    expect(mocks.closeLegacyWriteGate).toHaveBeenCalledWith('rejected');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('fails closed after auth but before mutation when offline receipt recording fails', async () => {
    const { LegacyPresenceRouteAuditError } = await import('@/lib/presence/legacy-route-audit');
    mocks.recordLegacyRoute.mockRejectedValue(new LegacyPresenceRouteAuditError());

    const response = await PATCH(requestFor(APP_USER_ID, { status: 'offline' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'LEGACY_AUDIT_UNAVAILABLE' });
    expect(mocks.requireAuthUser).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects self-updates that try to move through users/update', async () => {
    const response = await PATCH(requestFor(APP_USER_ID, {
      currentSpaceId: 'space-1',
    }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
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

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'admin' }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_company_member_role', {
      p_actor_user_id: APP_USER_ID,
      p_target_user_id: TARGET_USER_ID,
      p_company_id: COMPANY_ID,
      p_role: 'admin',
    });
    expect(mocks.update).not.toHaveBeenCalled();
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

  it('maps the database-enforced self-demotion denial without exposing details', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ role: 'admin' }),
    });
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID }));
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN',
        details: 'private row data',
      },
    });

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'member' }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(403);
    expect(body).toContain('COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN');
    expect(body).not.toContain('private row data');
  });

  it('fails closed when the role RPC returns another target identity', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ role: 'admin' }),
    });
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID, role: 'member' }));
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_MEMBER_ROLE_UPDATED',
        actorUserId: APP_USER_ID,
        targetUserId: APP_USER_ID,
        companyId: COMPANY_ID,
        role: 'admin',
        previousSpaceId: null,
        locationVersion: 0,
        presenceAccessRevision: 2,
        retiredSessionCount: 0,
        closedLogCount: 0,
        invalidatedInvitationCount: 0,
        operationTime: '2026-07-18T21:00:00.000Z',
      },
      error: null,
    });

    const response = await PATCH(requestFor(TARGET_USER_ID, { role: 'admin' }));

    expect(response.status).toBe(500);
  });
});
