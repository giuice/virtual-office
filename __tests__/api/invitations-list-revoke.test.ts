// __tests__/api/invitations-list-revoke.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/invitations/list/route';
import { POST as RevokePost } from '@/app/api/invitations/revoke/route';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue('localhost:3000'),
  }),
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Setup mock objects
const mockInvitationRepoMethods = {
  findByCompanyId: vi.fn(),
  updateStatus: vi.fn(),
};

const mockAuthGetUser = vi.fn();
const mockFromSelectSingle = vi.fn();
const mockFromSelectCount = vi.fn();

// Mock Supabase server client
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockAuthGetUser(),
    },
    from: (table: string) => ({
      select: (columns: string, options?: { count?: string; head?: boolean }) => {
        if (options?.count === 'exact' && options?.head === true) {
          return {
            eq: () => mockFromSelectCount(),
          };
        }
        return {
          eq: (col: string, val: string) => {
            if (table === 'invitations' && col === 'id') {
              return {
                single: () => mockFromSelectSingle(),
              };
            }
            return {
              single: () => mockFromSelectSingle(),
            };
          },
        };
      },
    }),
  }),
}));

// Mock repository
vi.mock('@/repositories/implementations/supabase', () => {
  function MockInvitationRepository() {
    return {
      findByCompanyId: (companyId: string) => mockInvitationRepoMethods.findByCompanyId(companyId),
      updateStatus: (token: string, status: string) => mockInvitationRepoMethods.updateStatus(token, status),
    };
  }
  return {
    SupabaseInvitationRepository: MockInvitationRepository,
  };
});

describe('/api/invitations/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitationRepoMethods.findByCompanyId.mockReset();
    mockAuthGetUser.mockReset();
    mockFromSelectSingle.mockReset();
    mockFromSelectCount.mockReset();
  });

  const createListRequest = (params: Record<string, string> = {}) => {
    const searchParams = new URLSearchParams(params);
    return {
      method: 'GET',
      url: `http://localhost:3000/api/invitations/list?${searchParams}`,
    } as any;
  };

  it('returns 400 when companyId is missing', async () => {
    const request = createListRequest({});
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('companyId is required');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const request = createListRequest({ companyId: 'company-1' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('não autenticado');
  });

  it('returns 403 when user is not admin', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValue({
      data: { id: 'db-user-1', role: 'member', company_id: 'company-1' },
      error: null,
    });

    const request = createListRequest({ companyId: 'company-1' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('administradores');
  });

  it('returns 403 when user belongs to different company', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValue({
      data: { id: 'db-user-1', role: 'admin', company_id: 'other-company' },
      error: null,
    });

    const request = createListRequest({ companyId: 'company-1' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('negado');
  });

  it('returns list of invitations with inviteUrl (AC7)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValue({
      data: { id: 'db-user-1', role: 'admin', company_id: 'company-1' },
      error: null,
    });
    mockInvitationRepoMethods.findByCompanyId.mockResolvedValue([
      { id: 'inv-1', email: 'test1@example.com', status: 'pending', token: 'token-1', createdAt: '2025-11-28T10:00:00Z' },
      { id: 'inv-2', email: 'test2@example.com', status: 'accepted', token: 'token-2', createdAt: '2025-11-27T10:00:00Z' },
    ]);
    mockFromSelectCount.mockResolvedValue({ count: 5, error: null });

    const request = createListRequest({ companyId: 'company-1' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toHaveLength(2);
    expect(data.invitations[0].inviteUrl).toContain('/join?token=token-1');
    expect(data.invitations[1].inviteUrl).toContain('/join?token=token-2');
  });

  it('filters by status when provided', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValue({
      data: { id: 'db-user-1', role: 'admin', company_id: 'company-1' },
      error: null,
    });
    mockInvitationRepoMethods.findByCompanyId.mockResolvedValue([
      { id: 'inv-1', email: 'test1@example.com', status: 'pending', token: 'token-1' },
      { id: 'inv-2', email: 'test2@example.com', status: 'accepted', token: 'token-2' },
      { id: 'inv-3', email: 'test3@example.com', status: 'pending', token: 'token-3' },
    ]);
    mockFromSelectCount.mockResolvedValue({ count: 3, error: null });

    const request = createListRequest({ companyId: 'company-1', status: 'pending' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toHaveLength(2);
    expect(data.invitations.every((inv: any) => inv.status === 'pending')).toBe(true);
  });

  it('returns user limit info (AC4)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValue({
      data: { id: 'db-user-1', role: 'admin', company_id: 'company-1' },
      error: null,
    });
    mockInvitationRepoMethods.findByCompanyId.mockResolvedValue([
      { id: 'inv-1', email: 'test1@example.com', status: 'pending', token: 'token-1' },
    ]);
    mockFromSelectCount.mockResolvedValue({ count: 5, error: null });

    const request = createListRequest({ companyId: 'company-1' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.limit).toBe(10);
    expect(data.userCount).toBe(5);
    expect(data.pendingCount).toBe(1);
    expect(data.remaining).toBe(4); // 10 - 5 - 1 = 4
  });
});

describe('/api/invitations/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitationRepoMethods.updateStatus.mockReset();
    mockAuthGetUser.mockReset();
    mockFromSelectSingle.mockReset();
  });

  const createRevokeRequest = (body: object) => {
    return {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    } as any;
  };

  it('returns 400 when invitationId is missing', async () => {
    const request = createRevokeRequest({});
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('invitationId is required');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const request = createRevokeRequest({ invitationId: 'inv-1' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('não autenticado');
  });

  it('returns 404 when invitation not found', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116' },
    });

    const request = createRevokeRequest({ invitationId: 'nonexistent' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('não encontrado');
  });

  it('returns 400 when invitation is already processed (AC8)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle.mockResolvedValueOnce({
      data: { id: 'inv-1', token: 'token-1', company_id: 'company-1', status: 'accepted' },
      error: null,
    });

    const request = createRevokeRequest({ invitationId: 'inv-1' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('já foi processado');
  });

  it('returns 403 when user is not admin (AC8)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle
      .mockResolvedValueOnce({
        data: { id: 'inv-1', token: 'token-1', company_id: 'company-1', status: 'pending' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'db-user-1', role: 'member', company_id: 'company-1' },
        error: null,
      });

    const request = createRevokeRequest({ invitationId: 'inv-1' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('administradores');
  });

  it('returns 403 when user belongs to different company', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle
      .mockResolvedValueOnce({
        data: { id: 'inv-1', token: 'token-1', company_id: 'company-1', status: 'pending' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'db-user-1', role: 'admin', company_id: 'other-company' },
        error: null,
      });

    const request = createRevokeRequest({ invitationId: 'inv-1' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('negado');
  });

  it('successfully revokes pending invitation (AC8)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockFromSelectSingle
      .mockResolvedValueOnce({
        data: { id: 'inv-1', token: 'token-1', company_id: 'company-1', status: 'pending' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'db-user-1', role: 'admin', company_id: 'company-1' },
        error: null,
      });
    mockInvitationRepoMethods.updateStatus.mockResolvedValue({
      id: 'inv-1',
      email: 'test@example.com',
      status: 'expired',
    });

    const request = createRevokeRequest({ invitationId: 'inv-1' });
    const response = await RevokePost(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('revogado com sucesso');
    expect(data.invitation.status).toBe('expired');
    expect(mockInvitationRepoMethods.updateStatus).toHaveBeenCalledWith('token-1', 'expired');
  });
});
