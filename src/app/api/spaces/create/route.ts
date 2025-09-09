import { NextResponse } from 'next/server';
import { Space } from '@/types/database'; 
import { ISpaceRepository, IUserRepository } from '@/repositories/interfaces'; 
import { SupabaseSpaceRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase'; 
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(request: Request) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient(); // Use the async helper
    
    // Use getUser() instead of getSession() for better security as per warning
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Check if the user is authenticated
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const spaceDataFromRequest: Partial<Space> = await request.json();

    
    const currentSupabaseUserId =  user.id;
    console.log('Space data request:', spaceDataFromRequest);
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    const currentUserId = await userRepository.findBySupabaseUid(currentSupabaseUserId).then(user => user?.id) as string;
    const dataToCreate = {
      ...spaceDataFromRequest,
      //userIds, // Add the current user to the space
      createdBy: currentUserId // Ensure createdBy is set
    };

    delete dataToCreate.id;
    delete dataToCreate.createdAt;
    delete dataToCreate.updatedAt;

    const spaceToCreateRepoInput = dataToCreate as Omit<Space, 'id' | 'createdAt' | 'updatedAt'>; 

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(supabase);

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
