import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase/SupabaseConversationRepository';
import { ConversationType, ConversationVisibility } from '@/types/messaging';

const conversationId = '00000000-0000-4000-8000-000000000001';

function conversationInput() {
  return {
    type: ConversationType.DIRECT,
    participants: [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ],
    lastActivity: new Date('2026-07-22T12:00:00.000Z'),
    isArchived: false,
    visibility: ConversationVisibility.DIRECT,
    participantsFingerprint: 'participant-a:participant-b',
  };
}

describe('SupabaseConversationRepository.create', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(conversationId);
  });

  it('finishes the insert before reading the row authorized by the membership trigger', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: conversationId,
        type: 'direct',
        participants: conversationInput().participants,
        last_activity: '2026-07-22T12:00:00.000Z',
        name: null,
        is_archived: false,
        room_id: null,
        visibility: 'direct',
        participants_fingerprint: 'participant-a:participant-b',
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn()
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select });
    const repository = new SupabaseConversationRepository({ from } as unknown as SupabaseClient);

    const created = await repository.create(conversationInput());

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: conversationId }));
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('id', conversationId);
    expect(created.id).toBe(conversationId);
  });

  it('preserves the Supabase error code for resolver conflict handling', async () => {
    const databaseError = {
      code: '23505',
      details: null,
      hint: null,
      message: 'duplicate key value violates unique constraint',
    };
    const insert = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = new SupabaseConversationRepository({ from } as unknown as SupabaseClient);

    await expect(repository.create(conversationInput())).rejects.toBe(databaseError);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
