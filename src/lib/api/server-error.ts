import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ApiErrorBody, ApiErrorCode } from '@/lib/api/error-contract';

export interface SerializedSupabaseError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export interface ServerErrorOptions {
  correlationId?: string;
  cause?: unknown;
  context?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key];
  return typeof value === 'string' || value === null ? value : undefined;
}

export function createCorrelationId(): string {
  return randomUUID();
}

/**
 * Supabase/PostgREST errors are commonly plain objects rather than Error
 * instances. Read only their documented diagnostic fields so logs retain the
 * useful database code without serializing request/session internals.
 */
export function serializeSupabaseError(error: unknown): SerializedSupabaseError | undefined {
  if (!isRecord(error)) {
    return typeof error === 'string' ? { message: error } : undefined;
  }

  const serialized: SerializedSupabaseError = {};
  const code = readString(error, 'code');
  const message = readString(error, 'message');
  const details = readNullableString(error, 'details');
  const hint = readNullableString(error, 'hint');
  const status = typeof error.status === 'number' ? error.status : undefined;

  if (code !== undefined) serialized.code = code;
  if (message !== undefined) serialized.message = message;
  if (details !== undefined) serialized.details = details;
  if (hint !== undefined) serialized.hint = hint;
  if (status !== undefined) serialized.status = status;

  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

export function logServerError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options: ServerErrorOptions = {}
): void {
  const cause = serializeSupabaseError(options.cause);
  const entry = {
    event: 'api_error',
    correlationId: options.correlationId,
    context: options.context,
    status,
    code,
    message,
    cause,
  };

  console.error(JSON.stringify(entry));
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options: ServerErrorOptions = {}
): NextResponse<ApiErrorBody> {
  logServerError(status, code, message, options);

  const body: ApiErrorBody = { error: message, code };
  if (options.correlationId) {
    body.correlationId = options.correlationId;
  }

  return NextResponse.json(body, {
    status,
    headers: options.correlationId
      ? { 'x-correlation-id': options.correlationId }
      : undefined,
  });
}

export function jsonSuccess<T>(
  body: T,
  correlationId: string,
  init: ResponseInit = {}
): NextResponse<T> {
  const headers = new Headers(init.headers);
  headers.set('x-correlation-id', correlationId);
  return NextResponse.json(body, { ...init, headers });
}
