import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/invitations/accept/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  invitationMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.invitationMaybeSingle() }),
      }),
    }),
    rpc: mocks.rpc,
  })),
}));

function requestFor(body: unknown): Request {
  return new Request('https://example.test/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/invitations/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      authUser: { id: 'auth-user' },
      dbUser: { id: USER_ID, companyId: null, role: 'member' },
      supabase: {},
    });
    mocks.invitationMaybeSingle.mockResolvedValue({
      data: { id: INVITATION_ID, company_id: COMPANY_ID },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_INVITATION_ACCEPTED',
        userId: USER_ID,
        invitationId: INVITATION_ID,
        companyId: COMPANY_ID,
        role: 'member',
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

  it('returns 401 without reading the invitation when auth fails', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authentication required' }, { status: 401 }),
    });

    const response = await POST(requestFor({ token: 'token' }));

    expect(response.status).toBe(401);
    expect(mocks.invitationMaybeSingle).not.toHaveBeenCalled();
  });

  it('accepts membership and invitation status through one locked RPC', async () => {
    const response = await POST(
      requestFor({ token: 'token', displayName: 'Ada Lovelace' }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'accept_company_invitation_membership',
      {
        p_user_id: USER_ID,
        p_invitation_id: INVITATION_ID,
        p_company_id: COMPANY_ID,
        p_display_name: 'Ada Lovelace',
      },
    );
    expect(await response.json()).toMatchObject({
      success: true,
      code: 'COMPANY_INVITATION_ACCEPTED',
    });
  });

  it('returns 404 when the token lookup has no row', async () => {
    mocks.invitationMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(requestFor({ token: 'missing' }));

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the invitation lookup omits its company identity', async () => {
    mocks.invitationMaybeSingle.mockResolvedValue({
      data: { id: INVITATION_ID },
      error: null,
    });

    const response = await POST(requestFor({ token: 'token' }));

    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps the database email/status/expiry recheck as forbidden', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVITATION_ACCEPT_FORBIDDEN' },
    });

    const response = await POST(requestFor({ token: 'token' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'INVITATION_FORBIDDEN' });
  });

  it('maps the locked member-capacity rejection', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'INVITATION_ACCEPT_LIMIT_REACHED' },
    });

    const response = await POST(requestFor({ token: 'token' }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('USER_LIMIT_REACHED');
  });

  it('fails closed on a mismatched RPC identity', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'COMPANY_INVITATION_ACCEPTED',
        userId: USER_ID,
        invitationId: INVITATION_ID,
        companyId: INVITATION_ID,
      },
      error: null,
    });

    const response = await POST(requestFor({ token: 'token' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
