import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/request/route';
import type { NextRequest } from 'next/server';

const SPACE_ID = '44444444-4444-4444-8444-444444444444';

function createRequest(body: object, authenticated = true) {
  return {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
    authenticated,
  } as unknown as NextRequest;
}

describe('/api/spaces/knock/request', () => {
  it('fails closed before processing a valid payload', async () => {
    const response = await POST(createRequest({
      spaceId: SPACE_ID,
      requestId: 'request-1',
      requesterName: 'Taylor Knocker',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Knock is temporarily unavailable',
      code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
    });
  });

  it('fails closed without authentication', async () => {
    const response = await POST(createRequest({}, false));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Knock is temporarily unavailable',
      code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
    });
  });
});
