import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/companies/create/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

function requestFor(body: unknown): Request {
  return new Request('https://example.test/api/companies/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/companies/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      authUser: { id: 'auth-user' },
      dbUser: { id: USER_ID, companyId: null, role: 'member' },
      supabase: {},
    });
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_CREATED',
        userId: USER_ID,
        companyId: COMPANY_ID,
        name: 'Acme',
        adminIds: [USER_ID],
        settings: {},
        createdAt: '2026-07-18T21:00:00.000Z',
        previousSpaceId: null,
        locationVersion: 0,
        presenceAccessRevision: 2,
        retiredSessionCount: 0,
        closedLogCount: 0,
        operationTime: '2026-07-18T21:00:00.000Z',
      },
      error: null,
    });
  });

  it('creates company and creator membership through one service RPC', async () => {
    const response = await POST(requestFor({ name: 'Acme' }));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('create_company_for_user', {
      p_user_id: USER_ID,
      p_name: 'Acme',
      p_settings: {},
    });
    expect(await response.json()).toMatchObject({
      code: 'COMPANY_CREATED',
      company: { id: COMPANY_ID, adminIds: [USER_ID] },
    });
  });

  it('rejects unknown or membership-bearing request fields', async () => {
    const response = await POST(
      requestFor({ name: 'Acme', adminIds: [USER_ID] }),
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps the database-serialized existing-company race', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'COMPANY_CREATE_ALREADY_HAS_COMPANY' },
    });

    const response = await POST(requestFor({ name: 'Acme' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ALREADY_HAS_COMPANY' });
  });

  it('fails closed when the complete RPC payload names another user', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_CREATED',
        userId: COMPANY_ID,
        companyId: COMPANY_ID,
        name: 'Acme',
        adminIds: [COMPANY_ID],
        settings: {},
        createdAt: '2026-07-18T21:00:00.000Z',
        previousSpaceId: null,
        locationVersion: 0,
        presenceAccessRevision: 2,
        retiredSessionCount: 0,
        closedLogCount: 0,
        operationTime: '2026-07-18T21:00:00.000Z',
      },
      error: null,
    });

    const response = await POST(requestFor({ name: 'Acme' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
