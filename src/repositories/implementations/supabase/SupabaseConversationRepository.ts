// src/repositories/implementations/supabase/SupabaseConversationRepository.ts
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { Conversation, ConversationType, ConversationVisibility, ConversationPreferences } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';
import { SupabaseClient } from '@supabase/supabase-js';

// Helper function to map DB snake_case to TS camelCase
type ConversationRow = {
  id: string;
  type: string;
  participants: string[] | null;
  last_activity: string | null;
  name: string | null;
  is_archived: boolean | null;
  room_id: string | null;
  visibility: string | null;
  participants_fingerprint: string | null;
};
function mapToCamelCase(data: ConversationRow): Conversation {

  // Ensure we have the correct structure with necessary checks
  return {
    id: data.id,
    type: data.type as ConversationType,
    participants: data.participants || [],
    lastActivity: data.last_activity ? new Date(data.last_activity) : new Date(),
    name: data.name || undefined,
    isArchived: Boolean(data.is_archived),
    // Viewer's unread count is server-computed (get_unread_counts RPC) and
    // only attached in findByUser; other read paths don't need it.
    unreadCount: 0,
    roomId: data.room_id || undefined,
    visibility: (data.visibility as ConversationVisibility) || ConversationVisibility.PUBLIC,
  };
}

// ConversationPreferences row type
type ConversationPreferencesRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_pinned: boolean;
  pinned_order: number | null;
  is_starred: boolean;
  is_archived: boolean;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

// Mapper for ConversationPreferences
function mapPreferencesToCamelCase(data: ConversationPreferencesRow): ConversationPreferences {
  return {
    id: data.id,
    conversationId: data.conversation_id,
    userId: data.user_id,
    isPinned: data.is_pinned,
    pinnedOrder: data.pinned_order,
    isStarred: data.is_starred,
    isArchived: data.is_archived,
    notificationsEnabled: data.notifications_enabled,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

function getPreferenceForUser(
  preferences: ConversationPreferencesRow[] | ConversationPreferencesRow | null | undefined,
  userId: string
): ConversationPreferencesRow | null {
  if (Array.isArray(preferences)) {
    for (const preference of preferences) {
      if (preference.user_id === userId) {
        return preference;
      }
    }
    return null;
  }

  return preferences?.user_id === userId ? preferences : null;
}


export class SupabaseConversationRepository implements IConversationRepository {
  private TABLE_NAME = 'conversations';
  private supabaseClient: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabaseClient = supabaseClient;
  } 

  async findById(id: string): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - not an error, just no data
          return null;
        }
        console.error('Error fetching conversation by ID:', error);
        throw error;
      }
      
  return data ? mapToCamelCase(data as ConversationRow) : null;
    } catch (error) {
      console.error(`Repository error in findById(${id}):`, error);
      throw error;
    }
  }

  async findByUser(
    userId: string,
    options?: PaginationOptions & { type?: ConversationType; includeArchived?: boolean }
  ): Promise<PaginatedResult<Conversation>> {
    try {
      const rawLimit = options?.limit;
      const limit = Number.isFinite(rawLimit) && rawLimit ? Number(rawLimit) : 20;
      // Supabase range is inclusive [from, to]
      const cursorValue = options?.cursor;
      let offset = 0;
      if (typeof cursorValue === 'number') {
        offset = cursorValue;
      } else if (typeof cursorValue === 'string' && cursorValue.trim() !== '') {
        const parsed = Number.parseInt(cursorValue, 10);
        offset = Number.isNaN(parsed) ? 0 : parsed;
      }

      const from = offset;
      const to = from + limit - 1;

      // Query conversations where the user is a participant, including the
      // user's member row (pin/star/archive prefs + read cursor)
      let query = this.supabaseClient
        .from(this.TABLE_NAME)
        .select(`
          *,
          conversation_members!left(
            id,
            conversation_id,
            user_id,
            is_pinned,
            pinned_order,
            is_starred,
            is_archived,
            notifications_enabled,
            created_at,
            updated_at
          )
        `, { count: 'exact' })
        .contains('participants', [userId])
        .order('last_activity', { ascending: false });

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      const { data, error, count } = await query.range(from, to);

      if (error) {
        console.error('Error fetching conversations by user:', error);
        throw error;
      }

      // Map DB response array with preferences
      const items: Conversation[] = [];
      for (const row of (data || [])) {
        const userPrefs = getPreferenceForUser(row.conversation_members, userId);

        // Audit M-02: archiving is per-user — the archive route writes
        // conversation_preferences.is_archived, so that is what hides a
        // conversation here. The global column only acts as a fallback.
        if (!options?.includeArchived) {
          const isArchived = userPrefs?.is_archived ?? row.is_archived ?? false;
          if (isArchived) continue;
        }

        const conversation = mapToCamelCase(row as ConversationRow);
        if (userPrefs) {
          conversation.preferences = mapPreferencesToCamelCase(userPrefs);
        }
        // Serialize the effective per-user archive state so the client reads
        // one coherent flag.
        conversation.isArchived = userPrefs?.is_archived ?? conversation.isArchived ?? false;

        items.push(conversation);
      }

      // Attach the viewer's unread counts in one aggregate RPC (no N+1).
      // The RPC derives the viewer from auth.uid(), so this only yields
      // counts when the repository was built with the user-scoped client;
      // service-role callers get 0s, which is fine for non-viewer flows.
      if (items.length > 0) {
        const { data: counts, error: countsError } = await this.supabaseClient
          .rpc('get_unread_counts', { p_conversation_ids: items.map((c) => c.id) });

        if (countsError) {
          console.error('Error fetching unread counts:', countsError);
        } else if (Array.isArray(counts)) {
          const countByConversation = new Map<string, number>(
            counts.map((row: { conversation_id: string; unread_count: number }) => [
              row.conversation_id,
              Number(row.unread_count) || 0,
            ])
          );
          for (const conversation of items) {
            conversation.unreadCount = countByConversation.get(conversation.id) ?? 0;
          }
        }
      }

      // Advance the cursor by rows consumed (not rows kept after the
      // per-user archive filter), or pagination would skip records.
      const nextCursor = (data?.length ?? 0) === limit ? (to + 1).toString() : null;

      return {
        items,
        nextCursor: nextCursor,
        hasMore: nextCursor !== null,
        totalCount: count ?? undefined,
      };
    } catch (error) {
      console.error(`Repository error in findByUser(${userId}):`, error);
      throw error;
    }
  }

  async create(
    conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> & {
      participantsFingerprint?: string;
    }
  ): Promise<Conversation> {
    try {
      console.log('Repository creating conversation with data:', JSON.stringify(conversationData, null, 2));
      
      // Map Conversation type (camelCase) to DB schema (snake_case)
      const dbData = {
        type: conversationData.type,
        participants: Array.isArray(conversationData.participants) ? conversationData.participants : [],
        name: conversationData.name || null,
        is_archived: conversationData.isArchived || false,
        room_id: conversationData.roomId || null,
        visibility: conversationData.visibility || ConversationVisibility.PUBLIC,
        // last_activity needs to be set explicitly to ensure consistency
        last_activity: conversationData.lastActivity instanceof Date
          ? conversationData.lastActivity.toISOString()
          : (conversationData.lastActivity || new Date().toISOString()),
        participants_fingerprint: conversationData.participantsFingerprint || null,
      };

      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .insert(dbData)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase error creating conversation:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new Error('Failed to retrieve created conversation data');
      }
      
      console.log('Created conversation in database:', JSON.stringify(data, null, 2));
      
      // Map DB response back to Conversation type
      return mapToCamelCase(data);
    } catch (error) {
      console.error('Repository error in create():', error);
      throw error;
    }
  }

  async update(id: string, updates: Partial<Pick<Conversation, 'name' | 'lastActivity'>>): Promise<Conversation | null> {
    try {
      // Map updates from camelCase to snake_case
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.lastActivity !== undefined) dbUpdates.last_activity = updates.lastActivity;

      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating conversation:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in update(${id}):`, error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting conversation:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Repository error in deleteById(${id}):`, error);
      throw error;
    }
  }

  async setArchiveStatus(id: string, isArchived: boolean): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update({ is_archived: isArchived })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error setting archive status:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in setArchiveStatus(${id}, ${isArchived}):`, error);
      throw error;
    }
  }

  async markConversationRead(id: string, userId: string): Promise<boolean> {
    try {
      // Atomic: sets conversation_members.last_read_at AND inserts
      // message_read_receipts for everything the user just saw, in one
      // transaction. The RPC is service-role only; the route authorizes the
      // user via requireConversationParticipant before calling this.
      const { error } = await this.supabaseClient.rpc('mark_conversation_read', {
        p_conversation_id: id,
        p_user_id: userId,
      });

      if (error) {
        console.error('Error in mark_conversation_read RPC:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Repository error in markConversationRead(${id}, ${userId}):`, error);
      throw error;
    }
  }

  async updateLastActivityTimestamp(id: string, timestamp?: string): Promise<Conversation | null> {
    try {
      const activityTimestamp = timestamp || new Date().toISOString();
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update({
          last_activity: activityTimestamp
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating last activity timestamp:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in updateLastActivityTimestamp(${id}):`, error);
      throw error;
    }
  }

  async addParticipant(id: string, userId: string): Promise<Conversation | null> {
    try {
      // Fetch current participants
      const { data: conversation, error: fetchError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('participants')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching conversation for addParticipant:', fetchError);
        return null;
      }

      const participants: string[] = Array.isArray(conversation?.participants) ? conversation.participants : [];
      if (participants.includes(userId)) {
        // Already a participant; return current conversation state
        const existing = await this.findById(id);
        return existing;
      }

      const updatedParticipants = [...participants, userId];

      const { data: updated, error: updateError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update({ participants: updatedParticipants })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) {
        console.error('Error updating participants in addParticipant:', updateError);
        return null;
      }

      return updated ? mapToCamelCase(updated as ConversationRow) : null;
    } catch (error) {
      console.error(`Repository error in addParticipant(${id}, ${userId}):`, error);
      throw error;
    }
  }

  async findDirectByFingerprint(fingerprint: string): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('type', ConversationType.DIRECT)
        .eq('participants_fingerprint', fingerprint)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching direct conversation by fingerprint:', error);
        throw error;
      }

      return data ? mapToCamelCase(data as ConversationRow) : null;
    } catch (error) {
      console.error(`Repository error in findDirectByFingerprint(${fingerprint}):`, error);
      throw error;
    }
  }

  async findRoomByRoomId(roomId: string): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('*')
        .eq('type', ConversationType.ROOM)
        .eq('room_id', roomId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching room conversation by roomId:', error);
        throw error;
      }

      return data ? mapToCamelCase(data as ConversationRow) : null;
    } catch (error) {
      console.error(`Repository error in findRoomByRoomId(${roomId}):`, error);
      throw error;
    }
  }

  // ============================================================================
  // NEW METHODS: Per-user Conversation Preferences (Task 1.2)
  // ============================================================================

  async setUserPreference(
    conversationId: string,
    userId: string,
    preferences: Partial<Omit<ConversationPreferences, 'id' | 'conversationId' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ConversationPreferences> {
    try {
      // Map camelCase to snake_case for DB
      const dbPreferences: any = {};
      if (preferences.isPinned !== undefined) dbPreferences.is_pinned = preferences.isPinned;
      if (preferences.pinnedOrder !== undefined) dbPreferences.pinned_order = preferences.pinnedOrder;
      if (preferences.isStarred !== undefined) dbPreferences.is_starred = preferences.isStarred;
      if (preferences.isArchived !== undefined) dbPreferences.is_archived = preferences.isArchived;
      if (preferences.notificationsEnabled !== undefined) dbPreferences.notifications_enabled = preferences.notificationsEnabled;

      // Always set updated_at
      dbPreferences.updated_at = new Date().toISOString();

      // Upsert: insert if not exists, update if exists
      const { data, error } = await this.supabaseClient
        .from('conversation_members')
        .upsert(
          {
            conversation_id: conversationId,
            user_id: userId,
            ...dbPreferences,
          },
          {
            onConflict: 'conversation_id,user_id',
          }
        )
        .select('*')
        .single();

      if (error) {
        console.error('Error setting user preference:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Failed to retrieve user preference after upsert');
      }

      return mapPreferencesToCamelCase(data as ConversationPreferencesRow);
    } catch (error) {
      console.error(`Repository error in setUserPreference(${conversationId}, ${userId}):`, error);
      throw error;
    }
  }

  async getUserPreference(conversationId: string, userId: string): Promise<ConversationPreferences | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from('conversation_members')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching user preference:', error);
        throw error;
      }

      return data ? mapPreferencesToCamelCase(data as ConversationPreferencesRow) : null;
    } catch (error) {
      console.error(`Repository error in getUserPreference(${conversationId}, ${userId}):`, error);
      throw error;
    }
  }

  async findPinnedByUser(userId: string): Promise<Conversation[]> {
    try {
      // Join conversations with preferences where is_pinned = true
      // Order by pinned_order ascending (lower numbers first)
      const { data, error } = await this.supabaseClient
        .from('conversation_members')
        .select(`
          *,
          conversations:conversation_id (*)
        `)
        .eq('user_id', userId)
        .eq('is_pinned', true)
        .order('pinned_order', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('Error fetching pinned conversations:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Map the joined results to Conversation objects with preferences
      const pinnedConversations: Conversation[] = [];
      for (const row of data) {
        if (row.conversations) {
          const conversation = mapToCamelCase(row.conversations as any);
          conversation.preferences = mapPreferencesToCamelCase(row as ConversationPreferencesRow);
          pinnedConversations.push(conversation);
        }
      }

      return pinnedConversations;
    } catch (error) {
      console.error(`Repository error in findPinnedByUser(${userId}):`, error);
      throw error;
    }
  }

}
