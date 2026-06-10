import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { requireAuthUser, validateUserSession } from '@/lib/auth/session';

// vitest.setup.ts mocks '@/lib/auth/session' globally; this suite tests the real module.
vi.unmock('@/lib/auth/session');

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  usersSingle: vi.fn(),
  findBySupabaseUid: vi.fn(),
}));

// The mocked client intentionally has NO getSession: if the implementation
// regresses to session-based auth, these tests fail.
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: () => mocks.getUser(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mocks.usersSingle(),
        }),
      }),
    }),
  })),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mocks.findBySupabaseUid(uid),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: 'company-1',
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  mocks.usersSingle.mockResolvedValue({ data: { id: APP_USER_ID }, error: null });
  mocks.findBySupabaseUid.mockResolvedValue(makeUser());
});

describe('validateUserSession', () => {
  it('returns both ids when the auth server validates the user', async () => {
    const result = await validateUserSession();

    expect(result).toEqual({ supabaseUid: AUTH_USER_ID, userDbId: APP_USER_ID });
  });

  it('returns an error when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await validateUserSession();

    expect(result.error).toBe('No active session');
    expect(result.userDbId).toBeUndefined();
  });
});

describe('requireAuthUser', () => {
  it('returns a 401 errorResponse when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(401);
    }
    expect(mocks.findBySupabaseUid).not.toHaveBeenCalled();
  });

  it('returns a 404 errorResponse when the authenticated user has no app profile', async () => {
    mocks.findBySupabaseUid.mockResolvedValue(null);

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(404);
    }
  });

  it('returns a 500 errorResponse instead of throwing when the profile lookup fails', async () => {
    mocks.findBySupabaseUid.mockRejectedValue(new Error('connection reset'));

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(500);
    }
  });

  it('returns the auth context when the user is authenticated and has a profile', async () => {
    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(false);
    if (!('errorResponse' in result)) {
      expect(result.dbUser.id).toBe(APP_USER_ID);
      expect(result.authUser.id).toBe(AUTH_USER_ID);
      expect(mocks.findBySupabaseUid).toHaveBeenCalledWith(AUTH_USER_ID);
    }
  });
});
