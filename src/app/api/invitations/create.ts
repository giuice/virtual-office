import { NextApiRequest, NextApiResponse } from 'next';
import { IInvitationRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase'; // Import implementation
// import { ICompanyRepository } from '@/repositories/interfaces'; // Potentially needed for validation
// import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase'; // Potentially needed for validation
import { Invitation, UserRole } from '@/types/database';
import crypto from 'crypto'; // Use Node.js crypto for token generation
// TODO: Add authentication check (e.g., using next-auth or firebase-admin)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  // const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(); // Instantiate if needed for validation

  try {
    // TODO: Add authentication and authorization check here
    // Ensure the requesting user is authenticated and is an admin of the target company
    // const session = await getSession({ req }); // Example using next-auth
    // if (!session || !session.user?.id) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }
    // const requestingUserId = session.user.id; // Or get from Firebase Admin SDK

    const { email, role, companyId } = req.body;

    // Validate input
    if (!email || !role || !companyId) {
      return res.status(400).json({ error: 'Missing required fields: email, role, companyId' });
    }
    if (role !== 'admin' && role !== 'member') {
        return res.status(400).json({ error: 'Invalid role specified' });
    }

    console.log('[API /invitations/create] Received request:', { email, role, companyId }); // Added log

    // TODO: Verify companyId exists and requesting user is an admin
    // const company = await companyRepository.findById(companyId);
    // if (!company) {
    //   return res.status(404).json({ error: 'Company not found' });
    // }
    // if (!company.adminIds.includes(requestingUserId)) {
    //    return res.status(403).json({ error: 'Forbidden: Only admins can invite users' });
    // }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration (e.g., 7 days from now)
    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // Expires in 7 days (Unix timestamp)

    console.log('[API /invitations/create] Generated token:', token); // Added log
    console.log('[API /invitations/create] Calculated expiresAt:', expiresAt); // Added log

    // Prepare data for repository create method
    // Assumes repository handles createdAt
    const invitationData: Omit<Invitation, 'createdAt'> = {
      token,
      email,
      companyId,
      role: role as UserRole,
      expiresAt,
      status: 'pending', // Set initial status
    };

    console.log('[API /invitations/create] Saving invitation data:', invitationData); // Added log

    // Save invitation using the repository
    await invitationRepository.create(invitationData);

    // TODO: Trigger email sending logic here (using Resend, SendGrid, etc.)
    // Example:
    // await sendInvitationEmail({
    //   to: email,
    //   token: token,
    //   companyName: company?.name || 'the company' // Use fetched company name if validation added
    // });

    return res.status(201).json({ success: true, message: 'Invitation created successfully' });

  } catch (error) {
    console.error('Error creating invitation:', error);
    // Consider more specific error handling (e.g., duplicate token if DB constraint exists)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invitation'
    });
  }
}
