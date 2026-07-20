import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { emitPresenceEvent } from '@/lib/presence/observability';

export type LegacyPresenceCompletionStatus = 'completed' | 'rejected' | 'failed';

export interface LegacyPresenceGateErrorBody {
  success: false;
  code: string;
  retryable: boolean;
}

export class LegacyPresenceWriteGateError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: string, httpStatus: number, retryable: boolean) {
    super(code);
    this.name = 'LegacyPresenceWriteGateError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }

  toBody(): LegacyPresenceGateErrorBody {
    return {
      success: false,
      code: this.code,
      retryable: this.retryable,
    };
  }
}

export interface LegacyPresenceWriteGate {
  readonly requestId: string;
  readonly deadline: Date;
  assertCanStartDatabaseOperation(): void;
  close(completionStatus: LegacyPresenceCompletionStatus): Promise<void>;
}

const MAINTENANCE_CODE = 'PRESENCE_MAINTENANCE';
const UPGRADE_REQUIRED_CODE = 'CLIENT_UPGRADE_REQUIRED';
const DEADLINE_EXCEEDED_CODE = 'PRESENCE_WRITE_DEADLINE_EXCEEDED';

function mapBeginError(errorMessage: string): LegacyPresenceWriteGateError {
  if (errorMessage.includes(MAINTENANCE_CODE)) {
    return new LegacyPresenceWriteGateError(MAINTENANCE_CODE, 503, true);
  }

  if (errorMessage.includes(UPGRADE_REQUIRED_CODE)) {
    return new LegacyPresenceWriteGateError(UPGRADE_REQUIRED_CODE, 426, false);
  }

  return new LegacyPresenceWriteGateError('PRESENCE_WRITE_GATE_UNAVAILABLE', 503, true);
}

function parseRpcDeadline(data: unknown): Date {
  if (typeof data !== 'string') {
    throw new LegacyPresenceWriteGateError('PRESENCE_WRITE_GATE_INVALID_RESPONSE', 503, true);
  }

  const deadline = new Date(data);
  if (!Number.isFinite(deadline.getTime())) {
    throw new LegacyPresenceWriteGateError('PRESENCE_WRITE_GATE_INVALID_RESPONSE', 503, true);
  }

  return deadline;
}

class SupabaseLegacyPresenceWriteGate implements LegacyPresenceWriteGate {
  readonly requestId: string;
  readonly deadline: Date;
  private readonly supabase: SupabaseClient;
  private closed = false;

  constructor(params: {
    readonly requestId: string;
    readonly deadline: Date;
    readonly supabase: SupabaseClient;
  }) {
    this.requestId = params.requestId;
    this.deadline = params.deadline;
    this.supabase = params.supabase;
  }

  assertCanStartDatabaseOperation(): void {
    if (Date.now() >= this.deadline.getTime()) {
      throw new LegacyPresenceWriteGateError(DEADLINE_EXCEEDED_CODE, 503, true);
    }
  }

  async close(completionStatus: LegacyPresenceCompletionStatus): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    const { error } = await this.supabase.rpc('end_legacy_presence_write', {
      p_request_id: this.requestId,
      p_completion_status: completionStatus,
    });

    if (error) {
      emitPresenceEvent({
        category: 'location',
        action: 'legacy-gate-close',
        resultCode: 'LEGACY_GATE_CLOSE_FAILED',
        correlationId: this.requestId,
        stateTransition: completionStatus,
        retryable: true,
      });
    }
  }
}

export async function beginLegacyPresenceWrite(): Promise<LegacyPresenceWriteGate> {
  const requestId = randomUUID();
  const supabase = await createSupabaseServerClient('service_role');
  const { data, error } = await supabase.rpc('begin_legacy_presence_write', {
    p_request_id: requestId,
  });

  if (error) {
    throw mapBeginError(error.message);
  }

  return new SupabaseLegacyPresenceWriteGate({
    requestId,
    deadline: parseRpcDeadline(data),
    supabase,
  });
}

export function isLegacyPresenceWriteGateError(
  error: unknown,
): error is LegacyPresenceWriteGateError {
  return error instanceof LegacyPresenceWriteGateError;
}

export function completionStatusForResponse(response: Response): LegacyPresenceCompletionStatus {
  if (response.status >= 500) {
    return 'failed';
  }

  if (response.status >= 400) {
    return 'rejected';
  }

  return 'completed';
}
