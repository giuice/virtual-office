// src/repositories/implementations/supabase/SupabaseSpaceReservationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { ISpaceReservationRepository } from '@/repositories/interfaces/ISpaceReservationRepository';
import { Reservation } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

function mapToCamelCase(data: any): Reservation {
  if (!data) return data; // Handle null/undefined input
  return {
    id: data.id,
    spaceId: data.space_id, // Added mapping
    userId: data.user_id,
    userName: data.user_name,
    startTime: data.start_time,
    endTime: data.end_time,
    purpose: data.purpose,
    createdAt: data.created_at // Added mapping
  };
}

export class SupabaseSpaceReservationRepository implements ISpaceReservationRepository {
  private TABLE_NAME = 'space_reservations';

  async findById(id: string): Promise<Reservation | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching reservation by ID:', error);
      throw error;
    }

    return data ? mapToCamelCase(data) : null;
  }

  async findBySpace(spaceId: string, options?: PaginationOptions): Promise<PaginatedResult<Reservation>> {
    const limit = options?.limit ?? 10;
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('space_id', spaceId)
      .order('start_time', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching reservations by space:', error);
      throw error;
    }

    const items = (data || []).map(mapToCamelCase);
    const nextCursor = items.length === limit ? to + 1 : null;

    return {
      items,
      nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined
    };
  }

  async findByUser(userId: string, options?: PaginationOptions): Promise<PaginatedResult<Reservation>> {
    const limit = options?.limit ?? 10;
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('start_time', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching reservations by user:', error);
      throw error;
    }

    const items = (data || []).map(mapToCamelCase);
    const nextCursor = items.length === limit ? to + 1 : null;

    return {
      items,
      nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined
    };
  }

  // Note: Omit now includes spaceId as it's part of the type but set here
  async create(reservationData: Omit<Reservation, 'id' | 'createdAt'>): Promise<Reservation> {
    const dbData = {
      space_id: reservationData.spaceId, // Added mapping
      user_id: reservationData.userId,
      user_name: reservationData.userName,
      start_time: reservationData.startTime,
      end_time: reservationData.endTime,
      purpose: reservationData.purpose
      // created_at is handled by Supabase default value
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating reservation:', error);
      throw error || new Error('Failed to create reservation or retrieve created data.');
    }

    return mapToCamelCase(data);
  }

  async update(id: string, updates: Partial<Omit<Reservation, 'id' | 'createdAt'>>): Promise<Reservation | null> {
    const dbUpdates: Record<string, any> = {};
    if (updates.userId !== undefined) dbUpdates.user_id = updates.userId;
    if (updates.userName !== undefined) dbUpdates.user_name = updates.userName;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.purpose !== undefined) dbUpdates.purpose = updates.purpose;

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating reservation:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data ? mapToCamelCase(data) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting reservation:', error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  async isSpaceAvailable(spaceId: string, startTime: string, endTime: string): Promise<boolean> {
    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .eq('space_id', spaceId)
      .or(`start_time.lte.${endTime},end_time.gte.${startTime}`);

    if (error) {
      console.error('Error checking space availability:', error);
      throw error;
    }

    return (count ?? 0) === 0;
  }
}
