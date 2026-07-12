import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { PUT } from '@/app/api/users/location/route';

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

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const RESPONDER_ID = '55555555-5555-4555-8555-555555555555';
const APPROVED_KNOCK_ID = '66666666-6666-4666-8666-666666666666';

interface KnockRow {
  id: string;
  requester_id: string;
  space_id: string;
  status: string;
  decision: string | null;
  responder_id: string | null;
  expires_at: string | null;
  consumed_at: string | null;
}

interface QueryFilter {
  type: 'eq' | 'gt' | 'is' | 'not';
  column: string;
  value: unknown;
}

const mockAuthGetUser = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockFindById = vi.fn();
const mockUpdateLocation = vi.fn();
const mockUpdate = vi.fn();
const mockSpaceMaybeSingle = vi.fn();
const mockUsersCount = vi.fn();
const mockKnockMaybeSingle = vi.fn((filters: QueryFilter[]) => ({
  data: findMatchingKnockRow(filters),
  error: null,
}));
const mockKnockUpdate = vi.fn();
const mockKnockUpdateEq = vi.fn();
const mockPresenceMaybeSingle = vi.fn();
const mockOpenPresenceLogMaybeSingle = vi.fn();
const mockPresenceInsert = vi.fn();
const mockPresenceUpdate = vi.fn();
const mockDeleteEq = vi.fn();

let mockKnockRows: KnockRow[] = [];

function findMatchingKnockRow(filters: QueryFilter[]): KnockRow | null {
  return (
    mockKnockRows.find((row) =>
      filters.every((filter) => {
        const value = row[filter.column as keyof KnockRow];

        if (filter.type === 'eq') {
          return value === filter.value;
        }

        if (filter.type === 'is') {
          return value === filter.value;
        }

        if (filter.type === 'not') {
          return value !== filter.value;
        }

        if (filter.type === 'gt') {
          return Boolean(value && new Date(value).getTime() > new Date(String(filter.value)).getTime());
        }

        return false;
      })
    ) ?? null
  );
}

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
        const filters: QueryFilter[] = [];
        const chain = {
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ type: 'eq', column, value });
            return chain;
          }),
          gt: vi.fn((column: string, value: unknown) => {
            filters.push({ type: 'gt', column, value });
            return chain;
          }),
          is: vi.fn((column: string, value: unknown) => {
            filters.push({ type: 'is', column, value });
            return chain;
          }),
          not: vi.fn((column: string, operator: string, value: unknown) => {
            if (operator === 'is') {
              filters.push({ type: 'not', column, value });
            }
            return chain;
          }),
          order: vi.fn(() => chain),
          limit: vi.fn(() => ({
            maybeSingle: () => mockKnockMaybeSingle(filters),
          })),
          maybeSingle: () => mockKnockMaybeSingle(filters),
        };

        return chain;
      }),
      update: (payload: Record<string, unknown>) => {
        mockKnockUpdate(payload);

        return {
          eq: (column: string, value: string) => mockKnockUpdateEq(column, value),
        };
      },
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
            // .is('exited_at', null) marks this as the open presence log query.
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

function makeApprovedKnock(overrides: Partial<KnockRow> = {}): KnockRow {
  return {
    id: APPROVED_KNOCK_ID,
    requester_id: APP_USER_ID,
    space_id: SPACE_ID,
    status: 'approved',
    decision: 'APPROVE',
    responder_id: RESPONDER_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

function primeRestrictedSpace(options: {
  currentSpaceId?: string | null;
  accessControl?: unknown;
  knockRows?: KnockRow[];
  priorExitAt?: string | null;
  lastActive?: string;
  openPresenceLog?: Record<string, unknown> | null;
  userOverrides?: Partial<User>;
} = {}) {
  const {
    currentSpaceId = null,
    accessControl = { isPublic: false },
    knockRows = [],
    priorExitAt = null,
    lastActive = '2026-03-19T10:00:00.000Z',
    openPresenceLog = null,
    userOverrides = {},
  } = options;

  mockKnockRows = knockRows;
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: AUTH_USER_ID } },
    error: null,
  });
  mockFindBySupabaseUid.mockResolvedValue(
    makeAuthenticatedUser({ currentSpaceId, lastActive, ...userOverrides })
  );
  mockSpaceMaybeSingle.mockResolvedValue({
    data: {
      id: SPACE_ID,
      company_id: COMPANY_ID,
      status: 'active',
      capacity: 10,
      access_control: accessControl,
    },
    error: null,
  });
  mockUsersCount.mockResolvedValue({ count: 0, error: null });
  mockPresenceMaybeSingle.mockResolvedValue({
    data: priorExitAt ? { exited_at: priorExitAt } : null,
    error: null,
  });
  mockOpenPresenceLogMaybeSingle.mockResolvedValue({
    data: openPresenceLog,
    error: null,
  });
  mockPresenceInsert.mockResolvedValue({ error: null });
  mockPresenceUpdate.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
  mockKnockUpdateEq.mockResolvedValue({ error: null });
  mockUpdate.mockResolvedValue(makeAuthenticatedUser({ currentSpaceId: null, status: 'offline' }));
  mockUpdateLocation.mockImplementation(async (userId: string, spaceId: string | null) => ({
    ...makeAuthenticatedUser(),
    id: userId,
    currentSpaceId: spaceId,
  }));
}

async function expectAccessDenied(body: object = { userId: APP_USER_ID, spaceId: SPACE_ID }) {
  const response = await putLocation(body);
  const data = await response.json();

  expect(response.status).toBe(403);
  expect(data.code).toBe('SPACE_ACCESS_DENIED');
  expect(mockUpdateLocation).not.toHaveBeenCalled();
}

describe('/api/users/location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKnockRows = [];
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

    await expectAccessDenied();
  });

  it('allows public entry when access_control is null', async () => {
    primeRestrictedSpace({ accessControl: null });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('allows public entry when access_control is an empty object', async () => {
    primeRestrictedSpace({ accessControl: {} });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('allows public entry when access_control.isPublic is true', async () => {
    primeRestrictedSpace({ accessControl: { isPublic: true } });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('allows restricted-space entry when a valid exact knockRequestId exists and inserts space_presence_log.authorized_by', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock()],
    });

    const response = await putLocation({
      userId: APP_USER_ID,
      spaceId: SPACE_ID,
      knockRequestId: APPROVED_KNOCK_ID,
    });
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

  it('allows direct restricted-space entry when access rules allow the user and no online occupants are present', async () => {
    primeRestrictedSpace({
      accessControl: { isPublic: false, allowedUsers: [APP_USER_ID] },
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
    expect(mockPresenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: APP_USER_ID,
        space_id: SPACE_ID,
        authorized_by: null,
      })
    );
  });

  it('allows direct restricted-space entry for admins', async () => {
    primeRestrictedSpace({
      userOverrides: { role: 'admin' },
    });

    const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockKnockMaybeSingle).not.toHaveBeenCalled();
  });

  it('keeps restricted empty spaces locked when access rules do not allow the user', async () => {
    primeRestrictedSpace();

    await expectAccessDenied();
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

  it('denies restricted-space grace rejoin via recent last_active when no exited_at log exists', async () => {
    primeRestrictedSpace({
      lastActive: new Date(Date.now() - 30_000).toISOString(),
    });

    await expectAccessDenied();
  });

  it('denies restricted-space entry when last_active is in the future', async () => {
    primeRestrictedSpace({
      lastActive: new Date(Date.now() + 30_000).toISOString(),
    });

    await expectAccessDenied();
  });

  it('denies restricted-space entry when stale current-space assignment is the only evidence', async () => {
    primeRestrictedSpace({
      currentSpaceId: SPACE_ID,
      lastActive: '2026-03-01T00:00:00.000Z',
    });

    await expectAccessDenied();
  });

  it('denies restricted-space grace rejoin via a months-old open presence log', async () => {
    primeRestrictedSpace({
      lastActive: '2026-03-01T00:00:00.000Z',
      openPresenceLog: { id: 'open-log-1', entered_at: '2026-01-01T00:00:00.000Z' },
    });

    await expectAccessDenied();
  });

  it('denies restricted-space grace rejoin via a fresh open presence log', async () => {
    primeRestrictedSpace({
      lastActive: '2026-03-01T00:00:00.000Z',
      openPresenceLog: { id: 'open-log-1', entered_at: new Date().toISOString() },
    });

    await expectAccessDenied();
  });

  it('denies restricted-space entry for an expired exact knock approval', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock({ expires_at: new Date(Date.now() - 60_000).toISOString() })],
    });

    await expectAccessDenied({
      userId: APP_USER_ID,
      spaceId: SPACE_ID,
      knockRequestId: APPROVED_KNOCK_ID,
    });
  });

  it('denies restricted-space entry for an approval missing responder_id', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock({ responder_id: null })],
    });

    await expectAccessDenied({
      userId: APP_USER_ID,
      spaceId: SPACE_ID,
      knockRequestId: APPROVED_KNOCK_ID,
    });
  });

  it('denies restricted-space entry for an already consumed approval', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock({ consumed_at: new Date(Date.now() - 30_000).toISOString() })],
    });

    await expectAccessDenied({
      userId: APP_USER_ID,
      spaceId: SPACE_ID,
      knockRequestId: APPROVED_KNOCK_ID,
    });
  });

  it('denies restricted-space entry when an approved row exists but the body has no knockRequestId', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock()],
    });

    await expectAccessDenied();
  });

  it('denies malformed access_control with SPACE_ACCESS_CONFIGURATION_INVALID before admin direct access', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    primeRestrictedSpace({
      accessControl: { allowedUsers: [] },
      userOverrides: { role: 'admin' },
    });

    try {
      const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('SPACE_ACCESS_CONFIGURATION_INVALID');
      expect(mockUpdateLocation).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('denies raw-string access_control with SPACE_ACCESS_CONFIGURATION_INVALID before allowedUsers direct access', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    primeRestrictedSpace({
      accessControl: 'private',
      userOverrides: { role: 'admin' },
    });

    try {
      const response = await putLocation({ userId: APP_USER_ID, spaceId: SPACE_ID });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('SPACE_ACCESS_CONFIGURATION_INVALID');
      expect(mockUpdateLocation).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('updates the consumed approved knock row after a successful restricted join', async () => {
    primeRestrictedSpace({
      knockRows: [makeApprovedKnock()],
    });

    const response = await putLocation({
      userId: APP_USER_ID,
      spaceId: SPACE_ID,
      knockRequestId: APPROVED_KNOCK_ID,
    });

    expect(response.status).toBe(200);
    expect(mockDeleteEq).not.toHaveBeenCalled();
    expect(mockKnockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'consumed',
        consumed_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(mockKnockUpdateEq).toHaveBeenCalledWith('id', APPROVED_KNOCK_ID);
  });
});
