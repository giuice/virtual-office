import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';

// TODO: Implement proper authentication
const getUserIdFromRequest = (): string | null => {
  // Replace with actual authentication logic
  return 'placeholder-auth-user-id-app-router';
};

// TODO: Implement proper authorization check
const canUpdateSpace = async (userId: string, spaceId: string, repository: ISpaceRepository): Promise<boolean> => {
  // Example: Check if user is admin or creator of the space
  // const space = await repository.findById(spaceId);
  // return space?.createdBy === userId || userHasAdminRole(userId);
  return true; // Placeholder
};

export async function PUT(request: Request) {
  try {
    // Authentication check
    const authenticatedUserId = getUserIdFromRequest();
    if (!authenticatedUserId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { id: spaceId, ...updateData } = await request.json();

    if (!spaceId) {
      return NextResponse.json(
        { message: 'Space ID is required' },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: 'Missing update data in request body' },
        { status: 400 }
      );
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

    // Authorization check
    const authorized = await canUpdateSpace(authenticatedUserId, spaceId, spaceRepository);
    if (!authorized) {
      return NextResponse.json(
        { message: 'Forbidden: User cannot update this space' },
        { status: 403 }
      );
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.createdBy;
    delete updateData.companyId;

    const updatedSpace = await spaceRepository.update(spaceId, updateData);

    if (!updatedSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedSpace);
  } catch (error: any) {
    console.error('Error updating space:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
