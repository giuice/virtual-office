// src/app/api/invitations/pending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export interface PendingInvitationResponse {
	hasPending: boolean;
	invitation?: {
		token: string;
		companyName: string;
		companyId: string;
		role: string;
	};
	error?: string;
}

/**
 * GET /api/invitations/pending
 * 
 * Busca convite pendente para o email do usuário autenticado.
 * Usado pelo fluxo de set-password para auto-aceitar convites.
 */
export async function GET(req: NextRequest): Promise<NextResponse<PendingInvitationResponse>> {
	try {
		// Regular client for auth check
		const supabase = await createSupabaseServerClient();
		// Service role client for invitation queries (bypasses RLS).
		// The invited user has no company yet, so RLS policies on invitations
		// (which require company admin) would block all reads/writes.
		const supabaseAdmin = await createSupabaseServerClient('service_role');

		// Get authenticated user
		const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

		console.log('[API /invitations/pending] Auth check:', {
			hasUser: !!authUser,
			email: authUser?.email,
			authError: authError?.message
		});

		if (authError || !authUser?.email) {
			return NextResponse.json({
				hasPending: false,
				error: 'Usuário não autenticado',
			}, { status: 401 });
		}

		const userEmail = authUser.email.toLowerCase();
		const nowIso = new Date().toISOString();

		console.log('[API /invitations/pending] Searching for:', { userEmail, nowIso });

		// Use admin client for invitation operations (RLS bypass)
		const { error: expireError } = await supabaseAdmin
			.from('invitations')
			.update({ status: 'expired' })
			.eq('email', userEmail)
			.eq('status', 'pending')
			.lte('expires_at', nowIso);

		if (expireError) {
			console.warn('[API /invitations/pending] Failed to expire stale invitations:', expireError);
		}

		// Find pending invitation for this email (use admin client - RLS bypass)
		const { data: invitation, error: invitationError } = await supabaseAdmin
			.from('invitations')
			.select(`
        token,
        company_id,
        role,
        expires_at,
        companies!invitations_company_id_fkey (
          id,
          name
        )
      `)
			.eq('email', userEmail)
			.eq('status', 'pending')
			.gt('expires_at', nowIso)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		console.log('[API /invitations/pending] Query result:', { 
			found: !!invitation, 
			token: invitation?.token?.substring(0, 8) + '...', 
			error: invitationError?.message 
		});

		if (invitationError) {
			console.error('Error fetching pending invitation:', invitationError);
			return NextResponse.json({
				hasPending: false,
				error: 'Erro ao buscar convite',
			}, { status: 500 });
		}

		if (!invitation) {
			return NextResponse.json({
				hasPending: false,
			}, { status: 200 });
		}

		// Extract company name
		const companyData = invitation.companies as unknown;
		let companyName = 'Empresa';
		if (companyData && typeof companyData === 'object' && 'name' in companyData) {
			companyName = (companyData as { name: string }).name;
		}

		return NextResponse.json({
			hasPending: true,
			invitation: {
				token: invitation.token,
				companyName,
				companyId: invitation.company_id,
				role: invitation.role,
			},
		}, { status: 200 });

	} catch (error) {
		console.error('Unexpected error fetching pending invitation:', error);
		return NextResponse.json({
			hasPending: false,
			error: 'Erro interno do servidor',
		}, { status: 500 });
	}
}
