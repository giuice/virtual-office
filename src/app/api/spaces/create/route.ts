import { NextResponse } from 'next/server';
import { Space } from '@/types/database'; 
import { ISpaceRepository } from '@/repositories/interfaces'; 
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase'; 
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

const getUserIdPlaceholder = async (request: Request): Promise<string | null> => {
  try {
    // Try to get the user ID from the request headers
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // This is a simplified example - in a real app, you'd verify the token
      const token = authHeader.substring(7);
      // You would decode and verify the token here
      // For now, we'll just return a placeholder
      return 'auth-header-user-id';
    }
    
    // If no auth header, try to get the user from Supabase auth
    const cookieStore = cookies();
    const supabase = createServerComponentClient({ cookies: () => cookieStore });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      return user.id;
    }
    
    // Fallback to placeholder if all else fails
    return 'placeholder-auth-user-id-app-router';
  } catch (error) {
    console.error('Error getting authenticated user ID:', error);
    return null;
  }
};

export async function POST(request: Request) {
  try {
    const authenticatedUserId = await getUserIdPlaceholder(request);
    if (!authenticatedUserId) {
      return NextResponse.json({ message: 'Unauthorized - Proper Auth Needed' }, { status: 401 });
    }

    const spaceDataFromRequest: Partial<Space> = await request.json();

    if (!spaceDataFromRequest.name || !spaceDataFromRequest.type || !spaceDataFromRequest.companyId) {
      return NextResponse.json({ message: 'Missing required fields: name, type, companyId' }, { status: 400 });
    }

    // Get the current user's ID from the request or auth context
    // For now, we'll use the Firebase UID from the request if available, or the placeholder
    const currentUserId = spaceDataFromRequest.createdBy || authenticatedUserId;
    
    // Ensure userIds is an array and includes the current user
    let userIds = spaceDataFromRequest.userIds || [];
    if (!userIds.includes(currentUserId)) {
      userIds = [...userIds, currentUserId];
    }

    const dataToCreate = {
      ...spaceDataFromRequest,
      userIds, // Add the current user to the space
      createdBy: currentUserId // Ensure createdBy is set
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
