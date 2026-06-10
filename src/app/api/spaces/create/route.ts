import { NextResponse } from 'next/server';
import { Space } from '@/types/database'; 
import { ISpaceRepository } from '@/repositories/interfaces'; 
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase'; 
import { requireAuthUser } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const spaceDataFromRequest: Partial<Space> = await request.json();
    if (!spaceDataFromRequest.companyId || spaceDataFromRequest.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot create spaces outside your company' }, { status: 403 });
    }

    const dataToCreate = {
      ...spaceDataFromRequest,
      //userIds, // Add the current user to the space
      createdBy: authContext.dbUser.id // Ensure createdBy is set
    };

    delete dataToCreate.id;
    delete dataToCreate.createdAt;
    delete dataToCreate.updatedAt;

    const spaceToCreateRepoInput = dataToCreate as Omit<Space, 'id' | 'createdAt' | 'updatedAt'>; 

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);

    const newSpace = await spaceRepository.create(spaceToCreateRepoInput);

    return NextResponse.json(newSpace, { status: 201 });

  } catch (error: any) {
    console.error('API Error creating space:', error);
    if (error instanceof SyntaxError) {
         return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
