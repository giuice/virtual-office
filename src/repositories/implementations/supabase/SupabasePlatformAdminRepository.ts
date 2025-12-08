// src/repositories/implementations/supabase/SupabasePlatformAdminRepository.ts
// Story: story-platform-admin

import { SupabaseClient } from '@supabase/supabase-js';
import { IPlatformAdminRepository } from '@/repositories/interfaces/IPlatformAdminRepository';
import { PlatformAdmin } from '@/types/database';

/**
 * Maps snake_case database row to camelCase PlatformAdmin type
 */
function mapToCamelCase(row: Record<string, unknown>): PlatformAdmin {
	return {
		id: row.id as string,
		userId: row.user_id as string,
		createdAt: row.created_at as string,
	};
}

export class SupabasePlatformAdminRepository implements IPlatformAdminRepository {
	private TABLE_NAME = 'platform_admins';
	private supabase: SupabaseClient;

	constructor(supabaseClient: SupabaseClient) {
		this.supabase = supabaseClient;
	}

	async isUserPlatformAdmin(authUid: string): Promise<boolean> {
		const { data, error } = await this.supabase
			.from(this.TABLE_NAME)
			.select('id')
			.eq('user_id', authUid)
			.maybeSingle();

		if (error) {
			console.error('Error checking platform admin status:', error);
			return false;
		}

		return data !== null;
	}

	async getByAuthUid(authUid: string): Promise<PlatformAdmin | null> {
		const { data, error } = await this.supabase
			.from(this.TABLE_NAME)
			.select('*')
			.eq('user_id', authUid)
			.maybeSingle();

		if (error) {
			console.error('Error fetching platform admin:', error);
			return null;
		}

		return data ? mapToCamelCase(data) : null;
	}
}
