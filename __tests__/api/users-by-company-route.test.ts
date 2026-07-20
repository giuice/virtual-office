import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/users/by-company/route';

const COMPANY_ID = 'company-1';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findByCompany: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: (options: unknown) => mocks.requireAuthUser(options),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return { findByCompany: (companyId: string) => mocks.findByCompany(companyId) };
  },
}));

function requestFor(companyId?: string): Request {
  return new Request(`https://example.com/api/users/by-company${companyId ? `?companyId=${companyId}` : ''}`);
}

describe('/api/users/by-company', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: 'auth-user-1' },
      dbUser: { id: 'app-user-1', companyId: COMPANY_ID },
    });
    mocks.findByCompany.mockResolvedValue([{ id: 'app-user-1', companyId: COMPANY_ID }]);
  });

  it('keeps the existing success shape', async () => {
    const response = await GET(requestFor(COMPANY_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      users: [{ id: 'app-user-1', companyId: COMPANY_ID }],
    });
  });

  it('returns a coded correlated envelope for cross-company access', async () => {
    const response = await GET(requestFor('company-2'));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toMatchObject({
      error: 'Cannot access users outside your company',
      code: 'FORBIDDEN',
      correlationId: expect.any(String),
    });
    expect(mocks.findByCompany).not.toHaveBeenCalled();
  });
});
