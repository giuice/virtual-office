import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/users/location/route';

const mockAuthGetUser = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockUpdateLocation = vi.fn();
const mockUpdate = vi.fn();
const mockSpaceMaybeSingle = vi.fn();
const mockUsersCount = vi.fn();
const mockKnockMaybeSingle = vi.fn();
const mockPresenceMaybeSingle = vi.fn();
const mockPresenceInsert = vi.fn();
const mockPresenceUpdate = vi.fn();
const mockDeleteEq = vi.fn();

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return {
        from: (table: string) => {
          if (table === 'spaces') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => mockSpaceMaybeSingle(),
                }),
              }),
            };
          }

          if (table === 'users') {
            return {
              select: () => ({
                eq: () => ({
                  neq: () => mockUsersCount(),
                }),
              }),
            };
          }

          if (table === 'knock_requests') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: () => mockKnockMaybeSingle(),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              delete: () => ({
                eq: (column: string, value: string) => mockDeleteEq(column, value),
              }),
            };
          }

          if (table === 'space_presence_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    not: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: () => mockPresenceMaybeSingle(),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: (payload: unknown) => mockPresenceInsert(payload),
              update: (payload: unknown) => ({
                eq: () => ({
                  eq: () => ({
                    is: () => mockPresenceUpdate(payload),
                  }),
                }),
              }),
            };
          }

          throw new Error(`Unexpected service-role table: ${table}`);
        },
      };
    }

    return {
      auth: {
        getUser: () => mockAuthGetUser(),
      },
    };
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockFindBySupabaseUid(uid),
      updateLocation: (userId: string, spaceId: string | null) => mockUpdateLocation(userId, spaceId),
      update: (userId: string, updates: unknown) => mockUpdate(userId, updates),
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

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APP_USER_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';

function makeAuthenticatedUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: APP_USER_ID,
    companyId: 'company-1',
    supabase_uid: 'supabase-user-1',
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    currentSpaceId: null,
    ...overrides,
  };
}

describe('/api/users/location', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsersCount.mockResolvedValue({ count: 0, error: null });
    mockPresenceMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockKnockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockPresenceInsert.mockResolvedValue({ error: null });
    mockPresenceUpdate.mockResolvedValue({ error: null });
    mockDeleteEq.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue(null);
    mockUpdateLocation.mockImplementation(async (userId: string, spaceId: string | null) => ({
      ...makeAuthenticatedUser(),
      id: userId,
      currentSpaceId: spaceId,
    }));
    mockSpaceMaybeSingle.mockResolvedValue({
      data: {
        id: SPACE_ID,
        company_id: 'company-1',
        status: 'active',
        capacity: 10,
        access_control: { isPublic: false },
      },
      error: null,
    });
    mockFindBySupabaseUid.mockResolvedValue(makeAuthenticatedUser());
  });

  it('returns 401 when auth.getUser() has no user', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const response = (await PUT(createRequest({ userId: APP_USER_ID, spaceId: null }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 USER_MISMATCH when payload userId does not equal the authenticated app user id', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });

    const response = (await PUT(createRequest({ userId: OTHER_APP_USER_ID, spaceId: SPACE_ID }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('USER_MISMATCH');
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('returns 403 SPACE_ACCESS_DENIED for a restricted space with no approved knock and no recent occupancy', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });

    const response = (await PUT(createRequest({ userId: APP_USER_ID, spaceId: SPACE_ID }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('SPACE_ACCESS_DENIED');
    expect(mockUpdateLocation).not.toHaveBeenCalled();
  });

  it('allows restricted-space entry when an approved knock row exists and inserts space_presence_log.authorized_by', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });
    mockKnockMaybeSingle.mockResolvedValue({
      data: { id: 'knock-1', responder_id: 'occupant-7' },
      error: null,
    });

    const response = (await PUT(createRequest({ userId: APP_USER_ID, spaceId: SPACE_ID }))) as Response;
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPresenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: APP_USER_ID,
        space_id: SPACE_ID,
        authorized_by: 'occupant-7',
      })
    );
  });

  it('allows restricted-space grace rejoin when the latest matching space_presence_log.exited_at is within 5 minutes', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });
    mockPresenceMaybeSingle.mockResolvedValue({
      data: {
        exited_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      },
      error: null,
    });

    const response = (await PUT(createRequest({ userId: APP_USER_ID, spaceId: SPACE_ID }))) as Response;
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

  it('deletes the consumed approved knock row after a successful restricted join', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'supabase-user-1' } },
      error: null,
    });
    mockKnockMaybeSingle.mockResolvedValue({
      data: { id: 'knock-9', responder_id: 'occupant-7' },
      error: null,
    });

    const response = (await PUT(createRequest({ userId: APP_USER_ID, spaceId: SPACE_ID }))) as Response;

    expect(response.status).toBe(200);
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'knock-9');
  });
});
