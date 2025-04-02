// src/repositories/implementations/supabase/SupabaseMeetingNoteActionItemRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IMeetingNoteActionItemRepository, ActionItemRecord } from '@/repositories/interfaces/IMeetingNoteActionItemRepository';
import { ActionItem } from '@/types/database'; // Base type without DB fields

// Helper function to map DB snake_case to TS camelCase
function mapToCamelCase(data: any): ActionItemRecord {
  if (!data) return data;
  return {
    id: data.id,
    noteId: data.note_id,
    description: data.description,
    assignee: data.assignee_id, // Map assignee_id to assignee
    dueDate: data.due_date,     // Map due_date to dueDate
    completed: data.completed,
    createdAt: data.created_at
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): ActionItemRecord[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}

export class SupabaseMeetingNoteActionItemRepository implements IMeetingNoteActionItemRepository {
  private TABLE_NAME = 'meeting_note_action_items'; // Ensure this matches your Supabase table name

  async findByNoteId(noteId: string): Promise<ActionItemRecord[]> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('note_id', noteId) // Filter by note_id
      .order('created_at', { ascending: true }); // Optional: order by creation time

    if (error) {
      console.error(`Error fetching action items for note ID ${noteId}:`, error);
      throw error;
    }

    return mapArrayToCamelCase(data || []);
  }

  async create(noteId: string, actionItemData: Omit<ActionItemRecord, 'id' | 'noteId' | 'createdAt'>): Promise<ActionItemRecord> {
    // Map camelCase ActionItem type to snake_case DB schema
    const dbData = {
      note_id: noteId, // Set the foreign key
      description: actionItemData.description,
      assignee_id: actionItemData.assignee, // Map assignee to assignee_id
      due_date: actionItemData.dueDate,     // Map dueDate to due_date
      completed: actionItemData.completed,
      // created_at handled by Supabase default value
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating action item:', error);
      throw error || new Error('Failed to create action item or retrieve created data.');
    }

    return mapToCamelCase(data);
  }

  async update(id: string, updates: Partial<Omit<ActionItemRecord, 'id' | 'noteId' | 'createdAt'>>): Promise<ActionItemRecord | null> {
    // Map camelCase updates to snake_case DB schema
    const { assignee, dueDate, ...restUpdates } = updates;
    const dbUpdates: Record<string, any> = { ...restUpdates }; // Start with fields that match casing (description, completed)
    if (assignee !== undefined) dbUpdates.assignee_id = assignee;
    if (dueDate !== undefined) dbUpdates.due_date = dueDate;

    if (Object.keys(dbUpdates).length === 0) {
        // If no fields to update, fetch and return current state
        const current = await this.findByIdInternal(id); // Use internal helper to avoid infinite loop if findById uses this repo
        return current ? mapToCamelCase(current) : null;
    }


    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating action item ID ${id}:`, error);
      if (error.code === 'PGRST116') return null; // Row not found
      throw error;
    }

    return mapToCamelCase(data);
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting action item ID ${id}:`, error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async deleteByNoteId(noteId: string): Promise<number> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('note_id', noteId); // Delete based on the note_id

    if (error) {
      console.error(`Error deleting action items for note ID ${noteId}:`, error);
      // Depending on requirements, you might want to throw or return 0/negative number
      return 0;
    }
    return count ?? 0;
  }

  // Internal helper to fetch raw data without mapping, useful for update check
  private async findByIdInternal(id: string): Promise<any | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Internal error fetching action item by ID:', error);
      // Don't throw here, let the caller handle it if needed
    }
    return data;
  }
}
