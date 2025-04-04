import { NextResponse } from 'next/server';
import { Space } from '@/types/database'; 
import { ISpaceRepository } from '@/repositories/interfaces'; 
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase'; 

const getUserIdPlaceholder = (): string | null => {
  return 'placeholder-auth-user-id-app-router';
};

export async function POST(request: Request) {
  const authenticatedUserId = getUserIdPlaceholder();
  if (!authenticatedUserId) {
    return NextResponse.json({ message: 'Unauthorized - Proper Auth Needed' }, { status: 401 });
  }

  try {
    const spaceDataFromRequest: Partial<Space> = await request.json();

    if (!spaceDataFromRequest.name || !spaceDataFromRequest.type || !spaceDataFromRequest.companyId) {
      return NextResponse.json({ message: 'Missing required fields: name, type, companyId' }, { status: 400 });
    }

    const dataToCreate = {
      ...spaceDataFromRequest,
    };

    delete dataToCreate.id;
    delete dataToCreate.createdAt;
    delete dataToCreate.updatedAt;

    const spaceToCreateRepoInput = dataToCreate as Omit<Space, 'id' | 'createdAt' | 'updatedAt'>; 

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

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
