import { beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastScreenShareSignal } from '@/lib/webrtc/screen-share-signal-broadcast';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PRESENCE_SESSION_ID = '44444444-4444-4444-8444-444444444444';
const CONNECTION_ID = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));

const payload = {
  type: 'handshake' as const,
  sourceUserId: USER_ID,
  sourcePresenceSessionId: PRESENCE_SESSION_ID,
  sourceConnectionId: CONNECTION_ID,
  companyId: COMPANY_ID,
  spaceId: SPACE_ID,
  shareId: null,
};

describe('screen-share server broadcast transport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret');
  });

  it('publishes on the private v2 HTTP endpoint with server-only credentials', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 202 }));

    await broadcastScreenShareSignal(payload);

    const [url, options] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      `https://project.supabase.co/realtime/v1/api/broadcast/company%3A${COMPANY_ID}%3Aspace%3A${SPACE_ID}%3Amedia%3Av2/events/handshake?private=true`,
    );
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        apikey: 'service-role-secret',
        Authorization: 'Bearer service-role-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    expect(options.signal).toBeDefined();
  });

  it.each([
    ['negative acknowledgement', new Response(null, { status: 403 })],
    ['transport failure', new Error('timeout')],
  ])('fails closed on %s', async (_label, outcome) => {
    if (outcome instanceof Error) mocks.fetch.mockRejectedValue(outcome);
    else mocks.fetch.mockResolvedValue(outcome);

    await expect(broadcastScreenShareSignal(payload)).rejects.toThrow();
  });

  it('allows the Realtime default window before aborting a stalled request', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    mocks.fetch.mockImplementation((_url: URL, options: RequestInit) => {
      capturedSignal = options.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    });

    try {
      const pending = broadcastScreenShareSignal(payload);
      const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(capturedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a Realtime acknowledgement that arrives after the former two-second limit', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    mocks.fetch.mockImplementation((_url: URL, options: RequestInit) => {
      capturedSignal = options.signal ?? undefined;
      return new Promise((resolve) => {
        setTimeout(() => resolve(new Response(null, { status: 202 })), 5_000);
      });
    });

    try {
      const pending = broadcastScreenShareSignal(payload);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(capturedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeUndefined();
      expect(capturedSignal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
