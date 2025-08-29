// src/repositories/implementations/supabase/SupabaseUserServerRepository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { User, UserRole, UserStatus } from '@/types/database';

type DbUserRaw = {
  id: string;
  company_id: string;
  supabase_uid: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  status: UserStatus;
  status_message?: string | null;
  preferences?: Record<string, unknown> | null;
  role: UserRole;
  last_active: string;
  created_at: string;
  current_space_id?: string | null;
};

// Helper to map DB snake_case to TS camelCase
function mapToCamelCase(d: DbUserRaw): User {
  return {
    id: d.id,
    companyId: d.company_id,
    supabase_uid: d.supabase_uid,
    email: d.email,
    displayName: d.display_name,
    avatarUrl: d.avatar_url ?? undefined,
    status: d.status,
    statusMessage: d.status_message ?? undefined,
    preferences: (d.preferences as unknown as User['preferences']) || {},
    role: d.role,
    lastActive: d.last_active,
    createdAt: d.created_at,
    current_space_id: d.current_space_id ?? null,
  };
}

function mapArrayToCamelCase(dataArray: DbUserRaw[]): User[] {
  if (!dataArray) return [];
  return dataArray.map((item) => mapToCamelCase(item));
}

/**
 * Server-side Supabase repository using an injected server client instance.
 * Use this from API routes or server code where you already have a server client
 * with appropriate session or service role permissions.
 */
export class SupabaseUserServerRepository implements IUserRepository {
  private TABLE_NAME = 'users';
  private supabase: SupabaseClient; // SSR or service role client

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SupabaseUserServerRepository] Error fetching user by ID:', error);
      throw error;
    }
    return data ? mapToCamelCase(data as DbUserRaw) : null;
  }

  async findBySupabaseUid(supabaseUid: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('supabase_uid', supabaseUid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SupabaseUserServerRepository] Error fetching user by supabase_uid:', error);
      throw error;
    }
    return data ? mapToCamelCase(data as DbUserRaw) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SupabaseUserServerRepository] Error fetching user by email:', error);
      throw error;
    }
    return data ? mapToCamelCase(data as DbUserRaw) : null;
  }

  async findByCompany(companyId: string): Promise<User[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('company_id', companyId);

    if (error) {
      console.error('[SupabaseUserServerRepository] Error fetching users by company:', error);
      throw error;
    }
    return mapArrayToCamelCase((data as DbUserRaw[]) || []);
  }

  async create(userData: Omit<User, 'id' | 'createdAt' | 'lastActive'>): Promise<User> {
    const dbData = {
      company_id: userData.companyId,
      email: userData.email,
      display_name: userData.displayName,
      avatar_url: userData.avatarUrl,
      status: userData.status,
      status_message: userData.statusMessage,
      preferences: userData.preferences || {},
      role: userData.role,
      supabase_uid: userData.supabase_uid,
    };

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('[SupabaseUserServerRepository] Error creating user:', error);
      throw error || new Error('Failed to create user or retrieve created data.');
    }
    return mapToCamelCase(data as DbUserRaw);
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
  const { companyId, displayName, avatarUrl, statusMessage, supabase_uid, ...rest } = updates;
  const dbUpdates: Record<string, unknown> = { ...rest };

    if (companyId !== undefined) dbUpdates.company_id = companyId;
    if (displayName !== undefined) dbUpdates.display_name = displayName;
    if (avatarUrl !== undefined) dbUpdates.avatar_url = avatarUrl;
    if (statusMessage !== undefined) dbUpdates.status_message = statusMessage;
    if (supabase_uid !== undefined) dbUpdates.supabase_uid = supabase_uid;
    dbUpdates.last_active = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[SupabaseUserServerRepository] Error updating user:', error);
      throw error;
    }
    return data ? mapToCamelCase(data as DbUserRaw) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupabaseUserServerRepository] Error deleting user:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async updateCompanyAssociation(userId: string, companyId: string | null): Promise<User | null> {
    return this.update(userId, { companyId: companyId === null ? undefined : companyId });
  }

  async updateLocation(userId: string, spaceId: string | null): Promise<User | null> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update({ current_space_id: spaceId, last_active: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[SupabaseUserServerRepository] Error updating current_space_id:', error);
      throw error;
    }
    return data ? mapToCamelCase(data as DbUserRaw) : null;
  }

  async findAll(): Promise<User[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*');

    if (error) {
      console.error('[SupabaseUserServerRepository] Error fetching all users:', error);
      throw error;
    }
    return mapArrayToCamelCase((data as DbUserRaw[]) || []);
  }
}
