import { NextRequest, NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';

export async function POST(req: NextRequest) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    // Use supabaseUid instead of firebaseUid
    const { token, supabaseUid } = await req.json();

    // Validate input
    if (!token || !supabaseUid) {
      return NextResponse.json({ error: 'Missing required fields: token, supabaseUid' }, { status: 400 });
    }

    // 1. Get and validate invitation using repository
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found or invalid' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation already used or expired' }, { status: 400 });
    }

    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      await invitationRepository.updateStatus(token, 'expired');
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 }); // Use 410 Gone for expired
    }

    // 2. Check if user profile already exists for this supabaseUid using repository
    // Assuming findById looks up by supabase_uid (adjust if method name is different)
    let userProfile = await userRepository.findById(supabaseUid);
    let userIdToUpdate: string | undefined = userProfile?.id; // Store the database ID if user exists

    if (userProfile) {
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        return NextResponse.json({ error: 'User already belongs to another company' }, { status: 409 });
      } else if (!userProfile.companyId) {
        // User exists but has no company - update their profile using repository
        // Use the database ID (userIdToUpdate) for the update
        console.log(`Updating existing user ${userIdToUpdate} (supabaseUid: ${supabaseUid}) with company ${invitation.companyId} and role ${invitation.role}`);
        const updatedUser = await userRepository.update(userIdToUpdate!, {
          companyId: invitation.companyId,
          role: invitation.role
        });
        if (!updatedUser) {
          throw new Error(`Failed to associate user ${userIdToUpdate} with company ${invitation.companyId}`);
        }
        userProfile = updatedUser; // Use the updated user profile
      }
      // If userProfile.companyId === invitation.companyId, no profile update needed.
    } else {
      // 3b. User does not exist - create new user profile using repository
      console.log(`Creating new user for supabaseUid ${supabaseUid} with email ${invitation.email}`);
      // Prepare data for repository create method
      const newUserData: Omit<User, 'id' | 'createdAt' | 'lastActive'> = {
        email: invitation.email,
        supabase_uid: supabaseUid, // Use supabase_uid field
        companyId: invitation.companyId,
        role: invitation.role,
        displayName: 'New User', // Placeholder
        status: 'online', // Initial status
        preferences: { theme: 'light', notifications: true } // Default preferences
      };

      const newUser = await userRepository.create(newUserData);
      if (!newUser) {
        throw new Error(`Failed to create user profile for supabaseUid ${supabaseUid}`);
      }
      userProfile = newUser; // Assign created user
    }

    // 4. Invalidate the invitation token using repository
    const updatedInvitation = await invitationRepository.updateStatus(token, 'accepted');
    if (!updatedInvitation) {
      // If this fails, log it but continue as the user association succeeded
      console.error(`Failed to update invitation status for token ${token}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully',
      user: userProfile
    }, { status: 200 });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to accept invitation';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}