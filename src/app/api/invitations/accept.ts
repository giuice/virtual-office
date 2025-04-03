import { NextApiRequest, NextApiResponse } from 'next';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    const { token, firebaseUid } = req.body;

    // Validate input
    if (!token || !firebaseUid) {
      return res.status(400).json({ error: 'Missing required fields: token, firebaseUid' });
    }

    // 1. Get and validate invitation using repository
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or invalid' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already used or expired' });
    }

    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      await invitationRepository.updateStatus(token, 'expired');
      return res.status(410).json({ error: 'Invitation has expired' }); // Use 410 Gone for expired
    }

    // 2. Check if user profile already exists for this firebaseUid using repository
    let userProfile = await userRepository.findByFirebaseUid(firebaseUid);

    if (userProfile) {
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        return res.status(409).json({ error: 'User already belongs to another company' });
      } else if (userProfile.companyId === invitation.companyId) {
        // User already belongs to this company - only need to update invitation status
      } else {
        // User exists but has no company - update their profile using repository
        const updatedUser = await userRepository.updateCompanyAssociation(firebaseUid, invitation.companyId);
        if (!updatedUser) {
          throw new Error(`Failed to associate user ${firebaseUid} with company ${invitation.companyId}`);
        }
        // Update the role
        await userRepository.update(firebaseUid, { role: invitation.role });
        userProfile = await userRepository.findByFirebaseUid(firebaseUid); // Re-fetch updated user
      }
    } else {
      // 3b. User does not exist - create new user profile using repository

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
    }

    // 4. Invalidate the invitation token using repository
    const updatedInvitation = await invitationRepository.updateStatus(token, 'accepted');
    if (!updatedInvitation) {
      // If this fails, log it but continue as the user association succeeded
      console.error(`Failed to update invitation status for token ${token}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully',
      user: userProfile
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    });
  }
}
