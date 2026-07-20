import crypto from 'crypto';
import { NextResponse } from 'next/server';
import {
  invitationAuthorizationActorSchema,
  invitationAuthorizationCompanySchema,
  invitationCreationRequestSchema,
  invitationCreationRpcErrorMap,
  parseInvitationCreationRpcErrorCode,
  parseInvitationCreationRpcResult,
} from '@/lib/api/company-membership-contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { resolveAppBaseUrl } from './resolve-app-base-url';

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = crypto.randomBytes(16).toString('hex');
  const [supabaseAdmin, supabaseClient] = await Promise.all([
    createSupabaseServerClient('service_role'),
    createSupabaseServerClient(),
  ]);

  try {
    const parsedBody = invitationCreationRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      const invalidEmailFormat = parsedBody.error.issues.some(
        (issue) => issue.path[0] === 'email' && issue.code === 'invalid_format',
      );
      if (invalidEmailFormat) {
        return NextResponse.json({ error: 'Formato de email inválido' }, { status: 400 });
      }
      const oversizedEmail = parsedBody.error.issues.some(
        (issue) => issue.path[0] === 'email' && issue.code === 'too_big',
      );
      if (oversizedEmail) {
        return NextResponse.json({ error: 'Dados do convite inválidos' }, { status: 400 });
      }
      return NextResponse.json(
        { error: 'Missing or invalid required fields: email, role, companyId' },
        { status: 400 },
      );
    }
    const { email, role, companyId } = parsedBody.data;

    const {
      data: { user: currentUser },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }

    // This read gives a fast UX rejection. The SECURITY DEFINER RPC repeats
    // authorization while holding the actor/company/invitation locks.
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('id, admin_ids')
      .eq('id', companyId)
      .single();
    const parsedCompany = invitationAuthorizationCompanySchema.safeParse(company);
    if (companyError || !parsedCompany.success) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const { data: currentUserRecord } = await supabaseClient
      .from('users')
      .select('id, role, company_id')
      .eq('supabase_uid', currentUser.id)
      .single();
    const parsedActor = invitationAuthorizationActorSchema.safeParse(currentUserRecord);
    if (!parsedActor.success) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }
    const isAdmin = Boolean(
      (parsedActor.data.role === 'admin' && parsedActor.data.company_id === companyId) ||
        parsedCompany.data.admin_ids?.includes(parsedActor.data.id),
    );
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem enviar convites' },
        { status: 403 },
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('create_company_invitation', {
      p_actor_user_id: parsedActor.data.id,
      p_company_id: companyId,
      p_email: email,
      p_role: role,
      p_token: token,
      p_expires_at: expiresAt,
    });

    if (error) {
      const errorCode = parseInvitationCreationRpcErrorCode(error.message);
      const contract = errorCode ? invitationCreationRpcErrorMap[errorCode] : null;
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }

      console.error('Atomic invitation creation failed', { databaseCode: error.code });
      return NextResponse.json(
        { success: false, error: 'Falha ao salvar convite no banco. Tente novamente.' },
        { status: 500 },
      );
    }

    const result = parseInvitationCreationRpcResult(data, {
      companyId,
      email,
      createdRole: role,
      createdToken: token,
    });
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Falha ao salvar convite no banco. Tente novamente.' },
        { status: 500 },
      );
    }

    const baseUrl = resolveAppBaseUrl(request);
    const inviteUrl = `${baseUrl}/join?token=${result.token}`;
    const remaining = Math.max(0, 10 - result.memberCount - result.pendingCount);

    if (!result.created) {
      return NextResponse.json({
        success: true,
        message: 'Convite já existente (pendente). Reutilizando link para evitar spam.',
        invitation: {
          id: result.invitationId,
          companyId: result.companyId,
          email: result.email,
          token: result.token,
          expiresAt: new Date(result.expiresAt).toISOString(),
          inviteUrl,
          emailSent: false,
        },
        limit: 10,
        remaining,
      });
    }

    let emailSent = false;
    let emailDeliveryFailed = false;
    try {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteUrl,
        data: {
          invitation_token: result.token,
          invited_company_id: result.companyId,
          invited_role: result.role,
        },
      });
      if (inviteError) {
        emailDeliveryFailed = true;
        console.warn('Invitation email delivery failed', {
          correlationId,
          providerStatus: inviteError.status ?? null,
        });
      } else emailSent = true;
    } catch (error) {
      emailDeliveryFailed = true;
      console.warn('Invitation email delivery failed', {
        correlationId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: emailSent
          ? 'Convite enviado com sucesso'
          : 'Convite criado. Não foi possível enviar o email automaticamente — compartilhe o link manualmente.',
        invitation: {
          id: result.invitationId,
          companyId: result.companyId,
          email: result.email,
          token: result.token,
          expiresAt: new Date(result.expiresAt).toISOString(),
          inviteUrl,
          emailSent,
          emailSendError: emailDeliveryFailed ? 'DELIVERY_FAILED' : null,
        },
        limit: 10,
        remaining,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Invitation creation failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { success: false, error: 'Falha ao criar convite' },
      { status: 500 },
    );
  }
}
