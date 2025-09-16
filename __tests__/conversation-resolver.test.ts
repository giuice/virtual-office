import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConversationResolverError, ConversationResolverService } from '@/lib/services/ConversationResolverService';
import { ConversationType, ConversationVisibility, Conversation } from '@/types/messaging';
import type { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import type { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import type { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import type { User } from '@/types/database';

const baseUser: User = {
  id: 'user-1',
  companyId: 'company-1',
  supabase_uid: 'supabase-user-1',
  email: 'user@example.com',
  displayName: 'User One',
  status: 'online',
  preferences: {},
  role: 'member',
  lastActive: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  currentSpaceId: null,
};

const targetUser: User = {
  ...baseUser,
  id: 'user-2',
  supabase_uid: 'supabase-user-2',
  email: 'user2@example.com',
};

const baseConversation: Conversation = {
  id: 'conversation-1',
  type: ConversationType.DIRECT,
  participants: ['user-1', 'user-2'],
  lastActivity: new Date(),
  isArchived: false,
  unreadCount: {},
};

type ResolverDeps = {
  conversationRepository: IConversationRepository;
  adminConversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  spaceRepository: ISpaceRepository;
};

function createMocks(): ResolverDeps {
  return {
    conversationRepository: {
      findDirectByFingerprint: vi.fn(),
      findRoomByRoomId: vi.fn(),
      create: vi.fn(),
    } as unknown as IConversationRepository,
    adminConversationRepository: {
      findRoomByRoomId: vi.fn(),
      addParticipant: vi.fn(),
    } as unknown as IConversationRepository,
    userRepository: {
      findById: vi.fn(),
      findBySupabaseUid: vi.fn(),
    } as unknown as IUserRepository,
    spaceRepository: {
      findById: vi.fn(),
    } as unknown as ISpaceRepository,
  };
}

describe('ConversationResolverService', () => {
  let deps: ResolverDeps;
  let service: ConversationResolverService;

  beforeEach(() => {
    deps = createMocks();
    (deps.userRepository.findById as unknown as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === baseUser.id) {
        return Promise.resolve(baseUser);
      }
      if (id === targetUser.id) {
        return Promise.resolve(targetUser);
      }
      return Promise.resolve(null);
    });

    (deps.spaceRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'space-1',
      companyId: 'company-1',
      name: 'Space',
      type: 'workspace',
      status: 'active',
      capacity: 10,
      features: [],
      position: { x: 0, y: 0, width: 10, height: 10 },
      accessControl: { isPublic: true },
    });

    service = new ConversationResolverService(deps);
  });

  it('returns existing direct conversation without creating a new one', async () => {
    (deps.conversationRepository.findDirectByFingerprint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(baseConversation);

    const conversation = await service.resolve({
      type: ConversationType.DIRECT,
      requesterId: baseUser.id,
      targetUserId: targetUser.id,
    });

    expect(conversation).toBe(baseConversation);
    expect(deps.conversationRepository.create).not.toHaveBeenCalled();
  });

  it('creates a new direct conversation when none exists', async () => {
    (deps.conversationRepository.findDirectByFingerprint as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (deps.conversationRepository.create as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (payload: any) => ({
      ...baseConversation,
      id: 'conversation-created',
      participants: payload.participants,
      lastActivity: new Date(payload.lastActivity),
    }));

    const conversation = await service.resolve({
      type: ConversationType.DIRECT,
      requesterId: baseUser.id,
      targetUserId: targetUser.id,
    });

    expect(conversation.id).toBe('conversation-created');
    expect(deps.conversationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ConversationType.DIRECT,
        participants: ['user-1', 'user-2'],
        participantsFingerprint: expect.any(String),
      }),
    );
  });

  it('retries lookup when a unique conflict occurs during direct creation', async () => {
    (deps.conversationRepository.findDirectByFingerprint as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseConversation);

    const uniqueError = new Error('duplicate');
    (uniqueError as any).code = '23505';
    (deps.conversationRepository.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(uniqueError);

    const conversation = await service.resolve({
      type: ConversationType.DIRECT,
      requesterId: baseUser.id,
      targetUserId: targetUser.id,
    });

    expect(conversation).toBe(baseConversation);
    expect(deps.conversationRepository.create).toHaveBeenCalled();
  });

  it('throws when attempting to DM yourself', async () => {
    await expect(
      service.resolve({
        type: ConversationType.DIRECT,
        requesterId: baseUser.id,
        targetUserId: baseUser.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates a room conversation when none exists', async () => {
    (deps.adminConversationRepository.findRoomByRoomId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (deps.conversationRepository.create as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (payload: any) => ({
      id: 'room-convo',
      type: ConversationType.ROOM,
      participants: payload.participants,
      lastActivity: new Date(payload.lastActivity),
      isArchived: false,
      unreadCount: {},
      roomId: payload.roomId,
      visibility: payload.visibility ?? ConversationVisibility.PUBLIC,
    }));

    const conversation = await service.resolve({
      type: ConversationType.ROOM,
      requesterId: baseUser.id,
      roomId: 'space-1',
    });

    expect(conversation.id).toBe('room-convo');
    expect(deps.conversationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ConversationType.ROOM,
        participants: [baseUser.id],
        roomId: 'space-1',
      }),
    );
  });

  it('adds requester to existing room conversation if missing', async () => {
    const existingRoomConversation: Conversation = {
      id: 'room-existing',
      type: ConversationType.ROOM,
      participants: ['another-user'],
      lastActivity: new Date(),
      isArchived: false,
      unreadCount: {},
      roomId: 'space-1',
      visibility: ConversationVisibility.PUBLIC,
    };

    (deps.adminConversationRepository.findRoomByRoomId as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue(existingRoomConversation);

    (deps.adminConversationRepository.addParticipant as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...existingRoomConversation,
      participants: ['another-user', baseUser.id],
    });

    const conversation = await service.resolve({
      type: ConversationType.ROOM,
      requesterId: baseUser.id,
      roomId: 'space-1',
    });

    expect(deps.adminConversationRepository.addParticipant).toHaveBeenCalledWith('room-existing', baseUser.id);
    expect(conversation.participants).toContain(baseUser.id);
  });

  it('throws when target user is missing', async () => {
    await expect(
      service.resolve({
        type: ConversationType.DIRECT,
        requesterId: baseUser.id,
        targetUserId: 'missing-user',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('enforces room access control on allowed users', async () => {
    (deps.spaceRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'restricted-room',
      companyId: 'company-1',
      name: 'Restricted',
      type: 'workspace',
      status: 'active',
      capacity: 4,
      features: [],
      position: { x: 0, y: 0, width: 4, height: 4 },
      accessControl: { isPublic: false, allowedUsers: ['other-user'] },
    });

    await expect(
      service.resolve({
        type: ConversationType.ROOM,
        requesterId: baseUser.id,
        roomId: 'restricted-room',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
