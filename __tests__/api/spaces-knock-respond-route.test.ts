import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/respond/route';
import type { NextRequest } from 'next/server';

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_SPACE_ID = '66666666-6666-4666-8666-666666666666';
const REQUEST_ID = 'request-1';
const REQUESTER_ID = '55555555-5555-4555-8555-555555555555';

const mockAuthGetUser = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockRequesterMaybeSingle = vi.fn();
const mockKnockUpdate = vi.fn();

const mockAuthedClient = {
  auth: {
    getUser: () => mockAuthGetUser(),
  },
};

const mockAdminFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: () => mockRequesterMaybeSingle(),
        })),
      })),
    };
  }

  if (table === 'knock_requests') {
    return {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => mockKnockUpdate()),
          })),
        })),
      })),
    };
  }

  if (table === 'conversations') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        })),
      })),
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
  } as unknown as NextRequest;
}

async function postKnockResponse(body: object): Promise<Response> {
  return (await POST(createRequest(body))) as Response;
}

describe('/api/spaces/knock/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID } },
      error: null,
    });
    mockFindBySupabaseUid.mockResolvedValue({
      id: APP_USER_ID,
      companyId: COMPANY_ID,
      currentSpaceId: SPACE_ID,
      status: 'offline',
      displayName: 'Morgan Occupant',
    });
    mockRequesterMaybeSingle.mockResolvedValue({
      data: {
        id: REQUESTER_ID,
        company_id: COMPANY_ID,
        display_name: 'Taylor Knocker',
      },
      error: null,
    });
    mockKnockUpdate.mockResolvedValue({ error: null });
  });

  it('allows reloaded occupants with stale offline DB status to approve knocks', async () => {
    const response = await postKnockResponse({
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
      requesterId: REQUESTER_ID,
      requesterName: 'Taylor Knocker',
      decision: 'APPROVE',
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.response).toMatchObject({
      type: 'KNOCK_RESPONSE',
      requestId: REQUEST_ID,
      decision: 'APPROVE',
      responderId: APP_USER_ID,
      requesterId: REQUESTER_ID,
      spaceId: SPACE_ID,
      responderValidated: true,
    });
    expect(mockKnockUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects responders who are not currently assigned to the target space', async () => {
    mockFindBySupabaseUid.mockResolvedValueOnce({
      id: APP_USER_ID,
      companyId: COMPANY_ID,
      currentSpaceId: OTHER_SPACE_ID,
      status: 'online',
      displayName: 'Morgan Occupant',
    });

    const response = await postKnockResponse({
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
      requesterId: REQUESTER_ID,
      requesterName: 'Taylor Knocker',
      decision: 'APPROVE',
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Only occupants currently in this space can respond to knocks');
    expect(mockKnockUpdate).not.toHaveBeenCalled();
  });
});
