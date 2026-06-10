import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth/session';

// Instantiate repositories per-request inside handler

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    if (authContext.dbUser.role !== 'admin') {
      return NextResponse.json({ message: 'Only admins can remove users from a company' }, { status: 403 });
    }

    const userRepository: IUserRepository = new SupabaseUserRepository(authContext.supabase);
    const { userId, companyId } = await request.json();

    if (!userId || !companyId) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot remove users outside your company' }, { status: 403 });
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    if (user.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot remove users outside your company' }, { status: 403 });
    }

    // 1. Update the user to remove company association using repository
    await userRepository.updateCompanyAssociation(userId, null);

    // 2. Remove user from any occupied spaces using the new presence system
    // With the new schema, users track their own location via currentSpaceId
    // So we just need to clear the user's current space
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
