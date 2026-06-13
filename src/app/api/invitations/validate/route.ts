// src/app/api/invitations/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export interface ValidateInvitationResponse {
  valid: boolean;
  email?: string;
  companyName?: string;
  companyId?: string;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'INVALID_TOKEN' | 'SERVER_ERROR';
}

export async function GET(req: NextRequest): Promise<NextResponse<ValidateInvitationResponse>> {
  try {
    const token = req.nextUrl.searchParams.get('token');

    // Validate token presence
    if (!token || token.trim() === '') {
      return NextResponse.json({
        valid: false,
        error: 'Token não fornecido',
        errorCode: 'INVALID_TOKEN',
      }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient('service_role');

    // Fetch invitation with company name in a single query
    const { data: invitation, error: invitationError } = await supabase
      .from('invitations')
      .select(`
        id,
        token,
        email,
        company_id,
        role,
        expires_at,
        status,
        created_at,
        companies!invitations_company_id_fkey (
          id,
          name
        )
      `)
      .eq('token', token)
      .single();

    if (invitationError) {
      if (invitationError.code === 'PGRST116') {
        // Row not found
        return NextResponse.json({
          valid: false,
          error: 'Convite não encontrado',
          errorCode: 'NOT_FOUND',
        }, { status: 404 });
      }
      console.error('Error fetching invitation:', invitationError);
      return NextResponse.json({
        valid: false,
        error: 'Erro ao validar convite',
        errorCode: 'SERVER_ERROR',
      }, { status: 500 });
    }

    if (!invitation) {
      return NextResponse.json({
        valid: false,
        error: 'Convite não encontrado',
        errorCode: 'NOT_FOUND',
      }, { status: 404 });
    }

    // Check if already used
    if (invitation.status === 'accepted') {
      return NextResponse.json({
        valid: false,
        error: 'Este convite já foi utilizado',
        errorCode: 'ALREADY_USED',
      }, { status: 400 });
    }

    // Check if expired by status
    if (invitation.status === 'expired') {
      return NextResponse.json({
        valid: false,
        error: 'Este convite expirou',
        errorCode: 'EXPIRED',
      }, { status: 400 });
    }

    // Check expiration date
    if (invitation.expires_at) {
      const expiresAt = new Date(invitation.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        return NextResponse.json({
          valid: false,
          error: 'Este convite expirou',
          errorCode: 'EXPIRED',
        }, { status: 400 });
      }
    }

    // Check status is pending
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        valid: false,
        error: 'Convite inválido',
        errorCode: 'INVALID_TOKEN',
      }, { status: 400 });
    }

    // Extract company name from joined data
    // Supabase returns array for FK joins, but single() returns single object
    const companyData = invitation.companies as unknown;
    let companyName = 'Empresa';
    if (companyData && typeof companyData === 'object' && 'name' in companyData) {
      companyName = (companyData as { name: string }).name;
    }

    return NextResponse.json({
      valid: true,
      email: invitation.email,
      companyName,
      companyId: invitation.company_id,
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error validating invitation:', error);
    return NextResponse.json({
      valid: false,
      error: 'Erro interno do servidor',
      errorCode: 'SERVER_ERROR',
    }, { status: 500 });
  }
}
