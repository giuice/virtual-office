// src/lib/messaging/outbox/outbox-identity.ts
// Phase 5 T11 (FR-011, FR-012, BR-001): who the browser is authenticated as,
// compared with the owner of an outbox.
//
// The outbox belongs to an application user (users.id). Its owner's auth
// identity is that user's `users.supabase_uid`, and the browser's current one
// is the auth user of the session the Supabase browser client reads from its
// storage (the auth cookies every tab of the browser shares) — so a sign-out
// or a sign-in as another account in any tab, or cookies cleared or replaced
// by the server, is seen by every tab on its next check, with or without an
// auth event. The server still checks every request's sender (the route
// compares the expected sender with users.id resolved from auth.getUser()).
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

/**
 * - `owner`: the browser holds a session of the outbox's owner;
 * - `other`: it holds another user's session (an account switch);
 * - `ended`: it holds no session (signed out, cookies cleared, or the
 *   refresh was rejected and the session removed);
 * - `unverified`: the session could not be read (its refresh failed in
 *   transit): nothing is concluded, the check is repeated later.
 */
export type OutboxIdentityState = 'owner' | 'other' | 'ended' | 'unverified';

export interface OutboxIdentity {
  /** The browser's authenticated user compared with the owner, read now. */
  check(): Promise<OutboxIdentityState>;
  /** Calls `listener` (asynchronously) after every auth state change this tab's auth client reports. */
  onChange(listener: () => void): () => void;
}

/** `ownerAuthUid`: the owner's `users.supabase_uid` (never users.id). */
export function createOutboxIdentity(ownerAuthUid: string): OutboxIdentity {
  return {
    async check() {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        if (session) return session.user.id === ownerAuthUid ? 'owner' : 'other';
        return error && isAuthRetryableFetchError(error) ? 'unverified' : 'ended';
      } catch {
        return 'unverified';
      }
    },
    onChange(listener) {
      // The auth client may still hold its lock while notifying: read the
      // session only after the callback returned.
      const { data } = supabase.auth.onAuthStateChange(() => {
        setTimeout(listener, 0);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
