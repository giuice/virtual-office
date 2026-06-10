import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { GET } from '@/app/api/users/get/route';

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';
const TARGET_USER_ID = 'target-user-1';
const COMPANY_ID = 'company-1';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findById: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findById: (id: string) => mocks.findById(id),
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

function requestFor(userId: string): Request {
  return {
    url: `https://example.com/api/users/get?id=${userId}`,
  } as Request;
}

describe('/api/users/get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser(),
    });
  });

  it('allows reading a same-company user', async () => {
    const targetUser = makeUser({ id: TARGET_USER_ID });
    mocks.findById.mockResolvedValue(targetUser);

    const response = await GET(requestFor(TARGET_USER_ID));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user).toEqual(targetUser);
  });

  it('blocks unaffiliated users from reading other unaffiliated users', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ companyId: null }),
    });
    mocks.findById.mockResolvedValue(makeUser({ id: TARGET_USER_ID, companyId: null }));

    const response = await GET(requestFor(TARGET_USER_ID));

    expect(response.status).toBe(403);
  });
});
