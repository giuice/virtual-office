// __tests__/api/invitations-accept.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/invitations/accept/route';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Setup mock objects that will be used in the mock implementations
const mockInvitationRepoMethods = {
  findByToken: vi.fn(),
  updateStatus: vi.fn(),
};

const mockUserRepoMethods = {
  findBySupabaseUid: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
};

const mockAuthGetUser = vi.fn();
const mockFromSelect = vi.fn();

// Mock Supabase server client
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockAuthGetUser(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockFromSelect(),
        }),
      }),
    }),
  }),
}));

// Mock repositories with actual class constructors
vi.mock('@/repositories/implementations/supabase', () => {
  // Create mock class constructors
  function MockInvitationRepository() {
    return {
      findByToken: (token: string) => mockInvitationRepoMethods.findByToken(token),
      updateStatus: (token: string, status: string) => mockInvitationRepoMethods.updateStatus(token, status),
    };
  }
  
  function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockUserRepoMethods.findBySupabaseUid(uid),
      update: (id: string, data: object) => mockUserRepoMethods.update(id, data),
      create: (data: object) => mockUserRepoMethods.create(data),
    };
  }

  return {
    SupabaseInvitationRepository: MockInvitationRepository,
    SupabaseUserRepository: MockUserRepository,
  };
});

describe('/api/invitations/accept', () => {
  beforeEach(() => {
    // Reset all mock implementations
    mockInvitationRepoMethods.findByToken.mockReset();
    mockInvitationRepoMethods.updateStatus.mockReset();
    mockUserRepoMethods.findBySupabaseUid.mockReset();
    mockUserRepoMethods.update.mockReset();
    mockUserRepoMethods.create.mockReset();
    mockAuthGetUser.mockReset();
    mockFromSelect.mockReset();
  });

  // Use mock object pattern instead of new NextRequest
  const createRequest = (body: object) => {
    return {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    } as any;
  };

  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const request = createRequest({ token: 'test-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Autenticação necessária');
  });

  it('returns 400 when token is missing', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const request = createRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Token de convite é obrigatório');
  });

  it('returns 404 when invitation not found', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue(null);

    const request = createRequest({ token: 'nonexistent-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Convite não encontrado');
  });

  it('returns 400 when invitation is already used', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'used-token',
      status: 'accepted',
      companyId: 'company-1',
      email: 'test@example.com',
      expiresAt: Date.now() + 86400000,
    });

    const request = createRequest({ token: 'used-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('já utilizado ou expirado');
  });

  it('returns 410 when invitation is expired', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'expired-token',
      status: 'pending',
      companyId: 'company-1',
      email: 'test@example.com',
      expiresAt: Date.now() - 86400000, // Past date
    });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({});

    const request = createRequest({ token: 'expired-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toContain('expirado');
    expect(mockInvitationRepoMethods.updateStatus).toHaveBeenCalledWith('expired-token', 'expired');
  });

  it('returns 403 when invitation email does not match authenticated user email (Security)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'different@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-1',
      email: 'invited@example.com', // Different email
      expiresAt: Date.now() + 86400000,
    });

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('convite foi enviado para outro email');
  });

  it('accepts invitation with case-insensitive email match', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'Test@Example.COM' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-1',
      role: 'member',
      email: 'test@example.com', // Same email, different case
      expiresAt: Date.now() + 86400000,
    });
    mockUserRepoMethods.findBySupabaseUid.mockResolvedValue({
      id: 'db-user-1',
      companyId: null,
      email: 'test@example.com',
    });
    mockUserRepoMethods.update.mockResolvedValue({
      id: 'db-user-1',
      companyId: 'company-1',
      email: 'test@example.com',
    });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({});

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 409 when user already belongs to another company (AC6)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-new',
      email: 'test@example.com',
      expiresAt: Date.now() + 86400000,
    });
    mockUserRepoMethods.findBySupabaseUid.mockResolvedValue({
      id: 'db-user-1',
      companyId: 'company-existing', // Different company
      email: 'test@example.com',
    });
    mockFromSelect.mockResolvedValue({
      data: { name: 'Existing Company' },
      error: null,
    });

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('já pertence a outra empresa');
    expect(data.companyName).toBe('Existing Company');
  });

  it('successfully accepts invitation for user without company', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-1',
      role: 'member',
      email: 'test@example.com',
      expiresAt: Date.now() + 86400000,
    });
    mockUserRepoMethods.findBySupabaseUid.mockResolvedValue({
      id: 'db-user-1',
      companyId: null, // No company yet
      email: 'test@example.com',
    });
    mockUserRepoMethods.update.mockResolvedValue({
      id: 'db-user-1',
      companyId: 'company-1',
      email: 'test@example.com',
    });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({});

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.redirect).toBe('/dashboard');
    expect(mockUserRepoMethods.update).toHaveBeenCalledWith('db-user-1', {
      companyId: 'company-1',
      role: 'member',
    });
    expect(mockInvitationRepoMethods.updateStatus).toHaveBeenCalledWith('valid-token', 'accepted');
  });

  it('successfully accepts invitation when user already in same company', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-1',
      role: 'member',
      email: 'test@example.com',
      expiresAt: Date.now() + 86400000,
    });
    mockUserRepoMethods.findBySupabaseUid.mockResolvedValue({
      id: 'db-user-1',
      companyId: 'company-1', // Same company
      email: 'test@example.com',
    });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({});

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Should not call update since user already in same company
    expect(mockUserRepoMethods.update).not.toHaveBeenCalled();
    expect(mockInvitationRepoMethods.updateStatus).toHaveBeenCalledWith('valid-token', 'accepted');
  });

  it('handles user created by trigger (AC7)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    mockInvitationRepoMethods.findByToken.mockResolvedValue({
      token: 'valid-token',
      status: 'pending',
      companyId: 'company-1',
      role: 'member',
      email: 'test@example.com',
      expiresAt: Date.now() + 86400000,
    });
    // First call returns null (user not created yet)
    // Second call returns user (created by trigger)
    mockUserRepoMethods.findBySupabaseUid
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'db-user-1',
        companyId: null,
        email: 'test@example.com',
      });
    mockUserRepoMethods.update.mockResolvedValue({
      id: 'db-user-1',
      companyId: 'company-1',
      email: 'test@example.com',
    });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({});

    const request = createRequest({ token: 'valid-token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUserRepoMethods.findBySupabaseUid).toHaveBeenCalledTimes(2);
  });
});
