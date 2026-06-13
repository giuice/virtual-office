// __tests__/api/conversations-join-route.test.ts
// Audit S-01 regression suite: /api/conversations/join must never allow
// joining direct/group conversations or rooms outside the requester's reach.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';
import { POST } from '@/app/api/conversations/join/route';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_A = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_B = '99999999-9999-4999-8999-999999999999';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_COMPANY_ID = '55555555-5555-4555-8555-555555555555';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

const mockRequireAuthUser = vi.fn();
const mockConvoFindById = vi.fn();
const mockAddParticipant = vi.fn();
const mockSpaceFindById = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mockRequireAuthUser(),
  validateUserSession: vi.fn(),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseConversationRepository: function MockConversationRepository() {
    return {
      findById: (id: string) => mockConvoFindById(id),
      addParticipant: (id: string, userId: string) => mockAddParticipant(id, userId),
    };
  },
  SupabaseSpaceRepository: function MockSpaceRepository() {
    return {
      findById: (id: string) => mockSpaceFindById(id),
    };
  },
}));

function createRequest(body: object): NextRequest {
  return {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

const dbUser = { id: APP_USER_ID, companyId: COMPANY_ID, role: 'member' };

function roomConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    type: 'room',
    roomId: SPACE_ID,
    participants: [OTHER_USER_A],
    ...overrides,
  };
}

function space(overrides: Record<string, unknown> = {}) {
  return {
    id: SPACE_ID,
    companyId: COMPANY_ID,
    name: 'Lounge',
    accessControl: { isPublic: true, allowedUsers: [], allowedRoles: [] },
    ...overrides,
  };
}

describe('/api/conversations/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthUser.mockResolvedValue({ supabase: {}, dbUser, authUser: { id: 'auth-uid' } });
    mockConvoFindById.mockResolvedValue(roomConversation());
    mockSpaceFindById.mockResolvedValue(space());
    mockAddParticipant.mockImplementation(async (_id: string, userId: string) =>
      roomConversation({ participants: [OTHER_USER_A, userId] })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuthUser.mockResolvedValueOnce({
      errorResponse: NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 }),
    });

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(401);
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('returns 400 when conversationId is missing', async () => {
    const response = await POST(createRequest({}));

    expect(response.status).toBe(400);
    expect(mockConvoFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the conversation does not exist', async () => {
    mockConvoFindById.mockResolvedValueOnce(null);

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe('CONVERSATION_NOT_FOUND');
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('rejects a non-participant joining a direct conversation with 403', async () => {
    mockConvoFindById.mockResolvedValueOnce({
      id: CONVERSATION_ID,
      type: 'direct',
      roomId: undefined,
      participants: [OTHER_USER_A, OTHER_USER_B],
    });

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('JOIN_FORBIDDEN');
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('rejects joining a group conversation with 403', async () => {
    mockConvoFindById.mockResolvedValueOnce(
      roomConversation({ type: 'group', roomId: undefined })
    );

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('JOIN_FORBIDDEN');
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('rejects joining a room in another company with 403', async () => {
    mockSpaceFindById.mockResolvedValueOnce(space({ companyId: OTHER_COMPANY_ID }));

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('ROOM_ACCESS_DENIED');
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('rejects joining a room restricted to other users with 403', async () => {
    mockSpaceFindById.mockResolvedValueOnce(
      space({ accessControl: { isPublic: false, allowedUsers: [OTHER_USER_A], allowedRoles: [] } })
    );

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('ROOM_ACCESS_DENIED');
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('returns the conversation without re-adding when already a participant', async () => {
    mockConvoFindById.mockResolvedValueOnce(
      roomConversation({ participants: [OTHER_USER_A, APP_USER_ID] })
    );

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.conversation.id).toBe(CONVERSATION_ID);
    expect(mockAddParticipant).not.toHaveBeenCalled();
  });

  it('joins an accessible room conversation', async () => {
    const response = await POST(createRequest({ conversationId: CONVERSATION_ID }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockSpaceFindById).toHaveBeenCalledWith(SPACE_ID);
    expect(mockAddParticipant).toHaveBeenCalledWith(CONVERSATION_ID, APP_USER_ID);
    expect(data.conversation.participants).toContain(APP_USER_ID);
  });
});
