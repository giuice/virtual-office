import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { DELETE, GET } from '@/app/api/spaces/route';

const COMPANY_ID = 'company-1';
const OTHER_COMPANY_ID = 'company-2';
const SPACE_ID = 'space-1';

const mocks = vi.hoisted(() => ({
  requireAuthUser: vi.fn(),
  findByCompany: vi.fn(),
  findById: vi.fn(),
  serviceFrom: vi.fn(),
  deleteSpaces: vi.fn(),
  deleteEq: vi.fn(),
  supabase: {},
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: (options: unknown) => mocks.requireAuthUser(options),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseSpaceRepository: function MockSpaceRepository() {
    return {
      findByCompany: (companyId: string) => mocks.findByCompany(companyId),
      findById: (spaceId: string) => mocks.findById(spaceId),
    };
  },
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role !== 'service_role') {
      throw new Error(`Unexpected client role: ${String(role)}`);
    }

    return {
      from: (table: string) => mocks.serviceFrom(table),
    };
  }),
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'app-user-1',
    companyId: COMPANY_ID,
    supabase_uid: 'auth-user-1',
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

function requestFor(companyId: string): Request {
  return {
    url: `https://example.com/api/spaces?companyId=${companyId}`,
  } as Request;
}

function deleteRequest(spaceId = SPACE_ID): Request {
  return {
    url: `https://example.com/api/spaces?id=${spaceId}`,
  } as Request;
}

describe('/api/spaces GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthUser.mockResolvedValue({
      supabase: mocks.supabase,
      authUser: { id: 'auth-user-1' },
      dbUser: makeUser(),
    });
    mocks.findByCompany.mockResolvedValue([]);
    mocks.findById.mockResolvedValue({
      id: SPACE_ID,
      companyId: COMPANY_ID,
    });
    mocks.deleteEq.mockResolvedValue({ error: null, count: 1 });
    mocks.deleteSpaces.mockReturnValue({
      eq: (field: string, value: string) => mocks.deleteEq(field, value),
    });
    mocks.serviceFrom.mockReturnValue({
      delete: (options: { count: 'exact' }) => mocks.deleteSpaces(options),
    });
  });

  it('returns spaces for the authenticated user company', async () => {
    const response = await GET(requestFor(COMPANY_ID));

    expect(response.status).toBe(200);
    expect(mocks.findByCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it('blocks cross-company space reads', async () => {
    const response = await GET(requestFor(OTHER_COMPANY_ID));

    expect(response.status).toBe(403);
    expect(mocks.findByCompany).not.toHaveBeenCalled();
  });

  it('redacts a PostgREST-shaped failure from the response and keeps diagnostics in the correlated log', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.findByCompany.mockRejectedValueOnce({
      code: '42501',
      message: 'permission denied for table spaces',
      details: 'sensitive database detail',
      hint: 'sensitive database hint',
      status: 403,
    });

    const response = await GET(requestFor(COMPANY_ID));
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      error: 'Failed to fetch spaces',
      code: 'INTERNAL_ERROR',
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(data)).not.toContain('sensitive database detail');
    expect(JSON.stringify(data)).not.toContain('sensitive database hint');
    expect(JSON.stringify(data)).not.toContain('42501');

    const logLine = logSpy.mock.calls.map(([line]) => String(line)).find((line) => line.includes('"context":"spaces.get"'));
    expect(logLine).toContain('42501');
    expect(logLine).toContain('sensitive database detail');
    expect(logLine).toContain('sensitive database hint');
    expect(logLine).toContain(String(data.correlationId));

    logSpy.mockRestore();
  });

  it('maps space FK restriction failures to SPACE_IN_USE on delete', async () => {
    mocks.deleteEq.mockResolvedValueOnce({
      data: null,
      count: null,
      error: {
        code: '23503',
        message: 'violates foreign key constraint "users_current_space_id_fkey"',
      },
    });

    const response = await DELETE(deleteRequest());
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(data).toEqual({ success: false, code: 'SPACE_IN_USE' });
    expect(mocks.serviceFrom).toHaveBeenCalledWith('spaces');
    expect(mocks.deleteSpaces).toHaveBeenCalledWith({ count: 'exact' });
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', SPACE_ID);
  });
});
