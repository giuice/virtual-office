import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { Space } from '@/types/database';

export async function GET(request: Request) {
  // Get companyId from URL params
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ message: 'Company ID is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(supabase);

  try {
    // Use the repository method to fetch spaces
    const spaces = await spaceRepository.findByCompany(companyId);

    

    return NextResponse.json({ spaces: spaces });
  } catch (error: any) {
    console.error('Error fetching spaces:', error);
    return NextResponse.json({ message: error.message || 'Failed to fetch spaces' }, { status: 500 });
  }
}
