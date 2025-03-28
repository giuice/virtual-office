import { NextApiRequest, NextApiResponse } from 'next';
import {
  getInvitationByToken,
  updateInvitationStatus,
  getUserByFirebaseId,
  createUser,
  updateUser, // Assuming updateUser can update companyId and role
  TABLES
} from '@/lib/dynamo';
import { User } from '@/types/database';
// TODO: Add authentication check if needed, although firebaseUid implies authentication

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, firebaseUid } = req.body;

    // Validate input
    if (!token || !firebaseUid) {
      return res.status(400).json({ error: 'Missing required fields: token, firebaseUid' });
    }

    // 1. Get and validate invitation
    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or invalid' });
    }
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already used or expired' });
    }
    // Check expiration (expiresAt is Unix timestamp in seconds)
    if (invitation.expiresAt < Math.floor(Date.now() / 1000)) {
      // Optionally update status to 'expired' here
      await updateInvitationStatus(token, 'expired');
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // 2. Check if user profile already exists for this firebaseUid
    let userProfile = await getUserByFirebaseId(firebaseUid);

    if (userProfile) {
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        // Handle case where user is already in a *different* company
        // For now, return an error. Could allow switching later.
        return res.status(409).json({ error: 'User already belongs to another company' });
      } else if (userProfile.companyId === invitation.companyId) {
         // User already belongs to this company, just update status
         console.log(`User ${firebaseUid} already belongs to company ${invitation.companyId}. Accepting invite.`);
         await updateInvitationStatus(token, 'accepted');
         return res.status(200).json({ success: true, message: 'Invitation accepted (user already in company)' });
      } else {
        // User exists but has no company - update their profile
        console.log(`Updating existing user ${firebaseUid} with company ${invitation.companyId}`);
        await updateUser(firebaseUid, {
          companyId: invitation.companyId,
          role: invitation.role,
          // Optionally update other fields if needed
        });
      }
    } else {
      // 3b. User does not exist - create new user profile using firebaseUid as the ID
      console.log(`Creating new user ${firebaseUid} for company ${invitation.companyId}`);
      const newUser: Omit<User, 'lastActive' | 'createdAt'> & { id: string } = {
        id: firebaseUid, // Use Firebase UID as the primary ID
        email: invitation.email,
        companyId: invitation.companyId,
        role: invitation.role,
        displayName: 'New User', // Placeholder - user should update this later
        status: 'online', // Set initial status
        preferences: { // Default preferences
            theme: 'light',
            notifications: true,
        },
        // avatarUrl can be added later or fetched from Firebase Auth if available
      };
      await createUser(newUser);
    }

    // 4. Invalidate the invitation token
    await updateInvitationStatus(token, 'accepted');

    return res.status(200).json({ success: true, message: 'Invitation accepted successfully' });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    });
  }
}
