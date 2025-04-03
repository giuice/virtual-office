import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
import { NextResponse } from 'next/server';

const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

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