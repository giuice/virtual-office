import 'server-only';

import {
  screenShareMediaTopic,
  type ScreenShareSignalingPayload,
} from '@/lib/webrtc/screen-share-contract';

const SCREEN_SHARE_SIGNAL_TIMEOUT_MS = 10_000;

export async function broadcastScreenShareSignal(
  payload: ScreenShareSignalingPayload,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SCREEN_SHARE_SIGNAL_ENV_MISSING');

  const topic = encodeURIComponent(screenShareMediaTopic(payload.companyId, payload.spaceId));
  const event = encodeURIComponent(payload.type);
  const endpoint = new URL(
    `/realtime/v1/api/broadcast/${topic}/events/${event}?private=true`,
    supabaseUrl,
  );
  const controller = new AbortController();
  // Match the Realtime client default. Production requests can exceed two
  // seconds during normal database and route activity.
  const timeout = setTimeout(() => controller.abort(), SCREEN_SHARE_SIGNAL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status !== 202) throw new Error('SCREEN_SHARE_SIGNAL_NOT_ACKNOWLEDGED');
  } finally {
    clearTimeout(timeout);
  }
}
