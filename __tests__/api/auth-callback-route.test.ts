import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/callback/route';

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL | string) => new Response(null, {
      status: 307,
      headers: { Location: String(url) },
    }),
  },
}));

const mocks = vi.hoisted(() => {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const sessionClient = {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => profileQuery),
  };
  const adminClient = { role: 'service_role' };

  return {
    profileQuery,
    sessionClient,
    adminClient,
    repositoryClients: [] as unknown[],
    avatarRepositories: [] as unknown[],
    extractAndStore: vi.fn(),
    createServerClient: vi.fn(),
  };
});

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: (role?: 'service_role') => mocks.createServerClient(role),
}));

vi.mock('@/repositories/implementations/supabase/SupabaseUserRepository', () => ({
  SupabaseUserRepository: function MockUserRepository(client: unknown) {
    const repository = { client };
    mocks.repositoryClients.push(client);
    return repository;
  },
}));

vi.mock('@/lib/services/google-avatar-service', () => ({
  GoogleAvatarService: function MockGoogleAvatarService(repository: unknown) {
    mocks.avatarRepositories.push(repository);
    return { extractAndStoreGoogleAvatar: mocks.extractAndStore };
  },
}));

function request(): NextRequest {
  return new Request('https://example.com/api/auth/callback?code=oauth-code') as NextRequest;
}

describe('/api/auth/callback OAuth avatar writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repositoryClients.splice(0);
    mocks.avatarRepositories.splice(0);
    mocks.createServerClient.mockImplementation(async (role?: 'service_role') =>
      role === 'service_role' ? mocks.adminClient : mocks.sessionClient
    );
    mocks.sessionClient.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.profileQuery.maybeSingle.mockResolvedValue({
      data: { company_id: '33333333-3333-4333-8333-333333333333' },
      error: null,
    });
    mocks.extractAndStore.mockResolvedValue({ success: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('uses verified Auth identity and a service-role repository for Google avatar sync', async () => {
    mocks.sessionClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          app_metadata: { provider: 'google' },
          user_metadata: { picture: 'https://lh3.googleusercontent.com/a/avatar' },
        },
      },
      error: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mocks.repositoryClients).toEqual([mocks.adminClient]);
    expect(mocks.extractAndStore).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { picture: 'https://lh3.googleusercontent.com/a/avatar' },
    );
  });

  it('does not create a privileged avatar writer for non-Google login', async () => {
    mocks.sessionClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          app_metadata: { provider: 'email' },
          user_metadata: {},
        },
      },
      error: null,
    });

    await GET(request());

    expect(mocks.repositoryClients).toEqual([]);
    expect(mocks.extractAndStore).not.toHaveBeenCalled();
  });
});
