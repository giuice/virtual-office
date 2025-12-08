// src/repositories/interfaces/IPlatformAdminRepository.ts
// Story: story-platform-admin

import { PlatformAdmin } from '@/types/database';

export interface IPlatformAdminRepository {
	/**
	 * Checks if a user is a platform admin by their Supabase Auth UID.
	 * @param authUid The Supabase Auth UID to check
	 * @returns true if the user is a platform admin, false otherwise
	 */
	isUserPlatformAdmin(authUid: string): Promise<boolean>;

	/**
	 * Gets the platform admin entry for a user.
	 * @param authUid The Supabase Auth UID
	 * @returns The PlatformAdmin entry or null if not found
	 */
	getByAuthUid(authUid: string): Promise<PlatformAdmin | null>;
}
