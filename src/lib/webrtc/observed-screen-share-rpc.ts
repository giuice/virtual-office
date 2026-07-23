import type { z } from 'zod';

interface ObservedRpcResponse {
  data: unknown;
  error: unknown;
}

export type ObservedScreenShareRpcResult<T> =
  | { kind: 'result'; result: T }
  | { kind: 'malformed' }
  | { kind: 'provider-error'; error: unknown };

function isStrictRetryLockSet(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 2
    && keys.includes('ok')
    && keys.includes('code')
    && record.ok === false
    && record.code === 'RETRY_LOCK_SET';
}

function parseResponse<T>(
  response: ObservedRpcResponse,
  schema: z.ZodType<T>,
): ObservedScreenShareRpcResult<T> {
  if (response.error) return { kind: 'provider-error', error: response.error };

  const parsed = schema.safeParse(response.data);
  return parsed.success
    ? { kind: 'result', result: parsed.data }
    : { kind: 'malformed' };
}

/**
 * Retries exactly one PostgREST transaction for the database's documented
 * structural lock-set escape. Provider errors and malformed/extra-field
 * payloads never retry because they are compatibility or infrastructure faults.
 */
export async function callObservedScreenShareRpc<T>(
  invoke: () => PromiseLike<ObservedRpcResponse>,
  schema: z.ZodType<T>,
): Promise<ObservedScreenShareRpcResult<T>> {
  const first = parseResponse(await invoke(), schema);
  if (first.kind !== 'result' || !isStrictRetryLockSet(first.result)) return first;

  return parseResponse(await invoke(), schema);
}
