import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { POST as uploadAvatar } from '@/app/api/users/avatar/route';
import { POST as removeAvatar } from '@/app/api/users/avatar/remove/route';

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
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
    repoUpdate: vi.fn(),
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

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      update: (id: string, updates: Partial<User>) => mocks.repoUpdate(id, updates),
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
    mocks.repoUpdate.mockImplementation(async (id: string, updates: Partial<User>) => makeUser({ id, ...updates }));
    mocks.storageUpload.mockResolvedValue({ data: { path: 'avatars/new.png' }, error: null });
    mocks.storageRemove.mockResolvedValue({ error: null });
    mocks.sharpPipeline.metadata.mockResolvedValue({ width: 100, height: 100 });
    mocks.sharpPipeline.resize.mockReturnValue(mocks.sharpPipeline);
    mocks.sharpPipeline.jpeg.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
    mocks.sharpPipeline.png.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
    mocks.sharpPipeline.webp.mockReturnValue({ toBuffer: vi.fn(async () => new Uint8Array([1])) });
  });

  it('returns the auth helper error when the request is not authenticated', async () => {
    mocks.requireAuthUser.mockResolvedValue({
      errorResponse: Response.json({ error: 'Authenticated user profile not found' }, { status: 404 }),
    });

    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' })));

    expect(response.status).toBe(404);
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it('rejects avatar uploads with non-allowlisted image MIME types', async () => {
    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.svg', { type: 'image/svg+xml' })));

    expect(response.status).toBe(400);
    expect(mocks.sharp).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it('rejects avatar uploads when image processing fails', async () => {
    const processingError = new Error('invalid image');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.sharpPipeline.metadata.mockRejectedValue(processingError);

    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid image file' });
    expect(mocks.storageUpload).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('uploads processed avatars with content type and extension from the output format', async () => {
    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.jpg', { type: 'image/webp' })));

    expect(response.status).toBe(200);
    expect(mocks.storageUpload).toHaveBeenCalledOnce();

    const [path, , options] = mocks.storageUpload.mock.calls[0];
    expect(path).toMatch(/^avatars\/avatar-11111111-1111-4111-8111-111111111111-\d+\.webp$/);
    expect(options).toMatchObject({
      contentType: 'image/webp',
      upsert: true,
    });
  });

  it('removes the previous user-uploads object after a successful avatar upload', async () => {
    const response = await uploadAvatar(uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' })));

    expect(response.status).toBe(200);
    expect(mocks.repoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: NEW_AVATAR_URL });
    expect(mocks.storageRemove).toHaveBeenCalledWith(['avatars/old.png']);
  });

  it('removes the newly uploaded object when the profile update throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.repoUpdate.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await uploadAvatar(
      uploadRequest(new File(['avatar'], 'avatar.png', { type: 'image/png' }))
    );

    expect(response.status).toBe(500);
    expect(mocks.storageRemove).toHaveBeenCalledWith([
      expect.stringMatching(/^avatars\/avatar-11111111-1111-4111-8111-111111111111-\d+\.png$/),
    ]);
  });

  it('awaits avatar removal update and removes the old object from storage', async () => {
    const response = await removeAvatar(removeRequest(APP_USER_ID));

    expect(response.status).toBe(200);
    expect(mocks.repoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: null });
    expect(mocks.storageRemove).toHaveBeenCalledWith(['avatars/old.png']);
  });

  it('removes the avatar of the authenticated user when no userId is sent', async () => {
    const response = await removeAvatar(removeRequest());

    expect(response.status).toBe(200);
    expect(mocks.repoUpdate).toHaveBeenCalledWith(APP_USER_ID, { avatarUrl: null });
  });

  it('rejects avatar removal targeting another user', async () => {
    const response = await removeAvatar(removeRequest('22222222-2222-4222-8222-222222222222'));

    expect(response.status).toBe(403);
    expect(mocks.repoUpdate).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });
});
