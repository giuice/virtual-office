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

    console.log('[API /invitations/accept] Received request:', { token, firebaseUid }); // Added log

    // 1. Get and validate invitation
    console.log(`[API /invitations/accept] Fetching invitation for token: ${token}`); // Added log
    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      console.error(`[API /invitations/accept] Invitation not found for token: ${token}`); // Added log
      return res.status(404).json({ error: 'Invitation not found or invalid' });
    }
    console.log('[API /invitations/accept] Found invitation:', invitation); // Added log
    if (invitation.status !== 'pending') {
      console.warn(`[API /invitations/accept] Invitation status is not pending: ${invitation.status}`); // Added log
      return res.status(400).json({ error: 'Invitation already used or expired' });
    }
    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      console.warn(`[API /invitations/accept] Invitation expired at ${invitation.expiresAt} (current time ${now})`); // Added log
      // Optionally update status to 'expired' here
      await updateInvitationStatus(token, 'expired');
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // 2. Check if user profile already exists for this firebaseUid
    console.log(`[API /invitations/accept] Checking for existing user with firebaseUid: ${firebaseUid}`); // Added log
    let userProfile = await getUserByFirebaseId(firebaseUid);

    if (userProfile) {
      console.log('[API /invitations/accept] Found existing user profile:', userProfile); // Added log
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        // Handle case where user is already in a *different* company
        // For now, return an error. Could allow switching later.
        console.warn(`[API /invitations/accept] User ${firebaseUid} already belongs to different company ${userProfile.companyId}`); // Added log
        return res.status(409).json({ error: 'User already belongs to another company' });
      } else if (userProfile.companyId === invitation.companyId) {
         // User already belongs to this company, just update status
         console.log(`[API /invitations/accept] User ${firebaseUid} already belongs to company ${invitation.companyId}. Updating invite status.`); // Added log
         await updateInvitationStatus(token, 'accepted');
         return res.status(200).json({ success: true, message: 'Invitation accepted (user already in company)' });
      } else {
        // User exists but has no company - update their profile
        console.log(`[API /invitations/accept] Updating existing user ${firebaseUid} with company ${invitation.companyId} and role ${invitation.role}`); // Added log
        await updateUser(firebaseUid, {
          companyId: invitation.companyId,
          role: invitation.role,
          // Optionally update other fields if needed
        });
      }
    } else {
      // 3b. User does not exist - create new user profile using firebaseUid as the ID
      console.log(`[API /invitations/accept] User profile not found for ${firebaseUid}. Creating new user.`); // Added log
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
      console.log('[API /invitations/accept] Creating user with data:', newUser); // Added log
      await createUser(newUser);
    }

    // 4. Invalidate the invitation token
    console.log(`[API /invitations/accept] Updating invitation status to 'accepted' for token: ${token}`); // Added log
    await updateInvitationStatus(token, 'accepted');

    console.log('[API /invitations/accept] Invitation accepted successfully.'); // Added log
    return res.status(200).json({ success: true, message: 'Invitation accepted successfully' });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    });
  }
}
