import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

const snapshotIdentitySchema = z
  .object({
    companyId: z.string().uuid(),
    viewerUserId: z.string().uuid(),
  })
  .passthrough();

interface SnapshotErrorResponse {
  success: false;
  code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED' | 'PRESENCE_SNAPSHOT_TOO_LARGE' | 'PRESENCE_VIEWER_NO_COMPANY' | 'INTERNAL_ERROR';
  message: string;
  retryable: boolean;
}

function errorResponse(
  code: SnapshotErrorResponse['code'],
  status: number,
  message: string,
  retryable: boolean
): NextResponse<SnapshotErrorResponse> {
  return NextResponse.json({ success: false, code, message, retryable }, { status });
}

function internalErrorResponse(): NextResponse<SnapshotErrorResponse> {
  return errorResponse('INTERNAL_ERROR', 500, 'Presence snapshot operation failed', true);
}

function valueContainsCode(value: unknown, code: string): boolean {
  if (typeof value === 'string') {
    return value.includes(code);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some((entry) => valueContainsCode(entry, code));
}

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      if (auth.code === 'AUTH_SESSION_REVOKED') {
        return errorResponse('AUTH_SESSION_REVOKED', 401, 'Authentication session revoked', false);
      }

      return errorResponse('UNAUTHORIZED', 401, 'Authentication required', true);
    }

    const { data, error } = await auth.admin.rpc('get_company_presence_snapshot', {
      p_viewer_user_id: auth.identity.appUserId,
    });

    if (error) {
      if (valueContainsCode(error, 'PRESENCE_SNAPSHOT_TOO_LARGE')) {
        console.error('Presence snapshot too large', { viewerUserId: auth.identity.appUserId });
        return errorResponse(
          'PRESENCE_SNAPSHOT_TOO_LARGE',
          503,
          'Presence snapshot is too large',
          false
        );
      }

      if (valueContainsCode(error, 'PRESENCE_VIEWER_NO_COMPANY')) {
        return errorResponse(
          'PRESENCE_VIEWER_NO_COMPANY',
          409,
          'Presence viewer has no company',
          false
        );
      }

      return internalErrorResponse();
    }

    const parsedSnapshot = snapshotIdentitySchema.safeParse(data);
    if (
      !parsedSnapshot.success ||
      parsedSnapshot.data.companyId !== auth.identity.companyId ||
      parsedSnapshot.data.viewerUserId !== auth.identity.appUserId
    ) {
      const correlationId = randomUUID();
      console.error('Presence snapshot identity mismatch', {
        correlationId,
        expectedCompanyId: auth.identity.companyId,
        expectedViewerUserId: auth.identity.appUserId,
      });
      return internalErrorResponse();
    }

    return NextResponse.json(data);
  } catch (error) {
    const correlationId = randomUUID();
    console.error('Presence snapshot failed', { correlationId, error });
    return internalErrorResponse();
  }
}
