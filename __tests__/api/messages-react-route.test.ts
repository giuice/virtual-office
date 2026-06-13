import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/messages/react/route';
import { jsonError } from '@/lib/auth/authorize';

const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';
const MESSAGE_ID = '77777777-7777-4777-8777-777777777777';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';

const mockRequireMessageParticipant = vi.fn();
const mockFindById = vi.fn();
const mockAddReaction = vi.fn();
const mockRemoveReaction = vi.fn();

vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authorize')>();
  return {
    ...actual,
    requireMessageParticipant: (messageId: string) => mockRequireMessageParticipant(messageId),
  };
});

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseMessageRepository: function MockMessageRepository() {
    return {
      findById: (messageId: string) => mockFindById(messageId),
      addReaction: (messageId: string, payload: { userId: string; emoji: string }) =>
        mockAddReaction(messageId, payload),
      removeReaction: (messageId: string, userId: string, emoji: string) =>
        mockRemoveReaction(messageId, userId, emoji),
    };
  },
}));

function createRequest(body: object): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

function messageContext() {
  return {
    supabase: {},
    serviceClient: {},
    dbUser: { id: APP_USER_ID },
    conversation: {
      id: CONVERSATION_ID,
      type: 'direct',
      roomId: null,
    },
    message: {
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      senderId: '99999999-9999-4111-9111-111111111111',
    },
  };
}

describe('/api/messages/react', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireMessageParticipant.mockResolvedValue(messageContext());
    mockFindById.mockResolvedValue({
      id: MESSAGE_ID,
      reactions: [],
    });
    mockAddReaction.mockResolvedValue(undefined);
    mockRemoveReaction.mockResolvedValue(undefined);
  });

  it('returns 403 when requester is not a participant', async () => {
    mockRequireMessageParticipant.mockResolvedValueOnce(
      { errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation') }
    );

    const response = await POST(
      createRequest({ messageId: MESSAGE_ID, emoji: '👍' })
    );

    expect(response.status).toBe(403);
    expect(mockFindById).not.toHaveBeenCalled();
  });
});
