// src/pages/api/users/[id]/status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { User, UserStatus } from '@/types/database'; // Import User and UserStatus types

// Instantiate the repository
const userRepository: IUserRepository = new SupabaseUserRepository();
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow PUT requests
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  // Explicitly type the body for clarity
  const { status, statusMessage }: { status: UserStatus, statusMessage?: string } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Validate status against the UserStatus type (basic check, more robust validation could be added)
  const validStatuses: UserStatus[] = ['online', 'offline', 'away', 'busy'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status value. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    // Update the user status using the repository
    const updatedUser = await userRepository.update(id, { status, statusMessage });

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found or update failed' });
    }

    return res.status(200).json({
      success: true,
      user: updatedUser,
      message: 'User status updated successfully'
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).json({ 
      success: false, error: 'Failed to update user status',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
