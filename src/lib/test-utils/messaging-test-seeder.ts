import { randomUUID } from 'node:crypto';

import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import {
  SupabaseCompanyRepository,
  SupabaseConversationRepository,
  SupabaseMessageRepository,
  SupabaseSpaceRepository,
  SupabaseUserRepository,
} from '@/repositories/implementations/supabase';
import {
  ConversationType,
  ConversationVisibility,
  MessageStatus,
  MessageType,
} from '@/types/messaging';
import type { SpaceType, UserRole, UserStatus } from '@/types/database';

export type SeedUserDefinition = {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  status?: UserStatus;
};

export type MessagingSeedOptions = {
  runId?: string;
  users: [SeedUserDefinition, SeedUserDefinition];
  roomCount?: number;
  includePinnedRoom?: boolean;
};

export type MessagingSeedResult = {
  runId: string;
  company: {
    id: string;
    name: string;
  };
  users: Array<{
    id: string;
    email: string;
    supabaseUid: string;
    role: UserRole;
  }>;
  spaces: Array<{
    id: string;
    name: string;
    type: SpaceType;
  }>;
  conversations: {
    directId: string;
    roomIds: string[];
  };
  messages: Array<{
    id: string;
    conversationId: string;
  }>;
};

export type MessagingSeedCleanupInput = {
  companyId: string;
  userIds: string[];
  conversationIds: string[];
  messageIds: string[];
  spaceIds: string[];
};

export class MessagingTestSeeder {
  private readonly userRepository: SupabaseUserRepository;
  private readonly companyRepository: SupabaseCompanyRepository;
  private readonly spaceRepository: SupabaseSpaceRepository;
  private readonly conversationRepository: SupabaseConversationRepository;
  private readonly messageRepository: SupabaseMessageRepository;

  constructor(private readonly supabase: SupabaseClient) {
    this.userRepository = new SupabaseUserRepository(supabase);
    this.companyRepository = new SupabaseCompanyRepository(supabase);
    this.spaceRepository = new SupabaseSpaceRepository(supabase);
    this.conversationRepository = new SupabaseConversationRepository(supabase);
    this.messageRepository = new SupabaseMessageRepository(supabase);
  }

  async seed(options: MessagingSeedOptions): Promise<MessagingSeedResult> {
    const runId = options.runId ?? randomUUID();
    const roomCount = Math.max(1, options.roomCount ?? 2);
    const includePinnedRoom = options.includePinnedRoom ?? true;

    const authUsers = await Promise.all(
      options.users.map(async (user) => this.ensureAuthUser(user))
    );

    const profiles = await Promise.all(
      options.users.map((user, index) =>
        this.ensureProfileForAuthUser(user, authUsers[index])
      )
    );

    const primaryProfile = profiles[0];
    const company = await this.companyRepository.create({
      name: `Test Messaging Co ${runId}`,
      adminIds: [primaryProfile.id],
      settings: {},
    });

    await Promise.all(
      profiles.map(async (profile, index) => {
        await this.userRepository.update(profile.id, {
          companyId: company.id,
          role: options.users[index].role,
          status: options.users[index].status ?? 'online',
          currentSpaceId: null,
        });
      })
    );

    const spaces = await this.createSpaces(company.id, primaryProfile.id, runId, roomCount);

    const participants = profiles.map((profile) => profile.id);
    const directConversation = await this.createDirectConversation(
      participants,
      runId,
    );

    const roomConversations = await this.createRoomConversations({
      participants,
      runId,
      spaces,
      includePinnedRoom,
    });

    await this.conversationRepository.setUserPreference(directConversation.id, profiles[0].id, {
      isPinned: true,
      pinnedOrder: 0,
    });
    await this.conversationRepository.setUserPreference(directConversation.id, profiles[1].id, {
      isPinned: false,
    });

    if (includePinnedRoom && roomConversations.length > 0) {
      await this.conversationRepository.setUserPreference(
        roomConversations[0].id,
        profiles[0].id,
        {
          isPinned: true,
          pinnedOrder: 1,
        },
      );
    }

    const messages = await this.seedInitialMessages({
      conversationId: directConversation.id,
      participants,
      runId,
    });

    return {
      runId,
      company: {
        id: company.id,
        name: company.name,
      },
      users: profiles.map((profile, index) => ({
        id: profile.id,
        email: options.users[index].email,
        supabaseUid: profile.supabase_uid,
        role: options.users[index].role,
      })),
      spaces: spaces.map((space) => ({
        id: space.id,
        name: space.name,
        type: space.type,
      })),
      conversations: {
        directId: directConversation.id,
        roomIds: roomConversations.map((room) => room.id),
      },
      messages: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
      })),
    };
  }

  async cleanup(input: MessagingSeedCleanupInput): Promise<void> {
    const { companyId, userIds, conversationIds, messageIds, spaceIds } = input;

    if (messageIds.length > 0) {
      await Promise.all(
        messageIds.map(async (messageId) => {
          try {
            await this.messageRepository.deleteById(messageId);
          } catch (error) {
            console.warn('[MessagingTestSeeder] Failed to delete message', { messageId, error });
          }
        })
      );
    }

    if (conversationIds.length > 0) {
      try {
        await this.supabase
          .from('conversation_preferences')
          .delete()
          .in('conversation_id', conversationIds);
      } catch (error) {
        console.warn('[MessagingTestSeeder] Failed to delete conversation preferences', { error });
      }

      await Promise.all(
        conversationIds.map(async (conversationId) => {
          try {
            await this.conversationRepository.deleteById(conversationId);
          } catch (error) {
            console.warn('[MessagingTestSeeder] Failed to delete conversation', { conversationId, error });
          }
        })
      );
    }

    if (spaceIds.length > 0) {
      await Promise.all(
        spaceIds.map(async (spaceId) => {
          try {
            await this.spaceRepository.deleteById(spaceId);
          } catch (error) {
            console.warn('[MessagingTestSeeder] Failed to delete space', { spaceId, error });
          }
        })
      );
    }

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          await this.userRepository.update(userId, {
            companyId: null,
            currentSpaceId: null,
          });
        } catch (error) {
          console.warn('[MessagingTestSeeder] Failed to reset user company association', { userId, error });
        }
      })
    );

    try {
      await this.companyRepository.deleteById(companyId);
    } catch (error) {
      console.warn('[MessagingTestSeeder] Failed to delete company', { companyId, error });
    }
  }

  private async ensureAuthUser(user: SeedUserDefinition): Promise<SupabaseAuthUser> {
    // List users and find by email since getUserByEmail doesn't exist
    const { data: users } = await this.supabase.auth.admin.listUsers();
    const existing = users?.users.find(u => u.email === user.email);
    if (existing) {
      const existingUser = existing;
      // Ensure password is updated for repeatable tests
      await this.supabase.auth.admin.updateUserById(existingUser.id, {
        password: user.password,
        email_confirm: true,
      });
      return existingUser;
    }

    const created = await this.supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });

    if (created.error || !created.data?.user) {
      throw new Error(`Failed to provision auth user ${user.email}: ${created.error?.message ?? 'Unknown error'}`);
    }

    return created.data.user;
  }

  private async ensureProfileForAuthUser(user: SeedUserDefinition, authUser: SupabaseAuthUser) {
    const existingProfile = await this.userRepository.findBySupabaseUid(authUser.id);

    if (existingProfile) {
      return existingProfile;
    }

    const createdProfile = await this.userRepository.create({
      companyId: null,
      supabase_uid: authUser.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: undefined,
      status: user.status ?? 'online',
      statusMessage: undefined,
      preferences: {},
      role: user.role,
      currentSpaceId: null,
    });

    return createdProfile;
  }

  private async createSpaces(companyId: string, createdBy: string, runId: string, roomCount: number) {
    const spaces = [] as Awaited<ReturnType<typeof this.spaceRepository.create>>[];

    for (let index = 0; index < roomCount; index += 1) {
      const space = await this.spaceRepository.create({
        companyId,
        name: `Test Space ${index + 1} ${runId}`,
        type: this.pickSpaceType(index),
        status: 'active',
        capacity: 8 + index,
        features: [],
        position: {
          x: 100 + index * 200,
          y: 120,
          width: 180,
          height: 140,
        },
        description: `Automated test space ${runId}-${index + 1}`,
        accessControl: {
          isPublic: true,
        },
        createdBy,
        isTemplate: false,
        templateName: undefined,
      });
      spaces.push(space);
    }

    return spaces;
  }

  private pickSpaceType(index: number): SpaceType {
    const types: SpaceType[] = ['workspace', 'conference', 'breakout'];
    return types[index % types.length];
  }

  private async createDirectConversation(participants: string[], runId: string) {
    const fingerprint = [...participants].sort().join(':');
    const now = new Date();

    return this.conversationRepository.create({
      type: ConversationType.DIRECT,
      participants,
      lastActivity: now,
      name: `test_dm_${runId}`,
      isArchived: false,
      roomId: undefined,
      visibility: ConversationVisibility.DIRECT,
      participantsFingerprint: fingerprint,
    });
  }

  private async createRoomConversations(options: {
    participants: string[];
    runId: string;
    spaces: Array<{ id: string }>;
    includePinnedRoom: boolean;
  }) {
    const { participants, runId, spaces, includePinnedRoom } = options;
    const conversations = [] as Awaited<ReturnType<typeof this.conversationRepository.create>>[];
    const now = new Date();

    for (let index = 0; index < spaces.length; index += 1) {
      const conversation = await this.conversationRepository.create({
        type: ConversationType.ROOM,
        participants,
        lastActivity: now,
        name: `Test Room Conversation ${index + 1} ${runId}`,
        isArchived: false,
        roomId: spaces[index].id,
        visibility: ConversationVisibility.PUBLIC,
      });

      if (includePinnedRoom && index === 0) {
        await this.conversationRepository.setUserPreference(conversation.id, participants[0], {
          isPinned: true,
          pinnedOrder: 2,
        });
      }

      conversations.push(conversation);
    }

    return conversations;
  }

  private async seedInitialMessages(options: {
    conversationId: string;
    participants: string[];
    runId: string;
  }) {
    const { conversationId, participants, runId } = options;

    const intro = await this.messageRepository.create({
      conversationId,
      senderId: participants[0],
      content: `Seeded hello from automated run ${runId}`,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      replyToId: undefined,
    });

    const reply = await this.messageRepository.create({
      conversationId,
      senderId: participants[1] ?? participants[0],
      content: `Seeded reply for run ${runId}`,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      replyToId: intro.id,
    });

    return [intro, reply];
  }
}
