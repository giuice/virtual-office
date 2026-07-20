import crypto from 'crypto';
import { NextResponse } from 'next/server';
import {
  parsePlatformCompanyCreationRpcErrorCode,
  parsePlatformCompanyCreationRpcResult,
  platformCompanyCreationRequestSchema,
  platformCompanyCreationRpcErrorMap,
} from '@/lib/api/company-membership-contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabasePlatformAdminRepository } from '@/repositories/implementations/supabase/SupabasePlatformAdminRepository';

export const dynamic = 'force-dynamic';

function resolveAppBaseUrl(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      return new URL(configuredAppUrl).origin;
    } catch {
      // Fall through to the request origin without logging configuration data.
    }
  }
  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }

    // Fast UX preflight only. The database repeats this check while locking the
    // platform_admin row before inserting company + invitation atomically.
    const platformAdminRepository = new SupabasePlatformAdminRepository(supabase);
    if (!(await platformAdminRepository.isUserPlatformAdmin(user.id))) {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas Platform Admins podem criar empresas.' },
        { status: 403 },
      );
    }

    const parsedBody = platformCompanyCreationRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      const invalidCompanyName = parsedBody.error.issues.some(
        (issue) => issue.path[0] === 'companyName',
      );
      const invalidAdminEmail = parsedBody.error.issues.some(
        (issue) => issue.path[0] === 'adminEmail' && issue.code !== 'too_big',
      );
      if (invalidCompanyName) {
        return NextResponse.json({ error: 'Nome da empresa é obrigatório' }, { status: 400 });
      }
      if (invalidAdminEmail) {
        return NextResponse.json({ error: 'Formato de email inválido' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Dados da empresa inválidos' }, { status: 400 });
    }
    const { companyName, adminEmail, planType } = parsedBody.data;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const settings = {
      theme: 'neon' as const,
      ...(planType ? { planType } : {}),
    };
    const supabaseAdmin = await createSupabaseServerClient('service_role');
    const { data, error } = await supabaseAdmin.rpc(
      'create_company_with_initial_admin_invitation',
      {
        p_platform_admin_auth_user_id: user.id,
        p_name: companyName,
        p_settings: settings,
        p_email: adminEmail,
        p_token: token,
        p_expires_at: expiresAt,
      },
    );

    if (error) {
      const errorCode = parsePlatformCompanyCreationRpcErrorCode(error.message);
      const contract = errorCode
        ? platformCompanyCreationRpcErrorMap[errorCode]
        : null;
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }
      console.error('Atomic platform company creation failed', { databaseCode: error.code });
      return NextResponse.json({ error: 'Falha ao criar empresa' }, { status: 500 });
    }
    const result = parsePlatformCompanyCreationRpcResult(data, {
      companyName,
      email: adminEmail,
      token,
      settings,
    });
    if (!result) {
      return NextResponse.json({ error: 'Falha ao criar empresa' }, { status: 500 });
    }

    const inviteUrl = `${resolveAppBaseUrl(request)}/join?token=${result.token}`;
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
      redirectTo: inviteUrl,
      data: {
        invitation_token: result.token,
        invited_company_id: result.companyId,
        invited_role: result.role,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Empresa e convite criados com sucesso',
        company: {
          id: result.companyId,
          name: result.companyName,
          settings: result.companySettings,
        },
        invitation: {
          id: result.invitationId,
          email: result.email,
          token: result.token,
          expiresAt: new Date(result.expiresAt).toISOString(),
          inviteUrl,
          emailSent: !inviteError,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Platform company creation failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ success: false, error: 'Erro interno ao criar empresa' }, { status: 500 });
  }
}
