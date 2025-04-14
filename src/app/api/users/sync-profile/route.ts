// src/app/api/users/sync-profile/route.ts
import { NextResponse } from 'next/server';
// import { cookies } from 'next/headers'; // No longer needed directly here
// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'; // Replaced
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use the new server client helper
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';


const userRepository: IUserRepository = new SupabaseUserRepository();

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient(); // Use the async helper

    // First verify the user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userData = await request.json();

    // Validate required fields
    if (!userData.supabaseUid || !userData.email) {
      return NextResponse.json(
        { error: 'Missing required fields: supabaseUid and email are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await userRepository.findBySupabaseUid(userData.supabaseUid);
    if (existingUser) {
      return NextResponse.json({
        success: true,
        user: existingUser,
        message: 'User profile already exists'
      });
    }

    // Create new user profile
    const newUser = await userRepository.create({
      supabase_uid: userData.supabaseUid,
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      status: userData.status || 'online',
      companyId: userData.companyId,
      role: userData.role || 'member',
      preferences: {}
    });

    return NextResponse.json({
      success: true,
      user: newUser,
      message: 'User profile created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error in sync-profile:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync user profile'
    }, { status: 500 });
  }
}
