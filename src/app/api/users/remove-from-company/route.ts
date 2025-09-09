import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';
import { Space } from '@/types/database';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

// Instantiate repositories per-request inside handler

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(supabase as any);
    const { userId, companyId } = await request.json();

    if (!userId || !companyId) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Update the user to remove company association using repository
    await userRepository.updateCompanyAssociation(userId, null);

    // 2. Remove user from any occupied spaces using the new presence system
    // With the new schema, users track their own location via currentSpaceId
    // So we just need to clear the user's current space
    const user = await userRepository.findById(userId);
    if (user?.currentSpaceId) {
      // Clear the user's current space location
      await userRepository.update(userId, { currentSpaceId: null });
      console.log(`Removed user ${userId} from space ${user.currentSpaceId}`);
    }

    return NextResponse.json(
      { message: 'User removed from company successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error removing user from company:', error);
    return NextResponse.json({ 
      message: 'Failed to remove user from company',
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}