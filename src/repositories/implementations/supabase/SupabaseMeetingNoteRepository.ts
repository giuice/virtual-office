// src/repositories/implementations/supabase/SupabaseMeetingNoteRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import { MeetingNote } from '@/types/database'; // Removed ActionItem import here
import { PaginationOptions, PaginatedResult } from '@/types/common';

// Helper function to map DB snake_case to TS camelCase for MeetingNote
// Note: This does NOT include actionItems, as they are in a separate table.
function mapToCamelCase(data: any): MeetingNote {
  if (!data) return data;
  return {
    id: data.id,
    roomId: data.room_id,
    title: data.title,
    meetingDate: data.meeting_date,
    transcript: data.transcript,
    summary: data.summary,
    // actionItems: undefined, // Explicitly undefined or omitted
    generatedBy: data.generated_by,
    editedBy: data.edited_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): MeetingNote[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseMeetingNoteRepository implements IMeetingNoteRepository {
  private TABLE_NAME = 'meeting_notes'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<MeetingNote | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*') // Select only columns from meeting_notes table
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching meeting note by ID:', error);
      throw error;
    }
    // Map DB response (snake_case) to MeetingNote type (camelCase)
    // Action items must be fetched separately using IMeetingNoteActionItemRepository if needed.
    return data ? mapToCamelCase(data) : null;
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

    // Map DB response array
    const items = mapArrayToCamelCase(data || []);
    const nextCursor = items.length === limit ? to + 1 : null;

    // Action items must be fetched separately for each note if needed.

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined,
    };
  }

  // Note: actionItems are handled by the separate repository
  async create(noteData: Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt' | 'actionItems'>): Promise<MeetingNote> {
    // Map MeetingNote type (camelCase) to DB schema (snake_case)
    const dbData = {
        room_id: noteData.roomId,
        title: noteData.title,
        meeting_date: noteData.meetingDate,
        transcript: noteData.transcript,
        summary: noteData.summary,
        // action_items are NOT stored here
        generated_by: noteData.generatedBy,
        edited_by: noteData.editedBy,
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
    // Map DB response back to MeetingNote type
    // Note: Created action items must be handled separately using the other repository.
    return mapToCamelCase(data);
  }

  // Note: actionItems updates must be handled by the separate repository
  async update(id: string, updates: Partial<Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt' | 'actionItems'>>): Promise<MeetingNote | null> {
    // Map updates from camelCase to snake_case
    const { roomId, meetingDate, generatedBy, editedBy, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates }; // title, transcript, summary
    if (roomId !== undefined) dbUpdates.room_id = roomId;
    if (meetingDate !== undefined) dbUpdates.meeting_date = meetingDate;
    // actionItems are NOT updated here
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
    // Map DB response back to MeetingNote type
    // Note: Updated action items must be handled separately.
    return data ? mapToCamelCase(data) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    // Note: Deleting a note should ideally cascade delete related action items
    // in the DB schema (ON DELETE CASCADE). If not, they need to be deleted manually
    // using the IMeetingNoteActionItemRepository before or after this call.
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
