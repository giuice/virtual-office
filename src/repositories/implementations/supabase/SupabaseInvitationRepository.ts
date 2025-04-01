// src/repositories/implementations/supabase/SupabaseInvitationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IInvitationRepository } from '@/repositories/interfaces/IInvitationRepository';
import { Invitation } from '@/types/database';

export class SupabaseInvitationRepository implements IInvitationRepository {
  private TABLE_NAME = 'invitations'; // Ensure this matches your Supabase table name

  async findByToken(token: string): Promise<Invitation | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('token', token) // Assuming 'token' is the primary key or unique
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching invitation by token:', error);
      throw error;
    }
    // TODO: Map DB response (snake_case) to Invitation type (camelCase) if needed
    return data as Invitation | null;
  }

  async create(invitationData: Omit<Invitation, 'createdAt' | 'status'>): Promise<Invitation> {
    // TODO: Map Invitation type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        token: invitationData.token,
        email: invitationData.email,
        company_id: invitationData.companyId, // Assuming snake_case
        role: invitationData.role,
        expires_at: invitationData.expiresAt, // Assuming snake_case and number/timestamp type
        status: 'pending', // Set initial status
        // created_at handled by Supabase default value
    };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating invitation:', error);
      throw error || new Error('Failed to create invitation or retrieve created data.');
    }
    // TODO: Map DB response back to Invitation type if needed
    return data as Invitation;
  }

  async updateStatus(token: string, status: Invitation['status']): Promise<Invitation | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update({ status: status })
      .eq('token', token)
      .select()
      .single();

    if (error) {
      console.error('Error updating invitation status:', error);
      if (error.code === 'PGRST116') return null; // Row not found
      throw error;
    }
    // TODO: Map DB response back to Invitation type if needed
    return data as Invitation | null;
  }

  // Optional: Implement deleteByToken if needed
  // async deleteByToken(token: string): Promise<boolean> { ... }

}