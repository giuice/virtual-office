import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';

export async function PUT(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
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

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);

    const existingSpace = await spaceRepository.findById(spaceId);
    if (!existingSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    if (existingSpace.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot update spaces outside your company' }, { status: 403 });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.createdBy;
    delete updateData.companyId;
    delete updateData.userIds; // REMOVE userIds from update payload

    const updatedSpace = await spaceRepository.update(spaceId, updateData);

    if (!updatedSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedSpace);
  } catch (error: unknown) {
    console.error('Error updating space:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
