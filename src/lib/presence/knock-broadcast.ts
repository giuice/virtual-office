import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KNOCK_INVALIDATED_EVENT,
  knockChannelTopic,
} from "@/lib/presence/knock-realtime";

/**
 * Best-effort acceleration only. Canonical status and pending-list polling
 * remain authoritative when Realtime is delayed or unavailable.
 */
export async function broadcastKnockInvalidated(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<void> {
  if (!companyId) return;

  const channel = supabase.channel(knockChannelTopic(companyId), {
    config: { private: true },
  });

  try {
    const result = await channel.httpSend(
      KNOCK_INVALIDATED_EVENT,
      {
        kind: KNOCK_INVALIDATED_EVENT,
      },
      { timeout: 2_000 },
    );

    if (!result.success) {
      console.warn("Knock invalidation broadcast was not acknowledged");
    }
  } catch {
    console.warn("Knock invalidation broadcast failed");
  } finally {
    await supabase.removeChannel(channel).catch(() => undefined);
  }
}
