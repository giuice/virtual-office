import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { POST as uploadAvatar } from '@/app/api/users/avatar/route';
import { POST as removeAvatar } from '@/app/api/users/avatar/remove/route';

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';
const OLD_AVATAR_URL = 'https://project.supabase.co/storage/v1/object/public/user-uploads/avatars/old.png';
const NEW_AVATAR_URL = 'https://project.supabase.co/storage/v1/object/public/user-uploads/avatars/new.png';

const mocks = vi.hoisted(() => {
  const sharpPipeline = {
    metadata: vi.fn(),
    resize: vi.fn(),
    jpeg: vi.fn(),
    png: vi.fn(),
    webp: vi.fn(),
  };

  return {
    requireAuthUser: vi.fn(),
    avatarRepoUpdate: vi.fn(),
    removeRepoUpdate: vi.fn(),
    storageUpload: vi.fn(),
    storageRemove: vi.fn(),
    sharp: vi.fn(() => sharpPipeline),
    sharpPipeline,
    supabase: {},
  };
});

vi.mock('sharp', () => ({
  default: mocks.sharp,
}));

vi.mock('@/repositories/getSupabaseRepositories', () => ({
  getSupabaseRepositories: vi.fn(async () => ({
    userRepository: {
      update: (id: string, updates: Partial<User>) => mocks.avatarRepoUpdate(id, updates),
    },
  })),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      update: (id: string, updates: Partial<User>) => mocks.removeRepoUpdate(id, updates),
    };
  },
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mocks.requireAuthUser(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return {
        storage: {
          from: () => ({
            upload: (path: string, data: Uint8Array, options: object) => mocks.storageUpload(path, data, options),
            getPublicUrl: () => ({ data: { publicUrl: NEW_AVATAR_URL } }),
            remove: (paths: string[]) => mocks.storageRemove(paths),
          }),
        },
      };
    }

    return {};
  }),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: 'company-1',
    supabase_uid: AUTH_USER_ID,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    avatarUrl: OLD_AVATAR_URL,
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

function uploadRequest(file: File): Parameters<typeof uploadAvatar>[0] {
  const formData = new FormData();
  formData.append('avatar', file);
  return {
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Parameters<typeof uploadAvatar>[0];
}

function removeRequest(userId?: string): Parameters<typeof removeAvatar>[0] {
  return {
    json: vi.fn().mockResolvedValue(userId ? { userId } : {}),
  } as unknown as Parameters<typeof removeAvatar>[0];
}

describe('/api/users/avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: AUTH_USER_ID },
      dbUser: makeUser(),
    });
    mocks.avatarRepoUpdate.mockImplementation(async (id: string, updates: Partial<User>) => makeUser({ id, ...updates }));
    mocks.storageUpload.mockResolvedValue({ data: { path: 'avatars/new.png' }, error: null });
    mocks.storageRemove.mockResolvedValue({ error: null });
    mocks.sharpPipeline.metadata.mockResolvedValue({ width: 100, height: 100 });
    mocks.sharpPipeline.resize.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.jpeg.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
    mocks.sharpPipeline.png.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
    mocks.sharpPipeline.webp.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
    mocks.removeRepoUpdate.mockResolvedValue(makeUser({ avatarUrl: '' }));
  });

  it('returns the auth helper error when the request is not authenticated', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authenticated user profile not found' }, { status: 404 }),
    });

    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' })));

    expect(response.status).toBe(404);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it('removes the previous user-uploads object after a successful avatar upload', async () => {
    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' })));

    expect(response.status).toBe(200);
    expect(mocks.avatarRepoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: NEW_AVATAR_URL });
    expect(mocks.storageRemove).toHaveBeenCalledWith(['avatars/old.png']);
  });

  it('awaits avatar removal update and removes the old object from storage', async () => {
    const response = await removeAvatar(removeRequest(APP_USER_ID));

    expect(response.status).toBe(200);
    expect(mocks.removeRepoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: '' });
    expect(mocks.storageRemove).toHaveBeenCalledWith(['avatars/old.png']);
  });

  it('removes the avatar of the authenticated user when no userId is sent', async () => {
    const response = await removeAvatar(removeRequest());

    expect(response.status).toBe(200);
    expect(mocks.removeRepoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: '' });
  });

  it('rejects avatar removal targeting another user', async () => {
    const response = await removeAvatar(removeRequest('someone-else'));

    expect(response.status).toBe(403);
    expect(mocks.removeRepoUpdate).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });
});
