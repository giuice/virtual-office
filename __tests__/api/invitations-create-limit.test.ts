// __tests__/api/invitations-create-limit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/invitations/create/route';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue('localhost:3000'),
  }),
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Mock crypto for token generation
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('mock-token-abc123'),
    }),
  },
}));

// Setup mock objects
const mockInvitationRepoCreate = vi.fn();
const mockAuthGetUser = vi.fn();
const mockAuthAdminInvite = vi.fn();

// Mock data store for flexible responses
let mockCompanyData: any = null;
let mockUserData: any = null;
let mockUserCount: number = 0;
let mockPendingCount: number = 0;
let mockExistingInvite: any = null;

// Mock Supabase server client
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn().mockImplementation((role?: string) => {
    if (role === 'service_role') {
      return Promise.resolve({
        auth: {
          admin: {
            inviteUserByEmail: (email: string, options: any) => mockAuthAdminInvite(email, options),
          },
        },
      });
    }
    return Promise.resolve({
      auth: {
        getUser: () => mockAuthGetUser(),
      },
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: (_columns: string, options?: { count?: string; head?: boolean }) => {
              if (options?.count === 'exact' && options?.head === true) {
                return {
                  eq: () => Promise.resolve({ count: mockUserCount, error: null }),
                };
              }

              return {
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockUserData,
                    error: mockUserData ? null : { code: 'PGRST116' },
                  }),
                }),
              };
            },
          };
        }

        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockCompanyData,
                  error: mockCompanyData ? null : { code: 'PGRST116' },
                }),
              }),
            }),
          };
        }

        if (table === 'invitations') {
          return {
            update: () => ({
              eq: () => ({
                eq: () => ({
                  lte: () => Promise.resolve({ error: null }),
                }),
              }),
            }),
            select: (_columns: string, options?: { count?: string; head?: boolean }) => {
              if (options?.count === 'exact' && options?.head === true) {
                return {
                  eq: () => ({
                    eq: () => ({
                      gt: () => Promise.resolve({ count: mockPendingCount, error: null }),
                    }),
                  }),
                };
              }

              return {
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      gt: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: () => Promise.resolve({
                              data: mockExistingInvite,
                              error: null,
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }

        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    });
  }),
}));

// Mock repository
vi.mock('@/repositories/implementations/supabase', () => {
  function MockInvitationRepository() {
    return {
      create: (data: any) => mockInvitationRepoCreate(data),
    };
  }
  return {
    SupabaseInvitationRepository: MockInvitationRepository,
  };
});

describe('/api/invitations/create - User Limit (AC4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitationRepoCreate.mockReset();
    mockAuthGetUser.mockReset();
    mockAuthAdminInvite.mockReset();
    mockCompanyData = null;
    mockUserData = null;
    mockUserCount = 0;
    mockPendingCount = 0;
    mockExistingInvite = null;
  });

  const createRequest = (body: object) => {
    return {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    } as any;
  };

  it('returns 403 with USER_LIMIT_REACHED when total users >= 10 (AC4)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockCompanyData = { id: 'company-1', admin_ids: ['db-user-1'] };
    mockUserData = { id: 'db-user-1', role: 'admin' };
    mockUserCount = 8;
    mockPendingCount = 2; // total = 10

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('USER_LIMIT_REACHED');
    expect(data.message).toContain('10 usuários');
    expect(data.limit).toBe(10);
    expect(data.current).toBe(10);
    expect(data.remaining).toBe(0);
  });

  it('returns 403 when users + pending > 10', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockCompanyData = { id: 'company-1', admin_ids: ['db-user-1'] };
    mockUserData = { id: 'db-user-1', role: 'admin' };
    mockUserCount = 7;
    mockPendingCount = 4; // total = 11

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('USER_LIMIT_REACHED');
  });

  it('returns 403 when admin belongs to another company and is not in admin_ids', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockCompanyData = { id: 'company-1', admin_ids: ['another-admin-id'] };
    mockUserData = { id: 'db-user-1', role: 'admin', company_id: 'company-2' };

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('administradores');
  });

  it('allows invitation when total < 10', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockCompanyData = { id: 'company-1', admin_ids: ['db-user-1'] };
    mockUserData = { id: 'db-user-1', role: 'admin' };
    mockUserCount = 5;
    mockPendingCount = 2; // total = 7
    
    mockAuthAdminInvite.mockResolvedValue({
      data: { user: { id: 'invited-user' } },
      error: null,
    });
    
    mockInvitationRepoCreate.mockResolvedValue({
      id: 'inv-1',
      email: 'new@example.com',
      token: 'mock-token-abc123',
    });

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.remaining).toBe(2); // 10 - 7 - 1 = 2
    expect(data.limit).toBe(10);
  });

  it('returns inviteUrl in successful response (AC6)', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockCompanyData = { id: 'company-1', admin_ids: ['db-user-1'] };
    mockUserData = { id: 'db-user-1', role: 'admin' };
    mockUserCount = 3;
    mockPendingCount = 1; // total = 4
    
    mockAuthAdminInvite.mockResolvedValue({
      data: { user: { id: 'invited-user' } },
      error: null,
    });
    
    mockInvitationRepoCreate.mockResolvedValue({
      id: 'inv-1',
      email: 'new@example.com',
      token: 'mock-token-abc123',
    });

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.invitation.inviteUrl).toContain('/join?token=');
    expect(data.invitation.inviteUrl).toContain('mock-token-abc123');
  });

  it('handles edge case: exactly 9 total allows one more', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockCompanyData = { id: 'company-1', admin_ids: ['db-user-1'] };
    mockUserData = { id: 'db-user-1', role: 'admin' };
    mockUserCount = 6;
    mockPendingCount = 3; // total = 9
    
    mockAuthAdminInvite.mockResolvedValue({
      data: { user: { id: 'invited-user' } },
      error: null,
    });
    
    mockInvitationRepoCreate.mockResolvedValue({
      id: 'inv-1',
      email: 'new@example.com',
      token: 'mock-token-abc123',
    });

    const request = createRequest({
      email: 'new@example.com',
      role: 'member',
      companyId: 'company-1',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.remaining).toBe(0); // 10 - 9 - 1 = 0
  });
});
