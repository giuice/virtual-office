import { describe, expect, it } from 'vitest';
import { ApiError, throwApiError } from '@/lib/api/client-error';

async function capture(response: Response): Promise<ApiError> {
  try {
    await throwApiError(response);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  throw new Error('Expected throwApiError to throw');
}

describe('throwApiError', () => {
  it('reads the legacy error field', async () => {
    const error = await capture(Response.json({ error: 'Legacy error' }, { status: 400 }));

    expect(error.message).toBe('Legacy error');
    expect(error.status).toBe(400);
  });

  it('falls back to the legacy message field', async () => {
    const error = await capture(Response.json({ message: 'Legacy message' }, { status: 503 }));

    expect(error.message).toBe('Legacy message');
    expect(error.status).toBe(503);
  });

  it('retains code and correlationId from the new envelope', async () => {
    const error = await capture(
      Response.json(
        { error: 'Please retry', code: 'RATE_LIMITED', correlationId: 'request-123' },
        { status: 429 }
      )
    );

    expect(error).toMatchObject({
      message: 'Please retry',
      status: 429,
      code: 'RATE_LIMITED',
      correlationId: 'request-123',
    });
  });

  it('uses statusText when the body is not JSON', async () => {
    const error = await capture(new Response('gateway failure', { status: 502, statusText: 'Bad Gateway' }));

    expect(error.message).toBe('Bad Gateway');
    expect(error.status).toBe(502);
  });
});
