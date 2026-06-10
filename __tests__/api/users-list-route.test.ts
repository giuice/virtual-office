import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { GET } from '@/app/api/users/list/route';

const APP_USER_ID = 'app-user-1';
const COMPANY_ID = 'company-1';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findByCompany: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findByCompany: (companyId: string) => mocks.findByCompany(companyId),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
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

describe('/api/users/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the auth helper rejects the request', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authentication required' }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.findByCompany).not.toHaveBeenCalled();
  });

  it('lists only users in the authenticated user company', async () => {
    const dbUser = makeUser();
    const companyUsers = [dbUser, makeUser({ id: 'peer-user-1', email: 'peer@example.com' })];
    mocks.requireAuthUser.mockResolvedValue({ supabase: mocks.supabase, authUser: { id: 'auth-user-1' }, dbUser });
    mocks.findByCompany.mockResolvedValue(companyUsers);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findByCompany).toHaveBeenCalledWith(COMPANY_ID);
    expect(data.users).toEqual(companyUsers);
  });

  it('returns only the authenticated user when they do not belong to a company', async () => {
    const dbUser = makeUser({ companyId: null });
    mocks.requireAuthUser.mockResolvedValue({ supabase: mocks.supabase, authUser: { id: 'auth-user-1' }, dbUser });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findByCompany).not.toHaveBeenCalled();
    expect(data.users).toEqual([dbUser]);
  });
});
