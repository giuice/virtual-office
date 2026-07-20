import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  companyMemberRemovalRequestSchema,
  companyMemberRemovalRpcErrorMap,
  parseCompanyMemberRemovalRpcErrorCode,
  parseCompanyMemberRemovalRpcResult,
} from '@/lib/api/company-membership-contracts';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 },
      );
    }

    const parsedBody = companyMemberRemovalRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { message: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 },
      );
    }

    const auth = await requireAuthUser();
    if ('errorResponse' in auth) return auth.errorResponse;

    // The company and actor IDs are server-derived. The database rechecks the
    // same-company admin rule under the transaction's row locks.
    if (!auth.dbUser.companyId || auth.dbUser.role !== 'admin') {
      return NextResponse.json(
        {
          message: 'Only an admin of this company can remove members',
          code: 'COMPANY_REMOVAL_FORBIDDEN',
        },
        { status: 403 },
      );
    }

    const admin = await createSupabaseServerClient('service_role');
    const { data, error } = await admin.rpc(
      'remove_company_member_and_presence',
      {
        p_actor_user_id: auth.dbUser.id,
        p_target_user_id: parsedBody.data.userId,
        p_company_id: auth.dbUser.companyId,
      },
    );

    if (error) {
      const errorCode = parseCompanyMemberRemovalRpcErrorCode(error.message);
      const contract = errorCode ? companyMemberRemovalRpcErrorMap[errorCode] : null;
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }

      console.error('Atomic company member removal failed', {
        correlationId,
        databaseCode: error.code,
      });
      return NextResponse.json(
        { message: 'Failed to remove user from company', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    const result = parseCompanyMemberRemovalRpcResult(data, {
      actorUserId: auth.dbUser.id,
      targetUserId: parsedBody.data.userId,
      companyId: auth.dbUser.companyId,
    });
    if (!result) {
      console.error('Atomic company member removal returned an invalid result', {
        correlationId,
      });
      return NextResponse.json(
        { message: 'Failed to remove user from company', code: 'INTERNAL_ERROR' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: 'User removed from company successfully',
      code: result.code,
      result,
    });
  } catch (error) {
    console.error('Atomic company member removal failed', {
      correlationId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { message: 'Failed to remove user from company', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
