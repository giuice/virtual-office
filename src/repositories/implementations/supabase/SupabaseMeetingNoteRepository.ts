// src/repositories/implementations/supabase/SupabaseMeetingNoteRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import { MeetingNote, ActionItem } from '@/types/database'; // Assuming ActionItem is defined
import { PaginationOptions, PaginatedResult } from '@/types/common';

export class SupabaseMeetingNoteRepository implements IMeetingNoteRepository {
  private TABLE_NAME = 'meeting_notes'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<MeetingNote | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*') // Action items likely stored as JSONB, fetched directly
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching meeting note by ID:', error);
      throw error;
    }
    // TODO: Map DB response (snake_case) to MeetingNote type (camelCase) if needed
    return data as MeetingNote | null;
  }

  async findByRoom(roomId: string, options?: PaginationOptions): Promise<PaginatedResult<MeetingNote>> {
    const limit = options?.limit ?? 10;
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    // Query meeting notes for the room, ordered by meeting date descending
    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('room_id', roomId) // Assuming snake_case
      .order('meeting_date', { ascending: false }) // Assuming snake_case
      .range(from, to);

    if (error) {
      console.error('Error fetching meeting notes by room:', error);
      throw error;
    }

    const items = (data as MeetingNote[]) || [];
    const nextCursor = items.length === limit ? to + 1 : null;

    // TODO: Map DB response array if needed

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined,
    };
  }

  async create(noteData: Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeetingNote> {
    // TODO: Map MeetingNote type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        room_id: noteData.roomId, // Assuming snake_case
        title: noteData.title,
        meeting_date: noteData.meetingDate, // Assuming snake_case & timestamp type
        transcript: noteData.transcript,
        summary: noteData.summary,
        action_items: noteData.actionItems, // Assuming JSONB column
        generated_by: noteData.generatedBy, // Assuming snake_case
        edited_by: noteData.editedBy, // Assuming snake_case
        // createdAt/updatedAt handled by Supabase defaults/triggers
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating meeting note:', error);
      throw error || new Error('Failed to create meeting note or retrieve created data.');
    }
    // TODO: Map DB response back to MeetingNote type if needed
    return data as MeetingNote;
  }

  async update(id: string, updates: Partial<Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<MeetingNote | null> {
    // TODO: Map updates if needed (e.g., roomId to room_id)
    const { roomId, meetingDate, actionItems, generatedBy, editedBy, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates };
    if (roomId !== undefined) dbUpdates.room_id = roomId;
    if (meetingDate !== undefined) dbUpdates.meeting_date = meetingDate;
    if (actionItems !== undefined) dbUpdates.action_items = actionItems; // Update the whole JSONB array
    if (generatedBy !== undefined) dbUpdates.generated_by = generatedBy;
    if (editedBy !== undefined) dbUpdates.edited_by = editedBy;
    // updatedAt handled by Supabase trigger ideally

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating meeting note:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // TODO: Map DB response back to MeetingNote type if needed
    return data as MeetingNote | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting meeting note:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

}