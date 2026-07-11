import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/respond/route';
import type { NextRequest } from 'next/server';

const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const REQUESTER_ID = '55555555-5555-4555-8555-555555555555';

function createRequest(body: object) {
  return {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('/api/spaces/knock/respond', () => {
  it('fails closed before processing a valid payload', async () => {
    const response = await POST(createRequest({
      spaceId: SPACE_ID,
      requestId: 'request-1',
      requesterId: REQUESTER_ID,
      requesterName: 'Taylor Knocker',
      decision: 'APPROVE',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Knock is temporarily unavailable',
      code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
    });
  });

  it('fails closed without authentication', async () => {
    const response = await POST(createRequest({}));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Knock is temporarily unavailable',
      code: 'KNOCK_TEMPORARILY_UNAVAILABLE',
    });
  });
});
