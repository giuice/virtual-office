// src/app/api/invitations/accept/route.ts
import { NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';

export async function POST(request: Request) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    // Parse the request body
    const body = await request.json();
    const { token, firebaseUid } = body;

    // Validate input
    if (!token || !firebaseUid) {
      return NextResponse.json(
        { error: 'Missing required fields: token, firebaseUid' },
        { status: 400 }
      );
    }

    console.log('Processing invitation acceptance:', { token, firebaseUid });

    // 1. Get and validate invitation using repository
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or invalid' },
        { status: 404 }
      );
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invitation already used or expired' },
        { status: 400 }
      );
    }

    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      await invitationRepository.updateStatus(token, 'expired');
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      ); // Use 410 Gone for expired
    }

    // 2. Check if user profile already exists for this firebaseUid using repository
    let userProfile = await userRepository.findByFirebaseUid(firebaseUid);

    if (userProfile) {
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        return NextResponse.json(
          { error: 'User already belongs to another company' },
          { status: 409 }
        );
      } else if (userProfile.companyId === invitation.companyId) {
        // User already belongs to this company - only need to update invitation status
        console.log('User already belongs to this company');
      } else {
        // User exists but has no company - update their profile using repository
        try {
          console.log('Updating user company association:', { 
            firebaseUid, 
            companyId: invitation.companyId 
          });
          
          // Use the user's ID (UUID) instead of Firebase UID
          const updatedUser = await userRepository.updateCompanyAssociation(userProfile.id, invitation.companyId);
          if (!updatedUser) {
            throw new Error(`Failed to associate user ${userProfile.id} with company ${invitation.companyId}`);
          }
          
          // Update the role - also use the user's ID
          await userRepository.update(userProfile.id, { role: invitation.role });
          userProfile = await userRepository.findByFirebaseUid(firebaseUid); // Re-fetch updated user
        } catch (error) {
          console.error('Error updating user:', error);
          throw error;
        }
      }
    } else {
      // 3b. User does not exist - create new user profile using repository
      try {
        console.log('Creating new user profile:', { 
          email: invitation.email,
          firebaseUid 
        });
        
        // Prepare data for repository create method
        const newUserData: Omit<User, 'id' | 'createdAt' | 'lastActive'> = {
          email: invitation.email,
          firebase_uid: firebaseUid,
          companyId: invitation.companyId,
          role: invitation.role,
          displayName: 'New User', // Placeholder
          status: 'online', // Initial status
          preferences: { theme: 'light', notifications: true } // Default preferences
        };

        const newUser = await userRepository.create(newUserData);
        if (!newUser) {
          throw new Error(`Failed to create user profile for firebaseUid ${firebaseUid}`);
        }
        userProfile = newUser; // Assign created user
      } catch (error) {
        console.error('Error creating user:', error);
        throw error;
      }
    }

    // 4. Invalidate the invitation token using repository
    try {
      console.log('Updating invitation status to accepted');
      const updatedInvitation = await invitationRepository.updateStatus(token, 'accepted');
      if (!updatedInvitation) {
        // If this fails, log it but continue as the user association succeeded
        console.error(`Failed to update invitation status for token ${token}`);
      }
    } catch (error) {
      console.error('Error updating invitation status:', error);
      // Continue anyway since the user association succeeded
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully',
      user: userProfile
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    }, { status: 500 });
  }
}