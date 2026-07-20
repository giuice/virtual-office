import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/invitations/create/route';

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('a'.repeat(64)),
    }),
  },
}));

const mockAuthGetUser = vi.fn();
const mockAuthAdminInvite = vi.fn();
const mockInvitationRpc = vi.fn();

let mockCompanyData: { id: string; admin_ids: string[] } | null;
let mockUserData: { id: string; role: string; company_id: string | null } | null;

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn().mockImplementation((role?: string) => {
    if (role === 'service_role') {
      return Promise.resolve({
        auth: {
          admin: {
            inviteUserByEmail: mockAuthAdminInvite,
          },
        },
        rpc: mockInvitationRpc,
      });
    }

    return Promise.resolve({
      auth: { getUser: mockAuthGetUser },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                table === 'companies'
                  ? {
                      data: mockCompanyData,
                      error: mockCompanyData ? null : { code: 'PGRST116' },
                    }
                  : {
                      data: mockUserData,
                      error: mockUserData ? null : { code: 'PGRST116' },
                    },
              ),
          }),
        }),
      }),
    });
  }),
}));

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a'.repeat(64);

function createRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost:3000/api/invitations/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'new@example.com',
      role: 'member',
      companyId: COMPANY_ID,
      ...overrides,
    }),
  });
}

function successfulRpcResult(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    code: 'COMPANY_INVITATION_CREATED',
    created: true,
    invitationId: '33333333-3333-4333-8333-333333333333',
    companyId: COMPANY_ID,
    email: 'new@example.com',
    role: 'member',
    token: TOKEN,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: '2026-07-18T21:00:00.000Z',
    memberCount: 5,
    pendingCount: 3,
    ...overrides,
  };
}

describe('/api/invitations/create - atomic authorization and capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyData = { id: COMPANY_ID, admin_ids: [USER_ID] };
    mockUserData = { id: USER_ID, role: 'admin', company_id: COMPANY_ID };
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'auth-user-123' } },
      error: null,
    });
    mockInvitationRpc.mockResolvedValue({
      data: successfulRpcResult(),
      error: null,
    });
    mockAuthAdminInvite.mockResolvedValue({ data: { user: { id: 'invited' } }, error: null });
  });

  it('maps the atomic capacity rejection to USER_LIMIT_REACHED', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVITATION_CREATE_LIMIT_REACHED' },
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toMatchObject({
      error: 'USER_LIMIT_REACHED',
      limit: 10,
      remaining: 0,
    });
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });

  it('creates through the service-only RPC and returns authoritative remaining capacity', async () => {
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ success: true, limit: 10, remaining: 2 });
    expect(data.invitation.inviteUrl).toBe(`http://localhost:3000/join?token=${TOKEN}`);
    expect(mockInvitationRpc).toHaveBeenCalledWith('create_company_invitation', {
      p_actor_user_id: USER_ID,
      p_company_id: COMPANY_ID,
      p_email: 'new@example.com',
      p_role: 'member',
      p_token: TOKEN,
      p_expires_at: expect.any(String),
    });
  });

  it('returns only an opaque delivery failure when the Auth provider rejects email', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuthAdminInvite.mockResolvedValue({
      data: null,
      error: {
        message: 'provider account secret and recipient internals',
        status: 502,
      },
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.invitation).toMatchObject({
      emailSent: false,
      emailSendError: 'DELIVERY_FAILED',
    });
    expect(JSON.stringify(data)).not.toContain('provider account secret');
    expect(warning).toHaveBeenCalledWith(
      'Invitation email delivery failed',
      expect.objectContaining({ providerStatus: 502 }),
    );
    warning.mockRestore();
  });

  it('rejects an admin from another company during the fast preflight', async () => {
    mockCompanyData = { id: COMPANY_ID, admin_ids: [] };
    mockUserData = {
      id: USER_ID,
      role: 'admin',
      company_id: '44444444-4444-4444-8444-444444444444',
    };

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockInvitationRpc).not.toHaveBeenCalled();
  });

  it('rejects a current member from the authoritative RPC', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVITATION_CREATE_EXISTING_MEMBER' },
    });

    const response = await POST(createRequest({ email: 'member@example.com' }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('ALREADY_COMPANY_MEMBER');
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });

  it('rejects when admin rights are revoked after preflight but before the RPC lock', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVITATION_CREATE_FORBIDDEN' },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockInvitationRpc).toHaveBeenCalledOnce();
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });

  it('reuses an existing live invite without sending another email', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: successfulRpcResult({
        code: 'COMPANY_INVITATION_REUSED',
        created: false,
        memberCount: 6,
        pendingCount: 3,
      }),
      error: null,
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ success: true, remaining: 1 });
    expect(data.invitation.emailSent).toBe(false);
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC response identity does not match the request', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: successfulRpcResult({ companyId: '55555555-5555-4555-8555-555555555555' }),
      error: null,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });

  it('fails closed when created and code disagree in a partial RPC contract', async () => {
    mockInvitationRpc.mockResolvedValue({
      data: successfulRpcResult({
        code: 'COMPANY_INVITATION_REUSED',
        created: true,
      }),
      error: null,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(mockAuthAdminInvite).not.toHaveBeenCalled();
  });
});
