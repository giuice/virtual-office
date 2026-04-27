import { NextResponse } from 'next/server';
import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import type { Company } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    // Authenticate the caller (server-side: use getUser, not getSession)
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const companyData: Partial<Omit<Company, 'id' | 'createdAt' | 'updatedAt'>> = await request.json();

    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(supabase);
    const updatedCompany = await companyRepository.update(id, companyData);

    if (!updatedCompany) {
      return NextResponse.json({ success: false, message: 'Company not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      company: updatedCompany,
      message: 'Company updated successfully',
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update company',
    }, { status: 500 });
  }
}
