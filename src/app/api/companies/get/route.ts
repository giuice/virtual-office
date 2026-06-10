import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    if (id !== authContext.dbUser.companyId) {
      return NextResponse.json({ error: 'Cannot access companies outside your account' }, { status: 403 });
    }

    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(authContext.supabase);
    const company = await companyRepository.findById(id);
    
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      company 
    });
  } catch (error) {
    console.error('Error getting company:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to get company' 
    }, { status: 500 });
  }
}
