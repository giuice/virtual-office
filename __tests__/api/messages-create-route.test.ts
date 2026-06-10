// __tests__/api/messages-create-route.test.ts
// Audit S-04 regression suite: server-enforced status, replyToId scoping,
// content length cap, single authz gate.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/messages/create/route';
import { jsonError } from '@/lib/auth/authorize';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';
const REPLY_TARGET_ID = '77777777-7777-4777-8777-777777777777';

const mockRequireConversationParticipant = vi.fn();
const mockReplyLookup = vi.fn();
const mockMessageCreate = vi.fn();
const mockUpdateLastActivity = vi.fn();
const mockIncrementUnread = vi.fn();

vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authorize')>();
  return {
    ...actual,
    requireConversationParticipant: (conversationId: string) =>
      mockRequireConversationParticipant(conversationId),
  };
});

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseMessageRepository: function MockMessageRepository() {
    return {
      create: (data: Record<string, unknown>) => mockMessageCreate(data),
    };
  },
  SupabaseConversationRepository: function MockConversationRepository() {
    return {
      updateLastActivityTimestamp: (id: string) => mockUpdateLastActivity(id),
      incrementUnreadCount: (id: string, userIds: string[]) => mockIncrementUnread(id, userIds),
    };
  },
}));

const serviceClient = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => {
          if (table !== 'messages') throw new Error(`Unexpected table: ${table}`);
          return mockReplyLookup();
        },
      }),
    }),
  }),
};

function participantContext() {
  return {
    supabase: {},
    serviceClient,
    dbUser: { id: APP_USER_ID, companyId: 'company-1' },
    conversation: {
      id: CONVERSATION_ID,
      type: 'direct',
      roomId: null,
      participants: [APP_USER_ID, OTHER_USER_ID],
    },
  };
}

function createRequest(body: object): NextRequest {
  return {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('/api/messages/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireConversationParticipant.mockResolvedValue(participantContext());
    mockReplyLookup.mockResolvedValue({
      data: { id: REPLY_TARGET_ID, conversation_id: CONVERSATION_ID },
      error: null,
    });
    mockMessageCreate.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'message-1',
      timestamp: new Date(),
      reactions: [],
      attachments: [],
      isEdited: false,
      ...data,
    }));
    mockUpdateLastActivity.mockResolvedValue(undefined);
    mockIncrementUnread.mockResolvedValue(true);
  });

  it('propagates authorization failures from the gate', async () => {
    mockRequireConversationParticipant.mockResolvedValueOnce({
      errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation'),
    });

    const response = await POST(createRequest({ conversationId: CONVERSATION_ID, content: 'hi' }));

    expect(response.status).toBe(403);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('forces status to sent regardless of client input', async () => {
    const response = await POST(
      createRequest({ conversationId: CONVERSATION_ID, content: 'hi', status: 'read' })
    );

    expect(response.status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', senderId: APP_USER_ID })
    );
  });

  it('rejects content above the size cap with 413', async () => {
    const response = await POST(
      createRequest({ conversationId: CONVERSATION_ID, content: 'x'.repeat(8193) })
    );
    const data = await response.json();

    expect(response.status).toBe(413);
    expect(data.code).toBe('CONTENT_TOO_LARGE');
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('rejects a replyToId from another conversation with 400', async () => {
    mockReplyLookup.mockResolvedValueOnce({
      data: { id: REPLY_TARGET_ID, conversation_id: 'another-conversation' },
      error: null,
    });

    const response = await POST(
      createRequest({ conversationId: CONVERSATION_ID, content: 'hi', replyToId: REPLY_TARGET_ID })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('INVALID_REPLY_TARGET');
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent replyToId with 400', async () => {
    mockReplyLookup.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      createRequest({ conversationId: CONVERSATION_ID, content: 'hi', replyToId: REPLY_TARGET_ID })
    );

    expect(response.status).toBe(400);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid same-conversation reply and increments unread for recipients', async () => {
    const response = await POST(
      createRequest({ conversationId: CONVERSATION_ID, content: 'hi', replyToId: REPLY_TARGET_ID })
    );

    expect(response.status).toBe(201);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ replyToId: REPLY_TARGET_ID })
    );
    expect(mockUpdateLastActivity).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(mockIncrementUnread).toHaveBeenCalledWith(CONVERSATION_ID, [OTHER_USER_ID]);
  });
});
