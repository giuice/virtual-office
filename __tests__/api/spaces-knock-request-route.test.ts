import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/request/route';

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = 'request-1';

const mockAuthGetUser = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockSpaceMaybeSingle = vi.fn();
const mockUsersCount = vi.fn();
const mockCleanupLt = vi.fn();
const mockKnockInsert = vi.fn();

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
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          lt: (column: string, value: string) => mockCleanupLt(column, value),
        })),
      })),
      insert: (payload: Record<string, unknown>) => mockKnockInsert(payload),
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

vi.mock('@/repositories/implementations/supabase/SupabaseUserRepository', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockFindBySupabaseUid(uid),
    };
  },
}));

function createRequest(body: object) {
  return {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

async function postKnock(body: object): Promise<Response> {
  return (await POST(createRequest(body))) as Response;
}

describe('/api/spaces/knock/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID } },
      error: null,
    });
    mockFindBySupabaseUid.mockResolvedValue({
      id: APP_USER_ID,
      companyId: COMPANY_ID,
    });
    mockSpaceMaybeSingle.mockResolvedValue({
      data: {
        id: SPACE_ID,
        company_id: COMPANY_ID,
      },
      error: null,
    });
    mockUsersCount.mockResolvedValue({ count: 1, error: null });
    mockCleanupLt.mockResolvedValue({ error: null });
    mockKnockInsert.mockResolvedValue({ error: null });
  });

  it('counts only non-offline users as knock recipients', async () => {
    const response = await postKnock({
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
      requesterName: 'Taylor Knocker',
      requesterAvatarUrl: 'https://example.com/avatar.png',
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recipientCount).toBe(1);
    expect(mockUsersCount).toHaveBeenCalledTimes(1);
    expect(mockKnockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: REQUEST_ID,
        requester_id: APP_USER_ID,
        space_id: SPACE_ID,
        status: 'pending',
      })
    );
  });

  it('returns zero recipients when only offline occupants remain in the space', async () => {
    mockUsersCount.mockResolvedValueOnce({ count: 0, error: null });

    const response = await postKnock({
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
      requesterName: 'Taylor Knocker',
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recipientCount).toBe(0);
    expect(mockUsersCount).toHaveBeenCalledTimes(1);
    expect(mockKnockInsert).toHaveBeenCalledTimes(1);
  });
});
