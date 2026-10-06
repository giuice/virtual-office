import { randomBytes, randomUUID } from 'node:crypto';

import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';

import {
  SupabaseCompanyRepository,
  SupabaseConversationRepository,
  SupabaseMessageRepository,
  SupabaseSpaceRepository,
  SupabaseUserRepository,
} from '@/repositories/implementations/supabase';
import { ConversationResolverService } from '@/lib/services/ConversationResolverService';
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
  /**
   * Lower-cased emails of the configured Playwright accounts. The seeder never
   * creates or resets an auth user outside this set.
   */
  allowedEmails: ReadonlySet<string>;
  users: [SeedUserDefinition, SeedUserDefinition];
  roomCount?: number;
  includePinnedRoom?: boolean;
  /** Opt-in: add a group conversation shared by both users. */
  includeGroupConversation?: boolean;
  /**
   * Opt-in: seed this many messages into the group conversation (implies
   * includeGroupConversation). The drawer pages history 20 at a time, so 21+
   * gives a conversation with more than one page.
   */
  historyMessageCount?: number;
  /**
   * Opt-in: a third company member added to the group conversation (implies
   * includeGroupConversation). It never signs in; tests record its reads
   * through markMessagesRead, the same RPC the read route uses.
   */
  thirdUser?: SeedUserDefinition;
};

export const MAX_HISTORY_MESSAGE_COUNT = 200;

/** Stable name: the two test accounts share one persistent company. */
const SHARED_COMPANY_NAME = 'Playwright Messaging Company';
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Seeded rooms are reused, not created per run: entering a room writes
 * presence history (space_presence_log, user_presence_sessions,
 * users.current_space_id) that references it with ON DELETE RESTRICT and is
 * writable only through the presence transition contract, so a room a test
 * entered could never be removed again. `Test Space Fixed N` (N = 1..roomCount)
 * is found or created once per company and kept. Seeds for one company must
 * run one at a time (local mode uses workers: 1; seeds already share the
 * direct conversation): find-or-create and the room-conversation replacement
 * are not atomic across concurrent seeds.
 */
const REUSABLE_SPACE_NAME_PREFIX = 'Test Space Fixed ';

/** Names given by createDirectConversation / createRoomConversations / createGroupConversation. */
const SEEDED_CONVERSATION_NAME = /^(test_dm_|Test Room Conversation \d+ |Test Group )/;
/** Keeps `in.(...)` filters well under URL length limits. */
const ID_FILTER_CHUNK = 100;

/** Rows one seed created, so a seed that fails partway can remove them. */
type SeedRows = {
  conversationIds: string[];
  spaceIds: string[];
  /** Messages seeded into a reused (pre-existing) direct conversation are tracked too. */
  messageIds: string[];
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Like Promise.all, but rejects only after every promise has settled, so a
 * failing seed knows every row its parallel inserts created.
 */
async function settleAll<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected) {
    throw rejected.reason;
  }
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

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
    groupId?: string;
    /** Conversation holding `historyMessageCount` messages, when requested. */
    historyId?: string;
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

  /**
   * Seeds one test world. A seed that fails partway removes the conversations,
   * messages, and spaces it had created before rethrowing, so it leaves
   * nothing behind for the next seed.
   */
  async seed(options: MessagingSeedOptions): Promise<MessagingSeedResult> {
    const created: SeedRows = { conversationIds: [], spaceIds: [], messageIds: [] };
    try {
      return await this.seedTracked(options, created);
    } catch (error) {
      await this.removePartialSeed(created);
      throw error;
    }
  }

  private async seedTracked(
    options: MessagingSeedOptions,
    created: SeedRows,
  ): Promise<MessagingSeedResult> {
    const runId = options.runId ?? randomUUID();
    const roomCount = Math.max(1, options.roomCount ?? 2);
    const includePinnedRoom = options.includePinnedRoom ?? true;
    const { allowedEmails } = options;

    const authUsers = await Promise.all(
      options.users.map(async (user) => this.ensureAuthUser(user, allowedEmails))
    );

    const profiles = await Promise.all(
      options.users.map((user, index) =>
        this.ensureProfileForAuthUser(user, authUsers[index])
      )
    );

    const primaryProfile = profiles[0];
    const company = await this.ensureSharedCompany(profiles[0], profiles[1], options.users[1]);

    const thirdProfile = options.thirdUser
      ? await this.ensureProfileForAuthUser(options.thirdUser, await this.ensureAuthUser(options.thirdUser, allowedEmails))
      : null;
    if (thirdProfile && options.thirdUser) {
      await this.ensureCompanyMember(company.id, profiles[0].id, thirdProfile, options.thirdUser);
    }

    const spaces = await this.ensureReusableSpaces(company.id, primaryProfile.id, roomCount, created);

    const participants = profiles.map((profile) => profile.id);
    const directPromise = this.createDirectConversation(participants, runId, created);
    const roomsPromise = this.createRoomConversations({
      participants,
      runId,
      spaces,
      includePinnedRoom,
      allowedEmails,
      created,
    });
    // Wait for both before failing so every created conversation is tracked.
    await Promise.allSettled([directPromise, roomsPromise]);
    const directConversation = await directPromise;
    const roomConversations = await roomsPromise;

    await Promise.all([
      this.conversationRepository.setUserPreference(directConversation.id, profiles[0].id, {
        isPinned: true,
        pinnedOrder: 0,
      }),
      this.conversationRepository.setUserPreference(directConversation.id, profiles[1].id, {
        isPinned: false,
      }),
    ]);

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
      created,
    });

    const historyMessageCount = Math.min(
      Math.max(0, Math.floor(options.historyMessageCount ?? 0)),
      MAX_HISTORY_MESSAGE_COUNT,
    );
    const groupConversation =
      options.includeGroupConversation || historyMessageCount > 0 || thirdProfile
        ? await this.createGroupConversation(
            thirdProfile ? [...participants, thirdProfile.id] : participants,
            runId,
            created,
          )
        : null;

    if (groupConversation && historyMessageCount > 0) {
      messages.push(
        ...(await this.seedHistoryMessages({
          conversationId: groupConversation.id,
          participants,
          runId,
          count: historyMessageCount,
          created,
        })),
      );
    }

    return {
      runId,
      company: {
        id: company.id,
        name: company.name,
      },
      users: [
        ...profiles.map((profile, index) => ({
          id: profile.id,
          email: options.users[index].email,
          supabaseUid: profile.supabase_uid,
          role: options.users[index].role,
        })),
        ...(thirdProfile && options.thirdUser
          ? [{
              id: thirdProfile.id,
              email: options.thirdUser.email,
              supabaseUid: thirdProfile.supabase_uid,
              role: options.thirdUser.role,
            }]
          : []),
      ],
      spaces: spaces.map((space) => ({
        id: space.id,
        name: space.name,
        type: space.type,
      })),
      conversations: {
        directId: directConversation.id,
        roomIds: roomConversations.map((room) => room.id),
        ...(groupConversation ? { groupId: groupConversation.id } : {}),
        ...(groupConversation && historyMessageCount > 0
          ? { historyId: groupConversation.id }
          : {}),
      },
      messages: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
      })),
    };
  }

  async cleanup(input: MessagingSeedCleanupInput): Promise<void> {
    // companyId, userIds, and spaceIds stay in the input contract but are not
    // removed: membership and placement are kept (see below) and seeded rooms
    // are reusable fixtures (REUSABLE_SPACE_NAME_PREFIX).
    const { conversationIds, messageIds } = input;

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
          .from('conversation_members')
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

    // The shared company and both users' membership are intentionally kept:
    // membership changes go through the company RPCs (the database rejects
    // direct service-role company_id/role updates), and placement changes go
    // through the presence transition contract, so per-run detach is not done.
  }

  /**
   * Removes the rows a failed seed created (a reusable room only when this
   * seed created it). Conversation deletes cascade to
   * their members, messages, receipts, stars, and pins. Failures are logged,
   * not thrown, so the seed's own error is what the caller sees.
   */
  private async removePartialSeed(created: SeedRows): Promise<void> {
    const steps: Array<[table: 'messages' | 'conversations' | 'spaces', ids: string[]]> = [
      ['messages', created.messageIds],
      ['conversations', created.conversationIds],
      ['spaces', created.spaceIds],
    ];
    for (const [table, ids] of steps) {
      for (const idChunk of chunk(ids, ID_FILTER_CHUNK)) {
        const { error } = await this.supabase.from(table).delete().in('id', idChunk);
        if (error) {
          console.error(`[MessagingTestSeeder] Failed to remove partially seeded ${table}`, {
            count: idChunk.length,
            error,
          });
        }
      }
    }
  }

  /**
   * LOCAL SUPABASE ONLY — the caller must have confirmed local mode. Deletes
   * the conversations that earlier interrupted or partially failed runs left
   * behind: only conversations with a seeded name (test_dm_, Test Room
   * Conversation N, Test Group) whose participants and members are all
   * `allowedEmails` accounts. Deleting a conversation cascades to its members,
   * messages (with their receipts, reactions, stars, pins), receipts, stars,
   * and pins. Users, the shared company, and spaces are kept (presence history
   * references seeded spaces). Returns the deleted conversation ids.
   */
  async sweepSeededLeftovers(allowedEmails: ReadonlySet<string>): Promise<string[]> {
    if (allowedEmails.size === 0) {
      return [];
    }

    const accountIds = await this.findTestAccountIds(allowedEmails);
    if (accountIds.size === 0) {
      return [];
    }

    const { data: candidates, error: candidatesError } = await this.supabase
      .from('conversations')
      .select('id, name, participants')
      .containedBy('participants', [...accountIds])
      .overrideTypes<
        Array<{ id: string; name: string | null; participants: string[] | null }>,
        { merge: false }
      >();
    if (candidatesError) {
      throw new Error(`Failed to read leftover conversations: ${candidatesError.message}`);
    }
    const seededIds = (candidates ?? [])
      .filter((conversation) => {
        const participants = conversation.participants ?? [];
        return (
          SEEDED_CONVERSATION_NAME.test(conversation.name ?? '') &&
          participants.length > 0 &&
          participants.every((id) => accountIds.has(id))
        );
      })
      .map((conversation) => conversation.id);

    // A conversation with any member outside the test accounts is never touched.
    const foreignMemberConversations = await this.findConversationsWithForeignMembers(seededIds, accountIds);
    const leftoverIds = seededIds.filter((id) => !foreignMemberConversations.has(id));

    const deleted: string[] = [];
    for (const idChunk of chunk(leftoverIds, ID_FILTER_CHUNK)) {
      const { data, error } = await this.supabase
        .from('conversations')
        .delete()
        .in('id', idChunk)
        .select('id')
        .overrideTypes<Array<{ id: string }>, { merge: false }>();
      if (error) {
        throw new Error(`Failed to delete leftover conversations: ${error.message}`);
      }
      deleted.push(...(data ?? []).map((row) => row.id));
    }
    return deleted;
  }

  /** App user ids of the `allowedEmails` accounts. */
  private async findTestAccountIds(allowedEmails: ReadonlySet<string>): Promise<Set<string>> {
    if (allowedEmails.size === 0) {
      return new Set();
    }
    const { data: accounts, error: accountsError } = await this.supabase
      .from('users')
      .select('id, email')
      .in('email', [...allowedEmails])
      .overrideTypes<Array<{ id: string; email: string | null }>, { merge: false }>();
    if (accountsError) {
      throw new Error(`Failed to read test accounts: ${accountsError.message}`);
    }
    return new Set(
      (accounts ?? [])
        .filter((account) => allowedEmails.has(account.email?.trim().toLowerCase() ?? ''))
        .map((account) => account.id),
    );
  }

  /** Of `conversationIds`, those with a conversation_members row outside `accountIds`. */
  private async findConversationsWithForeignMembers(
    conversationIds: readonly string[],
    accountIds: ReadonlySet<string>,
  ): Promise<Set<string>> {
    const foreign = new Set<string>();
    for (const idChunk of chunk(conversationIds, ID_FILTER_CHUNK)) {
      const { data: members, error: membersError } = await this.supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', idChunk)
        .overrideTypes<Array<{ conversation_id: string; user_id: string }>, { merge: false }>();
      if (membersError) {
        throw new Error(`Failed to read conversation members: ${membersError.message}`);
      }
      for (const member of members ?? []) {
        if (!accountIds.has(member.user_id)) {
          foreign.add(member.conversation_id);
        }
      }
    }
    return foreign;
  }

  /**
   * Put both test users in one company through the product membership RPCs:
   * the primary creates (or keeps) a company as admin, and the secondary
   * joins it by accepting an invitation as a member. Reused across runs.
   */
  private async ensureSharedCompany(
    primary: { id: string; companyId?: string | null; role?: UserRole },
    secondary: { id: string; companyId?: string | null; email: string },
    secondaryDefinition: SeedUserDefinition,
  ): Promise<{ id: string; name: string }> {
    let companyId = primary.companyId ?? null;

    if (!companyId) {
      const { data, error } = await this.supabase.rpc('create_company_for_user', {
        p_user_id: primary.id,
        p_name: SHARED_COMPANY_NAME,
        p_settings: {},
      });
      if (error) {
        throw new Error(`Failed to create shared test company: ${error.message}`);
      }
      companyId = (data as { companyId: string }).companyId;
    } else if (primary.role !== 'admin') {
      throw new Error('Primary messaging test user must be an admin of its company');
    }

    await this.ensureCompanyMember(companyId, primary.id, secondary, secondaryDefinition);

    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw new Error(`Shared test company ${companyId} not found`);
    }
    return { id: company.id, name: company.name };
  }

  /**
   * Join `member` to the company as a member by accepting an invitation from
   * the admin (product membership RPCs). No-op when already a member.
   */
  private async ensureCompanyMember(
    companyId: string,
    adminId: string,
    member: { id: string; companyId?: string | null; email: string },
    definition: SeedUserDefinition,
  ): Promise<void> {
    if (member.companyId && member.companyId !== companyId) {
      throw new Error(
        `Messaging test user ${member.email} belongs to a different company; remove it from that company first`,
      );
    }
    if (member.companyId) {
      return;
    }

    const { data: invitation, error: inviteError } = await this.supabase.rpc(
      'create_company_invitation',
      {
        p_actor_user_id: adminId,
        p_company_id: companyId,
        p_email: member.email,
        p_role: 'member',
        p_token: randomBytes(32).toString('hex'),
        p_expires_at: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
      },
    );
    if (inviteError) {
      throw new Error(`Failed to invite test user ${member.email}: ${inviteError.message}`);
    }

    const { error: acceptError } = await this.supabase.rpc(
      'accept_company_invitation_membership',
      {
        p_user_id: member.id,
        p_invitation_id: (invitation as { invitationId: string }).invitationId,
        p_company_id: companyId,
        p_display_name: definition.displayName,
      },
    );
    if (acceptError) {
      throw new Error(`Failed to add test user ${member.email} to company: ${acceptError.message}`);
    }
  }

  /**
   * Record `userId`'s reads of `messageIds` through mark_messages_read, the
   * service-role RPC behind PATCH /api/conversations/read (membership and
   * own-message rules apply). Returns the number of new receipts.
   */
  async markMessagesRead(conversationId: string, userId: string, messageIds: string[]): Promise<number> {
    const { data, error } = await this.supabase.rpc('mark_messages_read', {
      p_conversation_id: conversationId,
      p_user_id: userId,
      p_message_ids: messageIds,
    });
    if (error) {
      throw new Error(`Failed to mark messages read: ${error.message}`);
    }
    return typeof data === 'number' ? data : 0;
  }

  /**
   * Removes `userId` from `conversationId` (its conversation_members row) and
   * returns how many rows were deleted. Star and receipt rows are kept, as for
   * a member who lost access. Callers must check isSeededConversationMember.
   */
  async removeConversationMember(conversationId: string, userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .select('user_id');
    if (error) {
      throw new Error(`Failed to remove conversation member: ${error.message}`);
    }
    return data?.length ?? 0;
  }

  /**
   * True only when `userId` is a member of `conversationId` and every member
   * of that conversation (including `userId`) has one of `allowedEmails` — the
   * shape of every conversation this seeder creates. Unknown ids are false.
   */
  async isSeededConversationMember(
    conversationId: string,
    userId: string,
    allowedEmails: ReadonlySet<string>,
  ): Promise<boolean> {
    if (allowedEmails.size === 0) {
      return false;
    }

    const { data: members, error: membersError } = await this.supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .overrideTypes<Array<{ user_id: string }>, { merge: false }>();
    if (membersError) {
      throw new Error(`Failed to read conversation members: ${membersError.message}`);
    }
    const memberIds = [...new Set((members ?? []).map((member) => member.user_id))];
    if (!memberIds.includes(userId)) {
      return false;
    }

    const { data: accounts, error: accountsError } = await this.supabase
      .from('users')
      .select('id, email')
      .in('id', memberIds)
      .overrideTypes<Array<{ id: string; email: string | null }>, { merge: false }>();
    if (accountsError) {
      throw new Error(`Failed to read conversation member accounts: ${accountsError.message}`);
    }
    const emailById = new Map(
      (accounts ?? []).map((account) => [account.id, account.email?.trim().toLowerCase() ?? '']),
    );
    return memberIds.every((id) => allowedEmails.has(emailById.get(id) ?? ''));
  }

  private async ensureAuthUser(
    user: SeedUserDefinition,
    allowedEmails: ReadonlySet<string>,
  ): Promise<SupabaseAuthUser> {
    // Never create, or reset the password of, an account outside the
    // configured Playwright test accounts.
    if (!allowedEmails.has(user.email.trim().toLowerCase())) {
      throw new Error(`Refusing to provision ${user.email}: not a configured Playwright test account`);
    }
    // List users and find by email since getUserByEmail doesn't exist
    const { data: users } = await this.supabase.auth.admin.listUsers({ perPage: 1000 });
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

  /**
   * Finds or creates the company's reusable rooms `Test Space Fixed 1..roomCount`.
   * A room is created (and tracked for partial-seed rollback) only when the
   * company has none with that name; an existing one is returned unchanged.
   */
  private async ensureReusableSpaces(
    companyId: string,
    createdBy: string,
    roomCount: number,
    created: SeedRows,
  ): Promise<Array<{ id: string; name: string; type: SpaceType }>> {
    const names = Array.from({ length: roomCount }, (_, index) => `${REUSABLE_SPACE_NAME_PREFIX}${index + 1}`);
    const { data: existingRows, error } = await this.supabase
      .from('spaces')
      .select('id, name, type')
      .eq('company_id', companyId)
      .in('name', names)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .overrideTypes<Array<{ id: string; name: string; type: SpaceType }>, { merge: false }>();
    if (error) {
      throw new Error(`Failed to read reusable test spaces: ${error.message}`);
    }
    const existingByName = new Map<string, { id: string; name: string; type: SpaceType }>();
    for (const row of existingRows ?? []) {
      // Oldest wins if an earlier concurrent seed created a duplicate.
      if (!existingByName.has(row.name)) {
        existingByName.set(row.name, { id: row.id, name: row.name, type: row.type });
      }
    }

    return settleAll(names.map(async (name, index) => {
      const existing = existingByName.get(name);
      if (existing) {
        return existing;
      }
      const space = await this.spaceRepository.create({
        companyId,
        name,
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
        description: 'Reusable messaging E2E test space',
        accessControl: {
          isPublic: true,
        },
        createdBy,
        isTemplate: false,
        templateName: undefined,
      });
      created.spaceIds.push(space.id);
      return { id: space.id, name: space.name, type: space.type };
    }));
  }

  private pickSpaceType(index: number): SpaceType {
    const types: SpaceType[] = ['workspace', 'conference', 'breakout'];
    return types[index % types.length];
  }

  private async createDirectConversation(participants: string[], runId: string, created: SeedRows) {
    // The value the conversations_set_participants_fingerprint trigger stores
    // (md5 of the sorted ids), so an existing direct conversation is found.
    const fingerprint = ConversationResolverService.computeParticipantsFingerprint(participants);
    const now = new Date();

    const existing = await this.conversationRepository.findDirectByFingerprint(fingerprint);

    if (existing) {
      await this.conversationRepository.updateLastActivityTimestamp(existing.id, now.toISOString());
      return {
        ...existing,
        lastActivity: now,
      };
    }

    const conversation = await this.conversationRepository.create({
      type: ConversationType.DIRECT,
      participants,
      lastActivity: now,
      name: `test_dm_${runId}`,
      isArchived: false,
      roomId: undefined,
      visibility: ConversationVisibility.DIRECT,
      participantsFingerprint: fingerprint,
    });
    created.conversationIds.push(conversation.id);
    return conversation;
  }

  private async createRoomConversations(options: {
    participants: string[];
    runId: string;
    spaces: Array<{ id: string }>;
    includePinnedRoom: boolean;
    allowedEmails: ReadonlySet<string>;
    created: SeedRows;
  }) {
    const { participants, runId, spaces, includePinnedRoom, allowedEmails, created } = options;
    const now = new Date();

    await this.removeTestOnlyRoomConversations(
      spaces.map((space) => space.id),
      allowedEmails,
    );

    return settleAll(spaces.map(async (space, index) => {
      const conversation = await this.conversationRepository.create({
        type: ConversationType.ROOM,
        participants,
        lastActivity: now,
        name: `Test Room Conversation ${index + 1} ${runId}`,
        isArchived: false,
        roomId: space.id,
        visibility: ConversationVisibility.PUBLIC,
      });
      created.conversationIds.push(conversation.id);

      if (includePinnedRoom && index === 0) {
        await this.conversationRepository.setUserPreference(conversation.id, participants[0], {
          isPinned: true,
          pinnedOrder: 2,
        });
      }

      return conversation;
    }));
  }

  /**
   * A reusable room holds at most one room conversation (uniq_room_conversation):
   * the previous run's, or the one the app opened for a test account sitting
   * in the room. Each seed gives the room a fresh `Test Room Conversation N
   * <run>`, so the existing one is deleted first, only when its participants
   * and members are all `allowedEmails` accounts (the delete cascades to its
   * members, messages, receipts, reactions, stars, and pins). A room
   * conversation involving anyone else fails the seed and is left untouched.
   */
  private async removeTestOnlyRoomConversations(
    spaceIds: readonly string[],
    allowedEmails: ReadonlySet<string>,
  ): Promise<void> {
    const { data: rooms, error } = await this.supabase
      .from('conversations')
      .select('id, participants')
      .eq('type', ConversationType.ROOM)
      .in('room_id', [...spaceIds])
      .overrideTypes<Array<{ id: string; participants: string[] | null }>, { merge: false }>();
    if (error) {
      throw new Error(`Failed to read room conversations of reusable test spaces: ${error.message}`);
    }
    if (!rooms || rooms.length === 0) {
      return;
    }

    const accountIds = await this.findTestAccountIds(allowedEmails);
    const foreignMembers = await this.findConversationsWithForeignMembers(
      rooms.map((room) => room.id),
      accountIds,
    );
    const foreign = rooms.filter(
      (room) =>
        foreignMembers.has(room.id) ||
        (room.participants ?? []).length === 0 ||
        !(room.participants ?? []).every((participant) => accountIds.has(participant)),
    );
    if (foreign.length > 0) {
      throw new Error(
        `Reusable test space room conversation ${foreign[0].id} involves a non-test account; remove it manually`,
      );
    }

    const { error: deleteError } = await this.supabase
      .from('conversations')
      .delete()
      .in('id', rooms.map((room) => room.id));
    if (deleteError) {
      throw new Error(`Failed to replace reusable test space room conversations: ${deleteError.message}`);
    }
  }

  private async createGroupConversation(participants: string[], runId: string, created: SeedRows) {
    const conversation = await this.conversationRepository.create({
      type: ConversationType.GROUP,
      participants,
      lastActivity: new Date(),
      name: `Test Group ${runId}`,
      isArchived: false,
      roomId: undefined,
      visibility: ConversationVisibility.PRIVATE,
    });
    created.conversationIds.push(conversation.id);
    return conversation;
  }

  /** Sequential inserts so each message gets a strictly later timestamp. */
  private async seedHistoryMessages(options: {
    conversationId: string;
    participants: string[];
    runId: string;
    count: number;
    created: SeedRows;
  }) {
    const { conversationId, participants, runId, count, created } = options;
    const messages = [];
    for (let index = 0; index < count; index += 1) {
      const message = await this.messageRepository.create({
        conversationId,
        senderId: participants[index % participants.length],
        content: `History ${String(index + 1).padStart(3, '0')} of ${count} for run ${runId}`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        replyToId: undefined,
      });
      created.messageIds.push(message.id);
      messages.push(message);
    }
    return messages;
  }

  private async seedInitialMessages(options: {
    conversationId: string;
    participants: string[];
    runId: string;
    created: SeedRows;
  }) {
    const { conversationId, participants, runId, created } = options;

    const intro = await this.messageRepository.create({
      conversationId,
      senderId: participants[0],
      content: `Seeded hello from automated run ${runId}`,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      replyToId: undefined,
    });
    created.messageIds.push(intro.id);

    const reply = await this.messageRepository.create({
      conversationId,
      senderId: participants[1] ?? participants[0],
      content: `Seeded reply for run ${runId}`,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      replyToId: intro.id,
    });
    created.messageIds.push(reply.id);

    return [intro, reply];
  }
}
