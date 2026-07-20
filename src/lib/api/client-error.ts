import type { ApiErrorBody, ApiErrorCode } from '@/lib/api/error-contract';

interface LegacyApiErrorBody extends Partial<ApiErrorBody> {
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode;
  readonly correlationId?: string;

  constructor(
    message: string,
    options: { status: number; code?: ApiErrorCode; correlationId?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.correlationId = options.correlationId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function throwApiError(response: Response): Promise<never> {
  let body: LegacyApiErrorBody = {};

  try {
    const parsed: unknown = await response.json();
    if (isRecord(parsed)) {
      body = parsed as LegacyApiErrorBody;
    }
  } catch {
    // Non-JSON failures still retain the HTTP status and status text.
  }

  const message =
    (typeof body.error === 'string' ? body.error : undefined) ??
    (typeof body.message === 'string' ? body.message : undefined) ??
    response.statusText ??
    'Request failed';

  throw new ApiError(message || 'Request failed', {
    status: response.status,
    code: typeof body.code === 'string' ? body.code : undefined,
    correlationId: typeof body.correlationId === 'string' ? body.correlationId : undefined,
  });
}
