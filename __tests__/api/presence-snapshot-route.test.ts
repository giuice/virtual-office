import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/presence/snapshot/route';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_SESSION_ID = '77777777-7777-4777-8777-777777777777';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

function primeAuth(): void {
  mocks.requireVerifiedPresenceAuth.mockResolvedValue({
    ok: true,
    identity: {
      appUserId: APP_USER_ID,
      companyId: COMPANY_ID,
      authSessionId: AUTH_SESSION_ID,
    },
    admin: {
      rpc: (name: string, args: Record<string, unknown>) => mocks.rpc(name, args),
    },
    supabase: {},
  });
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverTime: '2026-07-11T12:00:00.000Z',
    companyId: COMPANY_ID,
    viewerUserId: APP_USER_ID,
    currentUser: { initialPlacementCompletedAt: null },
    users: [],
    ...overrides,
  };
}

async function expectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('/api/presence/snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mocks.rpc.mockResolvedValue({ data: snapshot(), error: null });
  });

  it('returns the snapshot JSON as-is after identity verification', async () => {
    const response = await GET();
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual(snapshot());
    expect(mocks.rpc).toHaveBeenCalledWith('get_company_presence_snapshot', {
      p_viewer_user_id: APP_USER_ID,
    });
  });

  it('returns 401 when the verified auth session is fenced', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'AUTH_SESSION_REVOKED',
      error: 'Authentication session revoked',
    });

    const response = await GET();
    const data = await expectJson(response);

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      success: false,
      code: 'AUTH_SESSION_REVOKED',
      retryable: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 500 when returned companyId does not match the verified identity', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValueOnce({
      data: snapshot({ companyId: '44444444-4444-4444-8444-444444444444' }),
      error: null,
    });

    try {
      const response = await GET();
      const data = await expectJson(response);

      expect(response.status).toBe(500);
      expect(data).toMatchObject({
        success: false,
        code: 'INTERNAL_ERROR',
        retryable: true,
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it.each([
    ['PRESENCE_SNAPSHOT_TOO_LARGE', 503, false],
    ['PRESENCE_VIEWER_NO_COMPANY', 409, false],
  ])('maps typed snapshot error %s', async (code, status, retryable) => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: code },
    });

    try {
      const response = await GET();
      const data = await expectJson(response);

      expect(response.status).toBe(status);
      expect(data).toMatchObject({
        success: false,
        code,
        retryable,
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
