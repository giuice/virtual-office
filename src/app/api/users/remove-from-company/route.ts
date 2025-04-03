import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';
import { Space } from '@/types/database';
import { NextResponse } from 'next/server';

// Instantiate repositories
const userRepository: IUserRepository = new SupabaseUserRepository();
const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { userId, companyId } = await request.json();

    if (!userId || !companyId) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Update the user to remove company association using repository
    await userRepository.updateCompanyAssociation(userId, null);

    // 2. Update spaces to remove user from any occupied spaces using repository
    // First, find spaces occupied by the user in the company
    const allSpacesInCompany: Space[] = await spaceRepository.findByCompany(companyId);
    // Then filter locally to find spaces occupied by the user
    const occupiedSpaces = allSpacesInCompany.filter(space =>
      space.userIds && space.userIds.includes(userId)
    );

    // Then update each space to remove the user
    if (occupiedSpaces && occupiedSpaces.length > 0) {
      const updatePromises = occupiedSpaces.map(space => {
        const currentUserIds = space.userIds || [];
        const updatedUserIds = currentUserIds.filter((id: string) => id !== userId);
        return spaceRepository.update(space.id, { userIds: updatedUserIds });
      });

      await Promise.all(updatePromises);
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