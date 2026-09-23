'use client';

import {
  screenShareSignalRequestSchema,
  screenShareSignalResponseSchema,
  type ScreenShareSignalRequest,
} from '@/lib/webrtc/screen-share-contract';

export async function sendScreenShareSignalRequest(
  spaceId: string,
  request: ScreenShareSignalRequest,
): Promise<void> {
  const body = screenShareSignalRequestSchema.parse(request);
  const response = await fetch(
    `/api/spaces/${encodeURIComponent(spaceId)}/screen-share/signal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !screenShareSignalResponseSchema.safeParse(payload).success) {
    throw new Error(`HTTP_${response.status}`);
  }
}
