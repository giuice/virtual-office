import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/messages/get/route';
import { jsonError } from '@/lib/auth/authorize';

const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';

const mockRequireConversationParticipant = vi.fn();
const mockFindByConversation = vi.fn();

vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authorize')>();
  return {
    ...actual,
    requireConversationParticipant: (conversationId: string) => mockRequireConversationParticipant(conversationId),
  };
});

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseMessageRepository: function MockMessageRepository() {
    return {
      findByConversation: (conversationId: string, paginationOptions: Record<string, unknown>) =>
        mockFindByConversation(conversationId, paginationOptions),
    };
  },
}));

function createRequest(query: Record<string, string>): NextRequest {
  return {
    url: `https://test.local/api/messages/get?${new URLSearchParams(query).toString()}`,
    nextUrl: {
      searchParams: new URLSearchParams(query),
    },
  } as unknown as NextRequest;
}

function participantContext() {
  return {
    supabase: {},
    serviceClient: {},
    dbUser: { id: APP_USER_ID },
    conversation: {
      id: CONVERSATION_ID,
      type: 'direct',
      roomId: null,
    },
  };
}

describe('/api/messages/get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireConversationParticipant.mockResolvedValue(participantContext());
    mockFindByConversation.mockResolvedValue({
      items: [{ id: 'message-1' }],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('returns 403 when requester is not a participant', async () => {
    mockRequireConversationParticipant.mockResolvedValueOnce(
      { errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation') }
    );

    const response = await GET(
      createRequest({ conversationId: CONVERSATION_ID, limit: '20' })
    );

    expect(response.status).toBe(403);
    expect(mockFindByConversation).not.toHaveBeenCalled();
  });

  it('returns messages for participant', async () => {
    const response = await GET(
      createRequest({ conversationId: CONVERSATION_ID, limit: '2' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(mockFindByConversation).toHaveBeenCalledWith(CONVERSATION_ID, {
      limit: 2,
      cursorBefore: undefined,
      cursorAfter: undefined,
    });
  });
});
