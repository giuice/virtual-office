import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function GET(request: Request) {
  const supabaseClient = await createSupabaseServerClient();
  const repo: IInvitationRepository = new SupabaseInvitationRepository(supabaseClient);

  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const invitations = await repo.findByCompanyId(companyId);

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error('Error listing invitations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list invitations' },
      { status: 500 }
    );
  }
}
