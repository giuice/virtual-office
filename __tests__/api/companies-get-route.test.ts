import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/companies/get/route';

const COMPANY_ID = 'company-1';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findById: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: (options: unknown) => mocks.requireAuthUser(options),
}));

vi.mock('@/repositories/implementations/supabase/SupabaseCompanyRepository', () => ({
  SupabaseCompanyRepository: function MockCompanyRepository() {
    return { findById: (id: string) => mocks.findById(id) };
  },
}));

function requestFor(id?: string): Request {
  return new Request(`https://example.com/api/companies/get${id ? `?id=${id}` : ''}`);
}

describe('/api/companies/get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: 'auth-user-1' },
      dbUser: { id: 'app-user-1', companyId: COMPANY_ID },
    });
    mocks.findById.mockResolvedValue({ id: COMPANY_ID, name: 'Analytical Engines' });
  });

  it('keeps the existing success shape', async () => {
    const response = await GET(requestFor(COMPANY_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      company: { id: COMPANY_ID, name: 'Analytical Engines' },
    });
    expect(mocks.findById).toHaveBeenCalledWith(COMPANY_ID);
  });

  it('returns a coded correlated envelope for invalid input', async () => {
    const response = await GET(requestFor());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      error: 'Company ID is required',
      code: 'BAD_REQUEST',
      correlationId: expect.any(String),
    });
  });

  it('passes the handler correlationId into the auth boundary', async () => {
    await GET(requestFor(COMPANY_ID));

    expect(mocks.requireAuthUser).toHaveBeenCalledWith({
      correlationId: expect.any(String),
      pathname: '/api/companies/get',
    });
  });
});
