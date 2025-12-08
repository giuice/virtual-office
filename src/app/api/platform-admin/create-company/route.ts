// src/app/api/platform-admin/create-company/route.ts
// Story: story-platform-admin - AC 2.3
// API route for Platform Admins to create companies and invite initial admin

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabasePlatformAdminRepository } from '@/repositories/implementations/supabase/SupabasePlatformAdminRepository';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase/SupabaseInvitationRepository';
import { Company, Invitation, UserRole } from '@/types/database';
import crypto from 'crypto';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	try {
		// Get authenticated user
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError || !user) {
			return NextResponse.json(
				{ error: 'Usuário não autenticado' },
				{ status: 401 }
			);
		}

		// Verify user is a platform admin (AC 2.1 guard at API level)
		const platformAdminRepository = new SupabasePlatformAdminRepository(supabase);
		const isPlatformAdmin = await platformAdminRepository.isUserPlatformAdmin(user.id);

		if (!isPlatformAdmin) {
			console.warn(`[API platform-admin/create-company] Non-platform admin attempted access: ${user.id}`);
			return NextResponse.json(
				{ error: 'Acesso negado. Apenas Platform Admins podem criar empresas.' },
				{ status: 403 }
			);
		}

		// Parse request body
		const { companyName, adminEmail, planType } = await request.json();

		// Validate required fields
		if (!companyName?.trim()) {
			return NextResponse.json(
				{ error: 'Nome da empresa é obrigatório' },
				{ status: 400 }
			);
		}

		if (!adminEmail?.trim()) {
			return NextResponse.json(
				{ error: 'Email do admin é obrigatório' },
				{ status: 400 }
			);
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(adminEmail)) {
			return NextResponse.json(
				{ error: 'Formato de email inválido' },
				{ status: 400 }
			);
		}

		console.log('[API platform-admin/create-company] Creating company:', {
			companyName,
			adminEmail,
			planType,
			platformAdminId: user.id
		});

		// AC 2.3.1: Create company record
		const companyRepository = new SupabaseCompanyRepository(supabase);

		const companyData: Omit<Company, 'id' | 'createdAt'> = {
			name: companyName.trim(),
			adminIds: [], // Will be populated when admin accepts invite
			settings: {
				theme: 'neon',
				// Store plan type in settings
				...(planType && { planType }),
			},
		};

		const newCompany = await companyRepository.create(companyData);

		if (!newCompany) {
			console.error('[API platform-admin/create-company] Failed to create company');
			return NextResponse.json(
				{ error: 'Falha ao criar empresa' },
				{ status: 500 }
			);
		}

		console.log('[API platform-admin/create-company] Company created:', newCompany.id);

		// AC 2.3.2: Create invitation record with admin role
		const token = crypto.randomBytes(32).toString('hex');
		const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

		const invitationRepository = new SupabaseInvitationRepository(supabase);

		const invitationData: Omit<Invitation, 'id' | 'createdAt' | 'status'> = {
			email: adminEmail.trim(),
			companyId: newCompany.id,
			role: 'admin' as UserRole, // Always admin for initial company admin
			token,
			expiresAt: expiresAtMs,
		};

		const createdInvitation = await invitationRepository.create(invitationData);

		if (!createdInvitation) {
			console.error('[API platform-admin/create-company] Failed to create invitation');
			// Try to clean up the company
			// (In production, consider using a transaction)
			return NextResponse.json(
				{ error: 'Empresa criada, mas falha ao criar convite. Contate o suporte.' },
				{ status: 500 }
			);
		}

		console.log('[API platform-admin/create-company] Invitation created:', createdInvitation.id);

		// AC 2.3.3: Send invitation email via Supabase Auth
		const headersList = await headers();
		const host = headersList.get('host') || 'localhost:3000';
		const protocol = host.includes('localhost') ? 'http' : 'https';
		const redirectTo = `${protocol}://${host}/join?token=${token}`;

		// Use service role client for admin email operations
		const supabaseAdmin = await createSupabaseServerClient('service_role');

		const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
			adminEmail.trim(),
			{
				redirectTo,
				data: {
					invitation_token: token,
					invited_company_id: newCompany.id,
					invited_role: 'admin',
				}
			}
		);

		if (inviteError) {
			console.error('[API platform-admin/create-company] Email invite error:', inviteError);
			// Don't fail completely - the link can still be shared manually
			console.warn('[API platform-admin/create-company] Admin should share the link manually');
		} else {
			console.log('[API platform-admin/create-company] Invite email sent successfully');
		}

		// Build the full invite URL for sharing (AC 2.4)
		const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
		const inviteUrl = `${baseUrl}/join?token=${token}`;

		// Return success response
		return NextResponse.json({
			success: true,
			message: 'Empresa e convite criados com sucesso',
			company: {
				id: newCompany.id,
				name: newCompany.name,
				settings: newCompany.settings,
			},
			invitation: {
				id: createdInvitation.id,
				email: adminEmail.trim(),
				token,
				expiresAt: new Date(expiresAtMs).toISOString(),
				inviteUrl,
				emailSent: !inviteError, // Indicates if email was successfully sent
			},
		}, { status: 201 });

	} catch (error) {
		console.error('[API platform-admin/create-company] Unexpected error:', error);
		return NextResponse.json({
			success: false,
			error: error instanceof Error ? error.message : 'Erro interno ao criar empresa'
		}, { status: 500 });
	}
}
