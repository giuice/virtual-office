import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';

// TODO: Implement proper authentication
const getUserIdFromRequest = (): string | null => {
  // Replace with actual authentication logic
  return 'placeholder-auth-user-id-app-router';
};

// TODO: Implement proper authorization check
const canDeleteSpace = async (userId: string, spaceId: string, repository: ISpaceRepository): Promise<boolean> => {
  // Example: Check if user is admin or creator of the space
  // const space = await repository.findById(spaceId);
  // return space?.createdBy === userId || userHasAdminRole(userId);
  return true; // Placeholder
};

export async function DELETE(request: Request) {
  // Authentication check
  const authenticatedUserId = getUserIdFromRequest();
  if (!authenticatedUserId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('id');

  if (!spaceId) {
    return NextResponse.json(
      { message: 'Space ID is required' },
      { status: 400 }
    );
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    // Authorization check
    const authorized = await canDeleteSpace(authenticatedUserId, spaceId, spaceRepository);
    if (!authorized) {
      return NextResponse.json(
        { message: 'Forbidden: User cannot delete this space' },
        { status: 403 }
      );
    }

    const success = await spaceRepository.deleteById(spaceId);

    if (!success) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found or delete failed` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Space deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error deleting space:', error);
    return NextResponse.json(
      { message: error.message || 'Failed to delete space' },
      { status: 500 }
    );
  }
}
