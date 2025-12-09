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
		const supabase = await createSupabaseServerClient();

		// Get authenticated user
		const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

		if (authError || !authUser?.email) {
			return NextResponse.json({
				hasPending: false,
				error: 'Usuário não autenticado',
			}, { status: 401 });
		}

		const userEmail = authUser.email.toLowerCase();

		// Find pending invitation for this email
		const { data: invitation, error: invitationError } = await supabase
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
			.ilike('email', userEmail)
			.eq('status', 'pending')
			.gt('expires_at', new Date().toISOString())
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

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
