// __tests__/api/authorize-helper.test.ts
// Audit S-05: single authorization gate for messaging routes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import {
  isAuthzFailure,
  jsonError,
  requireConversationParticipant,
  requireMessageParticipant,
} from '@/lib/auth/authorize';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';
const MESSAGE_ID = '77777777-7777-4777-8777-777777777777';

const mockRequireAuthUser = vi.fn();
const mockConversationMaybeSingle = vi.fn();
const mockMessageMaybeSingle = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAuthUser: () => mockRequireAuthUser(),
  validateUserSession: vi.fn(),
}));

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role !== 'service_role') {
      return { tag: 'user-scoped-client' };
    }
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              table === 'conversations' ? mockConversationMaybeSingle() : mockMessageMaybeSingle(),
          }),
        }),
      }),
    };
  }),
}));

const dbUser = { id: APP_USER_ID, companyId: 'company-1', role: 'member' };

describe('requireConversationParticipant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthUser.mockResolvedValue({ supabase: { tag: 'user-scoped-client' }, dbUser, authUser: { id: 'auth-uid' } });
    mockConversationMaybeSingle.mockResolvedValue({
      data: { id: CONVERSATION_ID, type: 'direct', room_id: null, participants: [APP_USER_ID, OTHER_USER_ID] },
      error: null,
    });
  });

  it('returns 400 failure for a missing conversationId', async () => {
    const result = await requireConversationParticipant('');

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(400);
    }
    expect(mockRequireAuthUser).not.toHaveBeenCalled();
  });

  it('propagates the 401 failure from requireAuthUser', async () => {
    mockRequireAuthUser.mockResolvedValueOnce({
      errorResponse: NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 }),
    });

    const result = await requireConversationParticipant(CONVERSATION_ID);

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(401);
    }
  });

  it('returns 404 failure when the conversation does not exist', async () => {
    mockConversationMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await requireConversationParticipant(CONVERSATION_ID);

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(404);
      expect((await result.errorResponse.json()).code).toBe('CONVERSATION_NOT_FOUND');
    }
  });

  it('returns 403 failure when the requester is not a participant', async () => {
    mockConversationMaybeSingle.mockResolvedValueOnce({
      data: { id: CONVERSATION_ID, type: 'direct', room_id: null, participants: [OTHER_USER_ID] },
      error: null,
    });

    const result = await requireConversationParticipant(CONVERSATION_ID);

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(403);
      expect((await result.errorResponse.json()).code).toBe('NOT_PARTICIPANT');
    }
  });

  it('returns the participant context on success', async () => {
    const result = await requireConversationParticipant(CONVERSATION_ID);

    expect(isAuthzFailure(result)).toBe(false);
    if (!isAuthzFailure(result)) {
      expect(result.dbUser.id).toBe(APP_USER_ID);
      expect(result.conversation).toEqual({
        id: CONVERSATION_ID,
        type: 'direct',
        roomId: null,
        participants: [APP_USER_ID, OTHER_USER_ID],
      });
      expect(result.supabase).toEqual({ tag: 'user-scoped-client' });
      expect(result.serviceClient).toBeDefined();
    }
  });
});

describe('requireMessageParticipant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthUser.mockResolvedValue({ supabase: { tag: 'user-scoped-client' }, dbUser, authUser: { id: 'auth-uid' } });
    mockMessageMaybeSingle.mockResolvedValue({
      data: { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, sender_id: OTHER_USER_ID },
      error: null,
    });
    mockConversationMaybeSingle.mockResolvedValue({
      data: { id: CONVERSATION_ID, type: 'direct', room_id: null, participants: [APP_USER_ID, OTHER_USER_ID] },
      error: null,
    });
  });

  it('returns 404 failure when the message does not exist', async () => {
    mockMessageMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await requireMessageParticipant(MESSAGE_ID);

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(404);
      expect((await result.errorResponse.json()).code).toBe('MESSAGE_NOT_FOUND');
    }
  });

  it('returns 403 failure when the requester is not in the message conversation', async () => {
    mockConversationMaybeSingle.mockResolvedValueOnce({
      data: { id: CONVERSATION_ID, type: 'direct', room_id: null, participants: [OTHER_USER_ID] },
      error: null,
    });

    const result = await requireMessageParticipant(MESSAGE_ID);

    expect(isAuthzFailure(result)).toBe(true);
    if (isAuthzFailure(result)) {
      expect(result.errorResponse.status).toBe(403);
    }
  });

  it('returns message and conversation context on success', async () => {
    const result = await requireMessageParticipant(MESSAGE_ID);

    expect(isAuthzFailure(result)).toBe(false);
    if (!isAuthzFailure(result)) {
      expect(result.message).toEqual({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: OTHER_USER_ID,
      });
      expect(result.conversation.id).toBe(CONVERSATION_ID);
    }
  });
});

describe('jsonError', () => {
  it('produces a uniform error body', async () => {
    const response = jsonError(403, 'NOT_PARTICIPANT', 'Nope');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Nope', code: 'NOT_PARTICIPANT' });
  });
});
