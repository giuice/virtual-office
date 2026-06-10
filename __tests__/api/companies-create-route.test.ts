import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, User } from '@/types/database';
import { POST } from '@/app/api/companies/create/route';

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';
const NEW_COMPANY_ID = 'company-new';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  companyCreate: vi.fn(),
  userUpdate: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseCompanyRepository: function MockCompanyRepository() {
    return {
      create: (data: Omit<Company, 'id' | 'createdAt'>) => mocks.companyCreate(data),
    };
  },
  SupabaseUserRepository: function MockUserRepository() {
    return {
      update: (id: string, updates: Partial<User>) => mocks.userUpdate(id, updates),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: null,
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

function requestFor(body: object): Request {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

describe('/api/companies/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser(),
    });
    mocks.companyCreate.mockImplementation(async (data: Omit<Company, 'id' | 'createdAt'>) => ({
      id: NEW_COMPANY_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...data,
    }));
    mocks.userUpdate.mockImplementation(async (id: string, updates: Partial<User>) => makeUser({ id, ...updates }));
  });

  it('creates a company and promotes the creator to admin', async () => {
    const response = await POST(requestFor({ name: 'Acme' }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.company.adminIds).toEqual([APP_USER_ID]);
    expect(mocks.userUpdate).toHaveBeenCalledWith(APP_USER_ID, {
      companyId: NEW_COMPANY_ID,
      role: 'admin',
    });
  });

  it('rejects creation when the caller already belongs to a company', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser({ companyId: 'company-existing' }),
    });

    const response = await POST(requestFor({ name: 'Acme' }));

    expect(response.status).toBe(409);
    expect(mocks.companyCreate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects creation without a name', async () => {
    const response = await POST(requestFor({}));

    expect(response.status).toBe(400);
    expect(mocks.companyCreate).not.toHaveBeenCalled();
  });
});
