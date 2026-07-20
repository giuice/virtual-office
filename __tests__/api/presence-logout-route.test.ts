import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { POST } from '@/app/api/presence/logout/route';

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_SESSION_ID = '77777777-7777-4777-8777-777777777777';
const TRANSITION_ID = '22222222-2222-4222-8222-222222222222';

const mockAuthGetClaims = vi.fn();
const mockAuthGetUser = vi.fn();
const mockSignOut = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockRevokedMaybeSingle = vi.fn();
const mockLogoutReplayMaybeSingle = vi.fn();
const mockRpc = vi.fn();
const { mockEmitPresenceEvent } = vi.hoisted(() => ({
  mockEmitPresenceEvent: vi.fn(),
}));

vi.mock('@/lib/presence/observability', () => ({
  emitPresenceEvent: mockEmitPresenceEvent,
}));

const mockAuthedClient = {
  auth: {
    getUser: () => mockAuthGetUser(),
    getClaims: () => mockAuthGetClaims(),
    signOut: (options: { scope: 'local' }) => mockSignOut(options),
  },
};

function makeQuery(result: () => Promise<unknown>): Record<string, unknown> {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    not: vi.fn(() => query),
    maybeSingle: () => result(),
  };
  return query;
}

const mockAdminFrom = vi.fn((table: string) => {
  if (table === 'revoked_presence_auth_sessions') {
    return makeQuery(() => mockRevokedMaybeSingle());
  }

  if (table === 'location_transition_requests') {
    return makeQuery(() => mockLogoutReplayMaybeSingle());
  }

  throw new Error(`Unexpected service-role table: ${table}`);
});

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return {
        from: (table: string) => mockAdminFrom(table),
        rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
      };
    }

    return mockAuthedClient;
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockFindBySupabaseUid(uid),
    };
  },
}));

function makeAuthenticatedUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: COMPANY_ID,
    supabase_uid: AUTH_USER_ID,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-07-11T12:00:00.000Z',
    createdAt: '2026-07-11T11:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

function primeAuth(): void {
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: AUTH_USER_ID } },
    error: null,
  });
  mockAuthGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: AUTH_USER_ID,
        session_id: AUTH_SESSION_ID,
      },
    },
    error: null,
  });
  mockFindBySupabaseUid.mockResolvedValue(makeAuthenticatedUser());
  mockRevokedMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockLogoutReplayMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockSignOut.mockResolvedValue({ error: null });
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/api/presence/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rpcRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    code: 'LOCATION_UPDATED',
    message: 'Location updated',
    transition_id: TRANSITION_ID,
    previous_space_id: '99999999-9999-4999-8999-999999999999',
    current_space_id: null,
    location_version: 24,
    already_applied: false,
    authorized_by: null,
    previous_location_version: 23,
    authorization_mode: null,
    ...overrides,
  };
}

async function expectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('/api/presence/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mockRpc.mockImplementation((name: string) => {
      if (name === 'transition_user_location_observed') {
        return Promise.resolve({ data: rpcRow(), error: null });
      }

      if (name === 'confirm_presence_auth_session_revoked') {
        return Promise.resolve({ data: { confirmed: true }, error: null });
      }

      throw new Error(`Unexpected rpc: ${name}`);
    });
  });

  it('runs logout transition, signs out local scope, and confirms revocation', async () => {
    const response = await POST(jsonRequest({ transitionId: TRANSITION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      code: 'LOCATION_UPDATED',
      transitionId: TRANSITION_ID,
    });
    expect(mockRpc).toHaveBeenCalledWith('transition_user_location_observed', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: null,
      p_transition_id: TRANSITION_ID,
      p_target_space_id: null,
      p_reason: 'logout',
      p_knock_request_id: null,
      p_expected_location_version: null,
    });
    expect(mockEmitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'logout',
      previousLocationVersion: 23,
      resultLocationVersion: 24,
    }));
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockRpc).toHaveBeenCalledWith('confirm_presence_auth_session_revoked', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
    });
  });

  it('allows fenced replay only for a matching completed logout row', async () => {
    mockRevokedMaybeSingle.mockResolvedValueOnce({
      data: { auth_session_id: AUTH_SESSION_ID },
      error: null,
    });
    mockLogoutReplayMaybeSingle.mockResolvedValueOnce({
      data: { transition_id: TRANSITION_ID },
      error: null,
    });
    mockRpc.mockImplementation((name: string) => {
      if (name === 'transition_user_location_observed') {
        return Promise.resolve({
          data: rpcRow({ code: 'LOCATION_UNCHANGED', already_applied: true }),
          error: null,
        });
      }

      return Promise.resolve({ data: { confirmed: true }, error: null });
    });

    const response = await POST(jsonRequest({ transitionId: TRANSITION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      code: 'LOCATION_UNCHANGED',
      alreadyApplied: true,
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    ['no completed logout row'],
    ['different fingerprint row'],
  ])('rejects fenced logout replay with %s', async () => {
    mockRevokedMaybeSingle.mockResolvedValueOnce({
      data: { auth_session_id: AUTH_SESSION_ID },
      error: null,
    });
    mockLogoutReplayMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(jsonRequest({ transitionId: TRANSITION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      success: false,
      code: 'AUTH_SESSION_REVOKED',
      retryable: false,
      transitionId: TRANSITION_ID,
    });
    expect(mockRpc).not.toHaveBeenCalledWith(
      'transition_user_location_observed',
      expect.anything()
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('does not clear cookies when the logout transition fails', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'transition_user_location_observed') {
        return Promise.resolve({
          data: null,
          error: { message: 'raw database failure must not leak' },
        });
      }

      throw new Error(`Unexpected rpc: ${name}`);
    });

    const response = await POST(jsonRequest({ transitionId: TRANSITION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      success: false,
      code: 'INTERNAL_ERROR',
      retryable: true,
      transitionId: TRANSITION_ID,
    });
    expect(JSON.stringify(data)).not.toContain('raw database');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('treats confirm rpc failure as non-fatal after local sign-out', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockRpc.mockImplementation((name: string) => {
      if (name === 'transition_user_location_observed') {
        return Promise.resolve({ data: rpcRow(), error: null });
      }

      if (name === 'confirm_presence_auth_session_revoked') {
        return Promise.resolve({ data: null, error: { message: 'absence not confirmed' } });
      }

      throw new Error(`Unexpected rpc: ${name}`);
    });

    try {
      const response = await POST(jsonRequest({ transitionId: TRANSITION_ID }));
      const data = await expectJson(response);

      expect(response.status).toBe(200);
      expect(data).toMatchObject({ success: true, transitionId: TRANSITION_ID });
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});
