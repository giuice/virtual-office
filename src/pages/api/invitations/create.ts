import { NextApiRequest, NextApiResponse } from 'next';
import { createInvitation, TABLES } from '@/lib/dynamo'; // Assuming TABLES is exported from dynamo
import { getCompany } from '@/lib/dynamo'; // Import getCompany
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

    // TODO: Verify companyId exists and requesting user is an admin
    // const company = await getCompany(companyId);
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

    const invitationData: Omit<Invitation, 'createdAt' | 'status'> = {
      token,
      email,
      companyId,
      role: role as UserRole,
      expiresAt,
    };

    // Save invitation to database
    await createInvitation(invitationData);

    // TODO: Trigger email sending logic here (using Resend, SendGrid, etc.)
    // Example:
    // await sendInvitationEmail({
    //   to: email,
    //   token: token,
    //   companyName: company?.name || 'the company'
    // });

    return res.status(201).json({ success: true, message: 'Invitation created successfully' });

  } catch (error) {
    console.error('Error creating invitation:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invitation'
    });
  }
}
