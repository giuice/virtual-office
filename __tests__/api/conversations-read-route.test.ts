// __tests__/api/conversations-read-route.test.ts
// Audit B-01 regression suite: the participant check must use DB UUIDs
// (dbUser.id), and markConversationRead must receive the DB id — never the
// Supabase UID.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/conversations/read/route';
import { jsonError } from '@/lib/auth/authorize';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

const mockRequireConversationParticipant = vi.fn();
const mockMarkConversationRead = vi.fn();

vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authorize')>();
  return {
    ...actual,
    requireConversationParticipant: (conversationId: string) =>
      mockRequireConversationParticipant(conversationId),
  };
});

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseConversationRepository: function MockConversationRepository() {
    return {
      markConversationRead: (id: string, userId: string) => mockMarkConversationRead(id, userId),
    };
  },
}));

function participantContext() {
  return {
    supabase: {},
    serviceClient: {},
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
    method: 'PATCH',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('/api/conversations/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireConversationParticipant.mockResolvedValue(participantContext());
    mockMarkConversationRead.mockResolvedValue(true);
  });

  it('rejects a missing conversationId with 400', async () => {
    const response = await PATCH(createRequest({}));

    expect(response.status).toBe(400);
    expect(mockMarkConversationRead).not.toHaveBeenCalled();
  });

  it('propagates authorization failures from the gate (non-participant → 403)', async () => {
    mockRequireConversationParticipant.mockResolvedValueOnce({
      errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation'),
    });

    const response = await PATCH(createRequest({ conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(403);
    expect(mockMarkConversationRead).not.toHaveBeenCalled();
  });

  it('marks the conversation read using the DB user id, ignoring client-sent userId', async () => {
    const response = await PATCH(
      createRequest({ conversationId: CONVERSATION_ID, userId: 'spoofed-supabase-uid' })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockMarkConversationRead).toHaveBeenCalledWith(CONVERSATION_ID, APP_USER_ID);
  });

  it('returns 500 when the repository reports failure', async () => {
    mockMarkConversationRead.mockResolvedValueOnce(false);

    const response = await PATCH(createRequest({ conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(500);
  });
});
