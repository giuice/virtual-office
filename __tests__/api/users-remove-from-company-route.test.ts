import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/users/remove-from-company/route';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: (role: unknown) =>
    mocks.createSupabaseServerClient(role),
}));

function requestFor(body: unknown): Request {
  return new Request('https://example.test/api/users/remove-from-company', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function successResult() {
  return {
    ok: true,
    code: 'COMPANY_MEMBER_REMOVED',
    actorUserId: ACTOR_ID,
    targetUserId: TARGET_ID,
    companyId: COMPANY_ID,
    previousSpaceId: null,
    locationVersion: 9,
    presenceAccessRevision: 4,
    retiredSessionCount: 2,
    closedLogCount: 1,
    invalidatedInvitationCount: 1,
    removedAdminReference: false,
    operationTime: '2026-07-18T21:30:00.000Z',
  };
}

describe('/api/users/remove-from-company', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      authUser: { id: 'auth-uid' },
      dbUser: {
        id: ACTOR_ID,
        companyId: COMPANY_ID,
        role: 'admin',
      },
      supabase: {},
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: successResult(), error: null });
  });

  it('derives actor and company server-side and calls only the atomic RPC', async () => {
    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(200);
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledWith('service_role');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'remove_company_member_and_presence',
      {
        p_actor_user_id: ACTOR_ID,
        p_target_user_id: TARGET_ID,
        p_company_id: COMPANY_ID,
      },
    );
    expect(await response.json()).toMatchObject({
      code: 'COMPANY_MEMBER_REMOVED',
      result: { targetUserId: TARGET_ID },
    });
  });

  it('rejects a client-supplied company instead of trusting it', async () => {
    const response = await POST(
      requestFor({ userId: TARGET_ID, companyId: COMPANY_ID }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.requireAuthUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not construct the service client after authentication failure', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json(
        { message: 'Authentication required' },
        { status: 401 },
      ),
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a non-admin before constructing the service client', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      authUser: { id: 'auth-uid' },
      dbUser: {
        id: ACTOR_ID,
        companyId: COMPANY_ID,
        role: 'member',
      },
      supabase: {},
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'Only an admin of this company can remove members',
      code: 'COMPANY_REMOVAL_FORBIDDEN',
    });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    'COMPANY_REMOVAL_TARGET_NOT_FOUND',
    'COMPANY_REMOVAL_TARGET_OUTSIDE_COMPANY',
  ])('collapses %s into the same public denial', async (databaseCode) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: databaseCode },
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'Member removal is not allowed',
      code: 'COMPANY_REMOVAL_FORBIDDEN',
    });
  });

  it('maps the database-enforced self-removal denial', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'COMPANY_REMOVAL_SELF_FORBIDDEN',
      },
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'You cannot remove yourself from the company',
      code: 'COMPANY_REMOVAL_SELF_FORBIDDEN',
    });
  });

  it('fails closed when the RPC result identity does not match the request', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...successResult(), companyId: TARGET_ID },
      error: null,
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('fails closed when the RPC result omits an authoritative count', async () => {
    const partial: Record<string, unknown> = { ...successResult() };
    delete partial.invalidatedInvitationCount;
    mocks.rpc.mockResolvedValue({ data: partial, error: null });

    const response = await POST(requestFor({ userId: TARGET_ID }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('never serializes unexpected database details', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'XX000',
        message: 'sensitive database detail',
        details: 'private row data',
      },
    });

    const response = await POST(requestFor({ userId: TARGET_ID }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).not.toContain('sensitive database detail');
    expect(body).not.toContain('private row data');
  });
});
