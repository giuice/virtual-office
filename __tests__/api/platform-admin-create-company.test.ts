import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/platform-admin/create-company/route';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPlatformAdmin: vi.fn(),
  rpc: vi.fn(),
  inviteUserByEmail: vi.fn(),
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({ toString: () => 'd'.repeat(64) })),
  },
}));

vi.mock('@/repositories/implementations/supabase/SupabasePlatformAdminRepository', () => ({
  SupabasePlatformAdminRepository: function MockPlatformAdminRepository() {
    return { isUserPlatformAdmin: mocks.isPlatformAdmin };
  },
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: string) =>
    role === 'service_role'
      ? {
          rpc: mocks.rpc,
          auth: { admin: { inviteUserByEmail: mocks.inviteUserByEmail } },
        }
      : { auth: { getUser: mocks.getUser } },
  ),
}));

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const INVITATION_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'd'.repeat(64);

function successfulRpcResult() {
  return {
    ok: true,
    code: 'PLATFORM_COMPANY_AND_INVITATION_CREATED',
    platformAdminId: '44444444-4444-4444-8444-444444444444',
    companyId: COMPANY_ID,
    companyName: 'Atomic Tenant',
    companySettings: { theme: 'neon', planType: 'free' },
    companyCreatedAt: '2026-07-18T21:00:00.000Z',
    invitationId: INVITATION_ID,
    email: 'admin@example.com',
    role: 'admin',
    token: TOKEN,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitationCreatedAt: '2026-07-18T21:00:00.000Z',
  };
}

function request(body: Record<string, unknown> = {}): Request {
  return new Request('http://localhost:3000/api/platform-admin/create-company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'Atomic Tenant',
      adminEmail: 'Admin@Example.com',
      planType: 'free',
      ...body,
    }),
  });
}

describe('/api/platform-admin/create-company', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
    mocks.isPlatformAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({
      data: successfulRpcResult(),
      error: null,
    });
    mocks.inviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('creates the company and initial invitation in one locked RPC', async () => {
    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      success: true,
      company: { id: COMPANY_ID, name: 'Atomic Tenant' },
      invitation: { id: INVITATION_ID, email: 'admin@example.com', token: TOKEN },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_company_with_initial_admin_invitation',
      {
        p_platform_admin_auth_user_id: AUTH_USER_ID,
        p_name: 'Atomic Tenant',
        p_settings: { theme: 'neon', planType: 'free' },
        p_email: 'admin@example.com',
        p_token: TOKEN,
        p_expires_at: expect.any(String),
      },
    );
    expect(mocks.inviteUserByEmail).toHaveBeenCalledOnce();
  });

  it('fails before the RPC for a non-platform-admin', async () => {
    mocks.isPlatformAdmin.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps a platform-admin revocation detected under the database lock', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'PLATFORM_COMPANY_CREATE_FORBIDDEN' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('fails closed on a partial or mismatched atomic result', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        code: 'PLATFORM_COMPANY_AND_INVITATION_CREATED',
        companyId: COMPANY_ID,
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC returns a different invitation email', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...successfulRpcResult(), email: 'other@example.com' },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
