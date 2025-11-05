import { createHash } from 'crypto';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { Conversation, ConversationType, ConversationVisibility } from '@/types/messaging';
import { User } from '@/types/database';

export class ConversationResolverError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ConversationResolverError';
    this.status = status;
  }
}

export type DirectConversationResolutionParams = {
  type: ConversationType.DIRECT;
  requesterId: string;
  targetUserId: string;
};

export type RoomConversationResolutionParams = {
  type: ConversationType.ROOM;
  requesterId: string;
  roomId: string;
};

type ConversationResolutionParams =
  | DirectConversationResolutionParams
  | RoomConversationResolutionParams;

type ResolverDependencies = {
  conversationRepository: IConversationRepository;
  adminConversationRepository: IConversationRepository;
  userRepository: IUserRepository;
  spaceRepository: ISpaceRepository;
  logger?: (message: string, details?: Record<string, unknown>) => void;
};

export class ConversationResolverService {
  private readonly conversationRepository: IConversationRepository;
  private readonly adminConversationRepository: IConversationRepository;
  private readonly userRepository: IUserRepository;
  private readonly spaceRepository: ISpaceRepository;
  private readonly logger?: (message: string, details?: Record<string, unknown>) => void;

  constructor({
    conversationRepository,
    adminConversationRepository,
    userRepository,
    spaceRepository,
    logger,
  }: ResolverDependencies) {
    this.conversationRepository = conversationRepository;
    this.adminConversationRepository = adminConversationRepository;
    this.userRepository = userRepository;
    this.spaceRepository = spaceRepository;
    this.logger = logger;
  }

  async resolve(params: ConversationResolutionParams): Promise<Conversation> {
    if (params.type === ConversationType.DIRECT) {
      return this.resolveDirectConversation(params);
    }
    if (params.type === ConversationType.ROOM) {
      return this.resolveRoomConversation(params);
    }
    throw new ConversationResolverError('Unsupported conversation type', 400);
  }

  private async resolveDirectConversation({
    requesterId,
    targetUserId,
  }: DirectConversationResolutionParams): Promise<Conversation> {
    if (requesterId === targetUserId) {
      throw new ConversationResolverError('Cannot start a direct conversation with yourself', 400);
    }

    const [requester, target] = await Promise.all([
      this.requireUser(requesterId, 'requester'),
      this.requireUser(targetUserId, 'target'),
    ]);

    if (requester.companyId && target.companyId && requester.companyId !== target.companyId) {
      throw new ConversationResolverError('Direct messages must be within the same company', 403);
    }

    const participants = this.normalizeParticipants([requesterId, targetUserId]);
    const fingerprint = ConversationResolverService.computeParticipantsFingerprint(participants);

    this.log('resolveDirect.start', { requesterId, targetUserId, fingerprint });

    const existing = await this.conversationRepository.findDirectByFingerprint(fingerprint);
    if (existing) {
      this.log('resolveDirect.found', { conversationId: existing.id });
      return existing;
    }

    try {
      const created = await this.conversationRepository.create({
        type: ConversationType.DIRECT,
        participants,
        isArchived: false,
        name: undefined,
        lastActivity: new Date(),
        visibility: ConversationVisibility.DIRECT,
        participantsFingerprint: fingerprint,
      });

      this.log('resolveDirect.created', { conversationId: created.id });
      return created;
    } catch (error) {
      const code = this.getSupabaseErrorCode(error);
      if (code === '23505') {
        this.log('resolveDirect.retryAfterConflict', { fingerprint });
        const retry = await this.conversationRepository.findDirectByFingerprint(fingerprint);
        if (retry) {
          return retry;
        }
      }
      this.log('resolveDirect.error', { message: (error as Error).message });
      throw error;
    }
  }

  private async resolveRoomConversation({
    requesterId,
    roomId,
  }: RoomConversationResolutionParams): Promise<Conversation> {
    const requester = await this.requireUser(requesterId, 'requester');
    const space = await this.spaceRepository.findById(roomId);

    if (!space) {
      throw new ConversationResolverError('Room not found', 404);
    }

    if (space.companyId && requester.companyId && space.companyId !== requester.companyId) {
      throw new ConversationResolverError('Room conversation not accessible for this user', 403);
    }

    const { accessControl } = space;
    if (accessControl) {
      const allowedUsers = accessControl.allowedUsers ?? [];
      const allowedRoles = accessControl.allowedRoles ?? [];
      if (allowedUsers.length > 0 && !allowedUsers.includes(requesterId)) {
        throw new ConversationResolverError('Room conversation restricted to specific users', 403);
      }
      if (allowedRoles.length > 0 && requester.role && !allowedRoles.includes(requester.role)) {
        throw new ConversationResolverError('Room conversation restricted to specific roles', 403);
      }
      if (!accessControl.isPublic && allowedUsers.length === 0 && allowedRoles.length === 0 && !requester.companyId) {
        throw new ConversationResolverError('Room is private and user has no company assigned', 403);
      }
    }

    this.log('resolveRoom.start', { requesterId, roomId });

    const visibility = accessControl?.isPublic === false
      ? ConversationVisibility.PRIVATE
      : ConversationVisibility.PUBLIC;

    let conversation = await this.adminConversationRepository.findRoomByRoomId(roomId);

    if (!conversation) {
      try {
        conversation = await this.conversationRepository.create({
          type: ConversationType.ROOM,
          participants: [requesterId],
          name: space.name,
          roomId,
          isArchived: false,
          lastActivity: new Date(),
          visibility,
        });
        this.log('resolveRoom.created', { conversationId: conversation.id });
      } catch (error) {
        const code = this.getSupabaseErrorCode(error);
        if (code === '23505') {
          this.log('resolveRoom.retryAfterConflict', { roomId });
          conversation = await this.adminConversationRepository.findRoomByRoomId(roomId);
        } else {
          this.log('resolveRoom.error', { message: (error as Error).message });
          throw error;
        }
      }
    }

    if (!conversation) {
      throw new Error('Failed to resolve room conversation after conflict retry');
    }

    if (!conversation.participants.includes(requesterId)) {
      const updated = await this.adminConversationRepository.addParticipant(conversation.id, requesterId);
      if (updated) {
        conversation = updated;
        this.log('resolveRoom.addedParticipant', { conversationId: conversation.id, requesterId });
      }
    }

    return conversation;
  }

  private async requireUser(userId: string, role: 'requester' | 'target'): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      if (role === 'target') {
        throw new ConversationResolverError('Target user not found', 404);
      }
      throw new ConversationResolverError('User not found', 404);
    }
    return user;
  }

  private normalizeParticipants(participants: string[]): string[] {
    const normalized = Array.from(new Set(participants.filter(Boolean)));
    normalized.sort();
    return normalized;
  }

  static computeParticipantsFingerprint(participants: string[]): string {
    if (participants.length === 0) {
      throw new ConversationResolverError('Participants are required to compute fingerprint', 400);
    }

    const sorted = [...participants].sort();
    const fingerprintSource = sorted.join(':');
    return createHash('md5').update(fingerprintSource).digest('hex');
  }

  private getSupabaseErrorCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return String((error as { code?: string }).code);
    }
    return undefined;
  }

  private log(message: string, details?: Record<string, unknown>) {
    if (process.env.ENABLE_CONVERSATION_RESOLVER_LOGS !== 'true') {
      return;
    }
    if (this.logger) {
      this.logger(`[ConversationResolver] ${message}`, details);
    } else {
      console.log(`[ConversationResolver] ${message}`, details);
    }
  }
}
