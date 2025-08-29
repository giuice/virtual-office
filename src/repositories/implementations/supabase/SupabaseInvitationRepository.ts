// src/repositories/implementations/supabase/SupabaseInvitationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IInvitationRepository } from '@/repositories/interfaces/IInvitationRepository';
import { Invitation, UserRole } from '@/types/database'; // Import UserRole if needed

// Helper function to map DB snake_case to TS camelCase
// Handles timestamp conversions
type InvitationRow = {
  id: string;
  token: string;
  email: string;
  company_id: string;
  role: string;
  expires_at: string | null;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
};
function mapToCamelCase(data: InvitationRow | null): Invitation | null {
  if (!data) return null;
  return {
    id: data.id,
    token: data.token,
    email: data.email,
    companyId: data.company_id,
    role: data.role as UserRole, // Cast if needed
    // Convert TIMESTAMPTZ from DB to Unix timestamp (number) for expiresAt
    expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : 0, // Handle potential null/undefined, provide default
    status: data.status as 'pending' | 'accepted' | 'expired', // Cast if needed
    // Convert TIMESTAMPTZ from DB to ISO string for createdAt
    createdAt: data.created_at ? new Date(data.created_at).toISOString() : '' // Handle potential null/undefined, provide default
  };
}

// Helper function to map an array (though likely not needed for this repo)
// function mapArrayToCamelCase(dataArray: any[]): Invitation[] {
//   if (!dataArray) return [];
//   return dataArray.map(item => mapToCamelCase(item));
// }


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
    // Map DB response (snake_case) to Invitation type (camelCase)
  return data ? mapToCamelCase(data) : null;
  }

  // Note: Input type expects expiresAt as number (Unix timestamp)
  async create(invitationData: Omit<Invitation, 'id' | 'createdAt' | 'status'>): Promise<Invitation> {
    // Map Invitation type (camelCase) to DB schema (snake_case)
    // Convert expiresAt (number) to ISO string for Supabase TIMESTAMPTZ
    const dbData = {
        token: invitationData.token,
        email: invitationData.email,
        company_id: invitationData.companyId,
        role: invitationData.role,
        expires_at: new Date(invitationData.expiresAt).toISOString(), // Convert number to ISO string
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
    // Map DB response back to Invitation type
    const mapped = mapToCamelCase(data);
    if (!mapped) throw new Error('Failed to map created invitation');
    return mapped;
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
    // Map DB response back to Invitation type
  return data ? mapToCamelCase(data) : null;
  }

  // Optional: Implement deleteByToken if needed
  // async deleteByToken(token: string): Promise<boolean> { ... }

}
