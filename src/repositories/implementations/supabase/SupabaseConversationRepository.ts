// src/repositories/implementations/supabase/SupabaseConversationRepository.ts
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { Conversation, ConversationType, ConversationVisibility, ConversationPreferences, GroupedConversations, UnreadSummary } from '@/types/messaging';
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
  unread_count: Record<string, number> | null;
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
    unreadCount: data.unread_count || {},
    roomId: data.room_id || undefined,
    visibility: (data.visibility as ConversationVisibility) || ConversationVisibility.PUBLIC,
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: ConversationRow[]): Conversation[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
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

      // Query conversations where the user is a participant
      let query = this.supabaseClient
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact' })
        .contains('participants', [userId])
        .order('last_activity', { ascending: false });

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      if (!options?.includeArchived) {
        query = query.eq('is_archived', false);
      }

      const { data, error, count } = await query.range(from, to);

      if (error) {
        console.error('Error fetching conversations by user:', error);
        throw error;
      }

      // Map DB response array
      const items = mapArrayToCamelCase((data as ConversationRow[]) || []);
      const nextCursor = items.length === limit ? (to + 1).toString() : null;

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
        unread_count: {}, // Initialize empty unread count
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

  async markAsRead(id: string, userId: string): Promise<boolean> {
    try {
      // For simplicity, we'll implement it directly without RPC
      // First, get the current conversation to access the unread_count
      const { data: conversation, error: fetchError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('unread_count')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching conversation for markAsRead:', fetchError);
        return false;
      }
      
      if (!conversation) {
        return false;
      }
      
      // Create a new unread_count object without the user's entry
      const unreadCount = { ...(conversation.unread_count || {}) };
      delete unreadCount[userId];
      
      // Update the conversation with the new unread_count
      const { error: updateError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update({ unread_count: unreadCount })
        .eq('id', id);
        
      if (updateError) {
        console.error('Error updating unread_count in markAsRead:', updateError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Repository error in markAsRead(${id}, ${userId}):`, error);
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

  async incrementUnreadCount(id: string, userIdsToIncrement: string[]): Promise<boolean> {
    try {
      // For simplicity, we'll implement it directly without RPC
      // First, get the current conversation to access the unread_count
      const { data: conversation, error: fetchError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('unread_count')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching conversation for incrementUnreadCount:', fetchError);
        return false;
      }
      
      if (!conversation) {
        return false;
      }
      
      // Create a new unread_count object with incremented counts
      const unreadCount = { ...(conversation.unread_count || {}) };
      
      for (const userId of userIdsToIncrement) {
        unreadCount[userId] = (unreadCount[userId] || 0) + 1;
      }
      
      // Update the conversation with the new unread_count
      const { error: updateError } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .update({ unread_count: unreadCount })
        .eq('id', id);
        
      if (updateError) {
        console.error('Error updating unread_count in incrementUnreadCount:', updateError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Repository error in incrementUnreadCount(${id}, ${userIdsToIncrement}):`, error);
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
        .from('conversation_preferences')
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
        .from('conversation_preferences')
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

  async findByUserGrouped(
    userId: string,
    options?: { includeArchived?: boolean }
  ): Promise<GroupedConversations> {
    try {
      // Join conversations with user preferences to respect per-user archive status
      // We need to get all conversations where user is a participant
      // and optionally filter by archive status from preferences

      // First, get all conversations for the user
      const conversationsQuery = this.supabaseClient
        .from(this.TABLE_NAME)
        .select(`
          *,
          conversation_preferences!left(
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
        `)
        .contains('participants', [userId])
        .order('last_activity', { ascending: false });

      const { data, error } = await conversationsQuery;

      if (error) {
        console.error('Error fetching grouped conversations:', error);
        throw error;
      }

      if (!data) {
        return { direct: [], rooms: [] };
      }

      // Process results and group by type
      const direct: Conversation[] = [];
      const rooms: Conversation[] = [];

      for (const row of data) {
        // Find the user's preference (join result is an array)
        const userPrefs = Array.isArray(row.conversation_preferences)
          ? row.conversation_preferences.find((pref: any) => pref.user_id === userId)
          : row.conversation_preferences?.user_id === userId ? row.conversation_preferences : null;

        // Filter by archive status if needed
        if (!options?.includeArchived) {
          // Check per-user archive preference if it exists, otherwise check global
          const isArchived = userPrefs?.is_archived ?? row.is_archived ?? false;
          if (isArchived) {
            continue; // Skip archived conversations
          }
        }

        // Map conversation with preferences
        const conversation = mapToCamelCase(row as ConversationRow);
        if (userPrefs) {
          conversation.preferences = mapPreferencesToCamelCase(userPrefs);
        }

        // Group by type
        if (conversation.type === ConversationType.DIRECT) {
          direct.push(conversation);
        } else if (conversation.type === ConversationType.ROOM) {
          rooms.push(conversation);
        }
      }

      return { direct, rooms };
    } catch (error) {
      console.error(`Repository error in findByUserGrouped(${userId}):`, error);
      throw error;
    }
  }

  async findPinnedByUser(userId: string): Promise<Conversation[]> {
    try {
      // Join conversations with preferences where is_pinned = true
      // Order by pinned_order ascending (lower numbers first)
      const { data, error } = await this.supabaseClient
        .from('conversation_preferences')
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

  async getUnreadSummary(userId: string): Promise<UnreadSummary> {
    try {
      // Get all conversations where the user is a participant
      const { data, error } = await this.supabaseClient
        .from(this.TABLE_NAME)
        .select('type, unread_count')
        .contains('participants', [userId]);

      if (error) {
        console.error('Error fetching unread summary:', error);
        throw error;
      }

      if (!data) {
        return {
          totalUnread: 0,
          directUnread: 0,
          roomUnread: 0,
        };
      }

      // Aggregate unread counts by type
      let totalUnread = 0;
      let directUnread = 0;
      let roomUnread = 0;

      for (const row of data) {
        const unreadCount = row.unread_count as Record<string, number> | null;
        const userUnread = unreadCount?.[userId] || 0;

        totalUnread += userUnread;

        if (row.type === ConversationType.DIRECT) {
          directUnread += userUnread;
        } else if (row.type === ConversationType.ROOM) {
          roomUnread += userUnread;
        }
      }

      return {
        totalUnread,
        directUnread,
        roomUnread,
      };
    } catch (error) {
      console.error(`Repository error in getUnreadSummary(${userId}):`, error);
      throw error;
    }
  }
}
