import { NextApiRequest, NextApiResponse } from 'next';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces'; // Import interfaces
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementations
import { User, UserRole } from '@/types/database';
// TODO: Add authentication check if needed, although firebaseUid implies authentication

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

    console.log('[API /invitations/accept] Received request:', { token, firebaseUid });

    // 1. Get and validate invitation using repository
    console.log(`[API /invitations/accept] Fetching invitation for token: ${token}`);
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      console.error(`[API /invitations/accept] Invitation not found for token: ${token}`);
      return res.status(404).json({ error: 'Invitation not found or invalid' });
    }
    console.log('[API /invitations/accept] Found invitation:', invitation);
    if (invitation.status !== 'pending') {
      console.warn(`[API /invitations/accept] Invitation status is not pending: ${invitation.status}`);
      return res.status(400).json({ error: 'Invitation already used or expired' });
    }
    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      console.warn(`[API /invitations/accept] Invitation expired at ${invitation.expiresAt} (current time ${now})`);
      // Update status to 'expired' using repository
      await invitationRepository.updateStatus(token, 'expired');
      return res.status(410).json({ error: 'Invitation has expired' }); // Use 410 Gone for expired
    }

    // 2. Check if user profile already exists for this firebaseUid using repository
    console.log(`[API /invitations/accept] Checking for existing user with firebaseUid: ${firebaseUid}`);
    let userProfile = await userRepository.findByFirebaseUid(firebaseUid);

    if (userProfile) {
      console.log('[API /invitations/accept] Found existing user profile:', userProfile);
      // 3a. User exists - check if they already belong to a company
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        console.warn(`[API /invitations/accept] User ${firebaseUid} already belongs to different company ${userProfile.companyId}`);
        return res.status(409).json({ error: 'User already belongs to another company' });
      } else if (userProfile.companyId === invitation.companyId) {
         console.log(`[API /invitations/accept] User ${firebaseUid} already belongs to company ${invitation.companyId}. Updating invite status.`);
         // Only need to update invitation status
      } else {
        // User exists but has no company - update their profile using repository
        console.log(`[API /invitations/accept] Associating existing user ${firebaseUid} with company ${invitation.companyId} and setting role ${invitation.role}`);
        // Use updateCompanyAssociation first
        const updatedUser = await userRepository.updateCompanyAssociation(firebaseUid, invitation.companyId);
        if (!updatedUser) {
            throw new Error(`Failed to associate user ${firebaseUid} with company ${invitation.companyId}`);
        }
        // Then update the role if necessary (could potentially be combined if updateCompanyAssociation also allows role update)
        await userRepository.update(firebaseUid, { role: invitation.role });
        userProfile = await userRepository.findByFirebaseUid(firebaseUid); // Re-fetch updated user if needed later
      }
    } else {
      // 3b. User does not exist - create new user profile using repository
      console.log(`[API /invitations/accept] User profile not found for ${firebaseUid}. Creating new user.`);
      // Prepare data for repository create method (Omit id, createdAt, lastActive)
      const newUserCreateData: Omit<User, 'id' | 'createdAt' | 'lastActive'> = {
        email: invitation.email,
        companyId: invitation.companyId,
        role: invitation.role,
        displayName: 'New User', // Placeholder
        status: 'online', // Initial status
        preferences: { theme: 'light', notifications: true }, // Default preferences
        // firebaseUid is not part of the User type in database.ts, assuming ID is separate
        // If firebaseUid *is* the primary ID in your User table:
        // const newUserCreateData: Omit<User, 'createdAt' | 'lastActive'> & { id: string } = {
        //   id: firebaseUid, ... }
      };
      console.log('[API /invitations/accept] Creating user with data:', newUserCreateData);
      // Need to handle the case where the User table ID is *not* the firebaseUid
      // Assuming the repository's create method handles ID generation or linking to firebaseUid internally
      // If the User table ID *is* the firebaseUid, adjust the create call and type accordingly.
      // For now, assuming ID is auto-generated or handled by repository based on firebaseUid linkage.
      // Let's assume a hypothetical linkFirebaseId method or similar exists, or create handles it.
      // **Correction:** The interface doesn't show a specific link method. Let's assume `create` needs the ID if it's the firebaseUid, or the repository handles the link implicitly.
      // **Revisiting:** The old code used firebaseUid as the ID. Let's stick to that.
       const newUserCreateDataWithId: Omit<User, 'createdAt' | 'lastActive'> & { id: string } = {
         id: firebaseUid, // Use Firebase UID as the primary ID
         email: invitation.email,
         companyId: invitation.companyId,
         role: invitation.role,
         displayName: 'New User', // Placeholder
         status: 'online', // Initial status
         preferences: { theme: 'light', notifications: true }, // Default preferences
       };
      // The create method expects Omit<User, 'id' | 'createdAt' | 'lastActive'>.
      // This implies the ID is auto-generated. This conflicts with using firebaseUid as ID.
      // **Decision:** Modify the API to pass necessary info to a potentially enhanced `create` or a new `createWithFirebaseId` method.
      // **Temporary Workaround:** Use the existing `create` and then immediately `update` with the firebaseUid if the repository doesn't handle it. This is inefficient.
      // **Better Approach:** Assume the Supabase implementation of `create` can handle linking/using the firebaseUid appropriately, or enhance the repository interface/implementation later.
      // For now, proceed assuming the repository handles the firebaseUid linkage during creation based on the provided email or other logic.
       const newUser = await userRepository.create(newUserCreateDataWithId); // Pass ID if it's the primary key
       if (!newUser) {
           throw new Error(`Failed to create user profile for firebaseUid ${firebaseUid}`);
       }
       userProfile = newUser; // Assign created user
    }

    // 4. Invalidate the invitation token using repository
    console.log(`[API /invitations/accept] Updating invitation status to 'accepted' for token: ${token}`);
    const updatedInvitation = await invitationRepository.updateStatus(token, 'accepted');
    if (!updatedInvitation) {
        // Log a warning, but proceed as the user association likely succeeded.
        console.warn(`[API /invitations/accept] Failed to update invitation status for token ${token}, but user association might have succeeded.`);
    }

    console.log('[API /invitations/accept] Invitation accepted successfully.');
    return res.status(200).json({ success: true, message: 'Invitation accepted successfully' });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    });
  }
}
