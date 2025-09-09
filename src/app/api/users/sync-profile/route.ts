// src/app/api/users/sync-profile/route.ts
import { NextResponse } from 'next/server';
// import { cookies } from 'next/headers'; // No longer needed directly here
// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'; // Replaced
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use the new server client helper
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';

// Helper function to validate Google avatar URLs
function isValidGoogleAvatarUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Check for Google domains
    const googleDomains = [
      'googleapis.com',
      'googleusercontent.com',
      'google.com'
    ];
    
    const isGoogleDomain = googleDomains.some(domain => 
      parsedUrl.hostname.includes(domain)
    );
    
    if (!isGoogleDomain) {
      return false;
    }
    
    // Check for HTTPS protocol
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}



export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient(); // Use the async helper

    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);

    // First verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
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

    // Validate Google avatar URL if provided
    if (userData.googleAvatarUrl) {
      if (typeof userData.googleAvatarUrl !== 'string') {
        return NextResponse.json(
          { error: 'Invalid googleAvatarUrl: must be a string' },
          { status: 400 }
        );
      }
      
      if (!isValidGoogleAvatarUrl(userData.googleAvatarUrl)) {
        console.warn('Invalid Google avatar URL provided:', userData.googleAvatarUrl);
        // Don't fail the request, just log the warning and continue without the avatar
        userData.googleAvatarUrl = undefined;
      }
    }

    // Check if user already exists
    const existingUser = await userRepository.findBySupabaseUid(userData.supabaseUid);
    if (existingUser) {
      // If user exists but we have a Google avatar URL to update, update it
      if (userData.googleAvatarUrl && userData.googleAvatarUrl !== existingUser.avatarUrl) {
        console.log('Updating existing user with Google avatar URL:', {
          userId: existingUser.id,
          currentAvatarUrl: existingUser.avatarUrl,
          newGoogleAvatarUrl: userData.googleAvatarUrl
        });
        
        try {
          const updatedUser = await userRepository.update(existingUser.id, {
            avatarUrl: userData.googleAvatarUrl
          });
          
          return NextResponse.json({
            success: true,
            user: updatedUser,
            message: 'User profile updated with Google avatar'
          });
        } catch (updateError) {
          console.error('Error updating user with Google avatar:', updateError);
          // Return existing user if update fails
          return NextResponse.json({
            success: true,
            user: existingUser,
            message: 'User profile exists, avatar update failed'
          });
        }
      }
      
      return NextResponse.json({
        success: true,
        user: existingUser,
        message: 'User profile already exists'
      });
    }

    // Create new user profile with Google avatar if provided
    const newUser = await userRepository.create({
      supabase_uid: userData.supabaseUid,
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      status: userData.status || 'online',
      companyId: userData.companyId,
      role: userData.role || 'member',
      preferences: {},
      avatarUrl: userData.googleAvatarUrl || undefined, // Store Google avatar URL if provided
      currentSpaceId: null
    });

    console.log('Created new user profile with Google avatar:', {
      userId: newUser.id,
      email: newUser.email,
      hasGoogleAvatar: !!userData.googleAvatarUrl
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
