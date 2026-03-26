import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { PUT } from '@/app/api/users/location/route';

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const RESPONDER_ID = '55555555-5555-4555-8555-555555555555';
const APPROVED_KNOCK_ID = 'knock-approval-1';

const mockAuthGetUser = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockFindById = vi.fn();
const mockUpdateLocation = vi.fn();
const mockUpdate = vi.fn();
const mockSpaceMaybeSingle = vi.fn();
const mockUsersCount = vi.fn();
const mockKnockMaybeSingle = vi.fn();
const mockPresenceMaybeSingle = vi.fn();
const mockOpenPresenceLogMaybeSingle = vi.fn();
const mockPresenceInsert = vi.fn();
const mockPresenceUpdate = vi.fn();
const mockDeleteEq = vi.fn();

const mockAuthedClient = {
  auth: {
    getUser: () => mockAuthGetUser(),
  },
};

const mockAdminFrom = vi.fn((table: string) => {
  if (table === 'spaces') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: () => mockSpaceMaybeSingle(),
        })),
      })),
    };
  }

  if (table === 'users') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => ({
            neq: vi.fn(() => mockUsersCount()),
          })),
        })),
      })),
    };
  }

  if (table === 'knock_requests') {
    return {
      select: vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => ({
            maybeSingle: () => mockKnockMaybeSingle(),
          })),
        };

        return chain;
      }),
      delete: vi.fn(() => ({
        eq: (column: string, value: string) => mockDeleteEq(column, value),
      })),
    };
  }

  if (table === 'space_presence_log') {
    return {
      select: vi.fn(() => {
        let isOpenLogPath = false;
        const chain: Record<string, unknown> = {
          eq: vi.fn(() => chain),
          not: vi.fn(() => chain),
          is: vi.fn(() => {
            // .is('exited_at', null) marks this as the open presence log query
            isOpenLogPath = true;
            return chain;
          }),
          order: vi.fn(() => chain),
          limit: vi.fn(() => ({
            maybeSingle: () =>
              isOpenLogPath
                ? mockOpenPresenceLogMaybeSingle()
                : mockPresenceMaybeSingle(),
          })),
        };

        return chain;
      }),
      insert: (payload: Record<string, unknown>) => mockPresenceInsert(payload),
      update: (payload: Record<string, unknown>) => {
        const chain = {
          eq: vi.fn(() => chain),
          is: vi.fn(() => mockPresenceUpdate(payload)),
        };

        return chain;
      },
    };
  }

  throw new Error(`Unexpected service-role table: ${table}`);
});

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return {
        from: (table: string) => mockAdminFrom(table),
      };
    }

    return mockAuthedClient;
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockFindBySupabaseUid(uid),
      findById: (userId: string) => mockFindById(userId),
      updateLocation: (userId: string, spaceId: string | null) => mockUpdateLocation(userId, spaceId),
      update: (userId: string, updates: Partial<User>) => mockUpdate(userId, updates),
    };
  },
}));

function createRequest(body: object) {
  return {
    method: 'PUT',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

async function putLocation(body: object): Promise<Response> {
  return (await PUT(createRequest(body))) as Response;
}

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
    lastActive: '2026-03-19T10:00:00.000Z',
    createdAt: '2026-03-19T09:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

function primeRestrictedSpace(options: {
  currentSpaceId?: string | null;
  approvedKnock?: { id: string; responder_id: string | null } | null;
  priorExitAt?: string | null;
  lastActive?: string;
  hasOpenPresenceLog?: boolean;
} = {}) {
  const {
    currentSpaceId = null,
    approvedKnock = null,
    priorExitAt = null,
    lastActive = '2026-03-19T10:00:00.000Z',
    hasOpenPresenceLog = false,
  } = options;

  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: AUTH_USER_ID } },
    error: null,
  });
  mockFindBySupabaseUid.mockResolvedValue(makeAuthenticatedUser({ currentSpaceId, lastActive }));
  mockSpaceMaybeSingle.mockResolvedValue({
    data: {
      id: SPACE_ID,
      company_id: COMPANY_ID,
      status: 'active',
      capacity: 10,
      access_control: { isPublic: false },
    },
    error: null,
  });
  mockUsersCount.mockResolvedValue({ count: 0, error: null });
  mockKnockMaybeSingle.mockResolvedValue({ data: approvedKnock, error: null });
  mockPresenceMaybeSingle.mockResolvedValue({
    data: priorExitAt ? { exited_at: priorExitAt } : null,
    error: null,
  });
  mockOpenPresenceLogMaybeSingle.mockResolvedValue({
    data: hasOpenPresenceLog ? { id: 'open-log-1' } : null,
    error: null,
  });
  mockPresenceInsert.mockResolvedValue({ error: null });
  mockPresenceUpdate.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
  mockUpdate.mockResolvedValue(makeAuthenticatedUser({ currentSpaceId: null, status: 'offline' }));
  mockUpdateLocation.mockImplementation(async (userId: string, spaceId: string | null) => ({
    ...makeAuthenticatedUser(),
    id: userId,
    currentSpaceId: spaceId,
  }));
}

describe('/api/users/location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockResolvedValue(null);
  });

  it('returns 401 when auth.getUser() has no user', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: null });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.code).toBe('UNAUTHORIZED');
    expect(mockFindBySupabaseUid).not.toHaveBeenCalled();
  });

  it('returns 403 USER_MISMATCH when payload userId does not equal the authenticated app user id', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID } },
      error: null,
    });
    mockFindBySupabaseUid.mockResolvedValue(makeAuthenticatedUser());

    const response = await putLocation({ userId: OTHER_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('USER_MISMATCH');
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('returns 403 SPACE_ACCESS_DENIED for a restricted space with no approved knock and no recent occupancy', async () => {
    primeRestrictedSpace();

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('SPACE_ACCESS_DENIED');
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('allows restricted-space entry when an approved knock row exists and inserts space_presence_log.authorized_by', async () => {
    primeRestrictedSpace({
      approvedKnock: { id: APPROVED_KNOCK_ID, responder_id: RESPONDER_ID },
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPresenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: APP_USER_ID,
        space_id: SPACE_ID,
        authorized_by: RESPONDER_ID,
      })
    );
  });

  it('allows restricted-space grace rejoin when the latest matching space_presence_log.exited_at is within 5 minutes', async () => {
    primeRestrictedSpace({
      priorExitAt: new Date(Date.now() - (5 * 60 * 1000 - 30_000)).toISOString(),
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
    expect(mockPresenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        authorized_by: null,
      })
    );
  });

  it('allows restricted-space grace rejoin via last_active when no exited_at log exists (beacon race)', async () => {
    primeRestrictedSpace({
      lastActive: new Date(Date.now() - 30_000).toISOString(),
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('allows restricted-space grace rejoin via open presence log when no exited_at and stale last_active', async () => {
    primeRestrictedSpace({
      lastActive: '2026-03-01T00:00:00.000Z',
      hasOpenPresenceLog: true,
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('deletes the consumed approved knock row after a successful restricted join', async () => {
    primeRestrictedSpace({
      approvedKnock: { id: APPROVED_KNOCK_ID, responder_id: RESPONDER_ID },
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });

    expect(response.status).toBe(200);
    expect(mockDeleteEq).toHaveBeenCalledWith('id', APPROVED_KNOCK_ID);
  });
});
