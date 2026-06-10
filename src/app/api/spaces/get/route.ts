import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ message: 'Company ID is required' }, { status: 400 });
    }

    if (companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot access spaces outside your company' }, { status: 403 });
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);

    // Use the repository method to fetch spaces
    const spaces = await spaceRepository.findByCompany(companyId);

    

    return NextResponse.json({ spaces: spaces });
  } catch (error: unknown) {
    console.error('Error fetching spaces:', error);
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Failed to fetch spaces' }, { status: 500 });
  }
}
