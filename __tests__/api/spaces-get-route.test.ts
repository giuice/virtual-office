import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { GET } from '@/app/api/spaces/get/route';

const COMPANY_ID = 'company-1';
const OTHER_COMPANY_ID = 'company-2';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findByCompany: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseSpaceRepository: function MockSpaceRepository() {
    return {
      findByCompany: (companyId: string) => mocks.findByCompany(companyId),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'app-user-1',
    companyId: COMPANY_ID,
    supabase_uid: 'auth-user-1',
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

function requestFor(companyId: string): Request {
  return {
    url: `https://example.com/api/spaces/get?companyId=${companyId}`,
  } as Request;
}

describe('/api/spaces/get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: 'auth-user-1' },
      dbUser: makeUser(),
    });
    mocks.findByCompany.mockResolvedValue([]);
  });

  it('returns spaces for the authenticated user company', async () => {
    const response = await GET(requestFor(COMPANY_ID));

    expect(response.status).toBe(200);
    expect(mocks.findByCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it('blocks cross-company space reads', async () => {
    const response = await GET(requestFor(OTHER_COMPANY_ID));

    expect(response.status).toBe(403);
    expect(mocks.findByCompany).not.toHaveBeenCalled();
  });
});
