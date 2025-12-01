// __tests__/api/invitations-validate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, ValidateInvitationResponse } from '@/app/api/invitations/validate/route';

// Mock Supabase server client
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

import { createSupabaseServerClient } from '@/lib/supabase/server-client';

describe('/api/invitations/validate', () => {
  const mockSupabase = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createSupabaseServerClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Use mock object pattern instead of new NextRequest
  const createRequest = (token?: string) => {
    const searchParams = new URLSearchParams();
    if (token !== undefined) {
      searchParams.set('token', token);
    }
    return {
      method: 'GET',
      headers: new Headers(),
      nextUrl: {
        searchParams,
      },
    } as any;
  };

  it('returns error when token is missing', async () => {
    const request = createRequest();
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('INVALID_TOKEN');
  });

  it('returns error when token is empty', async () => {
    const request = createRequest('');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('INVALID_TOKEN');
  });

  it('returns NOT_FOUND when invitation does not exist', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Row not found' },
          }),
        }),
      }),
    });

    const request = createRequest('nonexistent-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(404);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('NOT_FOUND');
  });

  it('returns ALREADY_USED when invitation is already accepted', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'inv-1',
              token: 'accepted-token',
              email: 'test@example.com',
              company_id: 'company-1',
              status: 'accepted',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              companies: { id: 'company-1', name: 'Test Company' },
            },
            error: null,
          }),
        }),
      }),
    });

    const request = createRequest('accepted-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('ALREADY_USED');
  });

  it('returns EXPIRED when invitation status is expired', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'inv-1',
              token: 'expired-token',
              email: 'test@example.com',
              company_id: 'company-1',
              status: 'expired',
              expires_at: new Date(Date.now() - 86400000).toISOString(),
              companies: { id: 'company-1', name: 'Test Company' },
            },
            error: null,
          }),
        }),
      }),
    });

    const request = createRequest('expired-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('EXPIRED');
  });

  it('returns EXPIRED and updates status when invitation date is past', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'invitations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'inv-1',
                  token: 'past-date-token',
                  email: 'test@example.com',
                  company_id: 'company-1',
                  status: 'pending',
                  expires_at: new Date(Date.now() - 86400000).toISOString(), // Past date
                  companies: { id: 'company-1', name: 'Test Company' },
                },
                error: null,
              }),
            }),
          }),
          update: mockUpdate,
        };
      }
      return mockSupabase;
    });

    const request = createRequest('past-date-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.errorCode).toBe('EXPIRED');
  });

  it('returns valid true for pending invitation with future expiration', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'inv-1',
              token: 'valid-token',
              email: 'test@example.com',
              company_id: 'company-1',
              status: 'pending',
              expires_at: new Date(Date.now() + 86400000).toISOString(), // Future date
              companies: { id: 'company-1', name: 'Test Company' },
            },
            error: null,
          }),
        }),
      }),
    });

    const request = createRequest('valid-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.valid).toBe(true);
    expect(data.email).toBe('test@example.com');
    expect(data.companyName).toBe('Test Company');
    expect(data.companyId).toBe('company-1');
  });

  it('returns valid true with default company name when company data missing', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'inv-1',
              token: 'valid-token',
              email: 'test@example.com',
              company_id: 'company-1',
              status: 'pending',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              companies: null, // No company data
            },
            error: null,
          }),
        }),
      }),
    });

    const request = createRequest('valid-token');
    const response = await GET(request);
    const data: ValidateInvitationResponse = await response.json();

    expect(response.status).toBe(200);
    expect(data.valid).toBe(true);
    expect(data.companyName).toBe('Empresa');
  });
});
