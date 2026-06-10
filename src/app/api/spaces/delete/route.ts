import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';

export async function DELETE(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('id') || searchParams.get('spaceId');

    if (!spaceId) {
      return NextResponse.json(
        { message: 'Space ID is required' },
        { status: 400 }
      );
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);

    const existingSpace = await spaceRepository.findById(spaceId);
    if (!existingSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found or delete failed` },
        { status: 404 }
      );
    }

    if (existingSpace.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot delete spaces outside your company' }, { status: 403 });
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
  } catch (error: unknown) {
    console.error('Error deleting space:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to delete space' },
      { status: 500 }
    );
  }
}
