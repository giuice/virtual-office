import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  invitationAcceptanceRequestSchema,
  invitationAcceptanceRpcErrorMap,
  invitationMembershipLookupSchema,
  parseInvitationAcceptanceRpcErrorCode,
  parseInvitationAcceptanceRpcResult,
} from '@/lib/api/company-membership-contracts';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

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
    const parsed = invitationAcceptanceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, code: 'INVALID_REQUEST', error: 'Invalid request' },
        { status: 400 },
      );
    }

    const auth = await requireAuthUser();
    if ('errorResponse' in auth) return auth.errorResponse;

    const admin = await createSupabaseServerClient('service_role');
    const { data: invitation, error: invitationError } = await admin
      .from('invitations')
      .select('id, company_id')
      .eq('token', parsed.data.token)
      .maybeSingle();

    if (invitationError) {
      console.error('Invitation lookup failed', {
        correlationId,
        databaseCode: invitationError.code,
      });
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to accept invitation' },
        { status: 500 },
      );
    }
    if (!invitation) {
      return NextResponse.json(
        { success: false, code: 'INVITATION_NOT_FOUND', error: 'Convite não encontrado ou inválido' },
        { status: 404 },
      );
    }
    const parsedInvitation = invitationMembershipLookupSchema.safeParse(invitation);
    if (!parsedInvitation.success) {
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to accept invitation' },
        { status: 500 },
      );
    }

    const { data, error } = await admin.rpc(
      'accept_company_invitation_membership',
      {
        p_user_id: auth.dbUser.id,
        p_invitation_id: parsedInvitation.data.id,
        p_company_id: parsedInvitation.data.company_id,
        p_display_name: parsed.data.displayName ?? null,
      },
    );

    if (error) {
      const errorCode = parseInvitationAcceptanceRpcErrorCode(error.message);
      const contract = errorCode ? invitationAcceptanceRpcErrorMap[errorCode] : null;
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }

      console.error('Atomic invitation acceptance failed', {
        correlationId,
        databaseCode: error.code,
      });
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to accept invitation' },
        { status: 500 },
      );
    }

    const result = parseInvitationAcceptanceRpcResult(data, {
      userId: auth.dbUser.id,
      invitationId: parsedInvitation.data.id,
      companyId: parsedInvitation.data.company_id,
    });
    if (!result) {
      return NextResponse.json(
        { success: false, code: 'INTERNAL_ERROR', error: 'Failed to accept invitation' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      code: result.code,
      message: 'Convite aceito com sucesso!',
      result,
      redirect: '/dashboard',
    });
  } catch (error) {
    console.error('Invitation acceptance failed', {
      correlationId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: 'Failed to accept invitation' },
      { status: 500 },
    );
  }
}
