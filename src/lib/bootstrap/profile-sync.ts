import { syncUserProfile } from '@/lib/api';
import type { User } from '@/types/database';

interface SyncUserProfilePayload {
  supabase_uid: string;
  email: string;
  displayName?: string;
}

const inFlightProfileSyncs = new Map<string, Promise<User>>();

export function syncUserProfileOnce(payload: SyncUserProfilePayload): Promise<User> {
  const existingSync = inFlightProfileSyncs.get(payload.supabase_uid);
  if (existingSync) {
    return existingSync;
  }

  let inFlightSync: Promise<User>;
  inFlightSync = syncUserProfile(payload).finally(() => {
    if (inFlightProfileSyncs.get(payload.supabase_uid) === inFlightSync) {
      inFlightProfileSyncs.delete(payload.supabase_uid);
    }
  });
  inFlightProfileSyncs.set(payload.supabase_uid, inFlightSync);

  return inFlightSync;
}

/**
 * Drop every in-flight dedupe entry. Called on auth identity transitions
 * (logout / account switch): a sync started under a previous identity must
 * never be handed to a new bootstrap — if that request is stalled, the new
 * session would block on it before ever reaching the company load.
 */
export function invalidateInFlightProfileSyncs(): void {
  inFlightProfileSyncs.clear();
}

export function __resetProfileSyncCache(): void {
  inFlightProfileSyncs.clear();
}
