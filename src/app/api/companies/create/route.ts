import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  companyCreationRequestSchema,
  companyCreationRpcErrorMap,
  parseCompanyCreationRpcErrorCode,
  parseCompanyCreationRpcResult,
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
        { success: false, code: 'INVALID_REQUEST', error: 'Invalid request' },
        { status: 400 },
      );
    }
    const parsed = companyCreationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, code: 'INVALID_REQUEST', error: 'Invalid request' },
        { status: 400 },
      );
    }

    const auth = await requireAuthUser();
    if ('errorResponse' in auth) return auth.errorResponse;

    const admin = await createSupabaseServerClient('service_role');
    const { data, error } = await admin.rpc('create_company_for_user', {
      p_user_id: auth.dbUser.id,
      p_name: parsed.data.name,
      p_settings: parsed.data.settings ?? {},
    });

    if (error) {
      const errorCode = parseCompanyCreationRpcErrorCode(error.message);
      const contract = errorCode ? companyCreationRpcErrorMap[errorCode] : null;
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }
      console.error('Atomic company creation failed', {
        correlationId,
        databaseCode: error.code,
      });
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to create company' },
        { status: 500 },
      );
    }

    const result = parseCompanyCreationRpcResult(data, {
      userId: auth.dbUser.id,
      name: parsed.data.name,
      settings: parsed.data.settings ?? {},
    });
    if (!result) {
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to create company' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        code: result.code,
        company: {
          id: result.companyId,
          name: result.name,
          adminIds: result.adminIds,
          settings: result.settings,
          createdAt: result.createdAt,
        },
        message: 'Company created successfully',
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Company creation failed', {
      correlationId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: 'Failed to create company' },
      { status: 500 },
    );
  }
}
