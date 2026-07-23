import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

const AUTH_USER_ID = '77777777-7777-4777-8777-777777777777';
const APP_USER_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_SESSION_ID = '88888888-8888-4888-8888-888888888888';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  findBySupabaseUid: vi.fn(),
  fenceMaybeSingle: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return { from: mocks.adminFrom };
    }

    return {
      auth: {
        getUser: mocks.getUser,
        getClaims: mocks.getClaims,
      },
    };
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return { findBySupabaseUid: mocks.findBySupabaseUid };
  },
}));

function verifiedUser(): User {
  return {
    id: APP_USER_ID,
    companyId: COMPANY_ID,
    supabase_uid: AUTH_USER_ID,
    email: 'presenter@example.com',
    displayName: 'Canonical Presenter',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-07-23T12:00:00.000Z',
    createdAt: '2026-07-23T12:00:00.000Z',
    currentSpaceId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: AUTH_USER_ID, session_id: AUTH_SESSION_ID } },
    error: null,
  });
  mocks.findBySupabaseUid.mockResolvedValue(verifiedUser());
  mocks.adminFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: mocks.fenceMaybeSingle }),
      }),
    }),
  });
  mocks.fenceMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe('requireVerifiedPresenceAuth', () => {
  it('carries the repository canonical display name in the verified identity snapshot', async () => {
    const result = await requireVerifiedPresenceAuth();

    expect(result).toMatchObject({
      ok: true,
      identity: {
        appUserId: APP_USER_ID,
        companyId: COMPANY_ID,
        authSessionId: AUTH_SESSION_ID,
        displayName: 'Canonical Presenter',
      },
    });
    expect(mocks.findBySupabaseUid).toHaveBeenCalledTimes(1);
    expect(mocks.findBySupabaseUid).toHaveBeenCalledWith(AUTH_USER_ID);
  });
});
