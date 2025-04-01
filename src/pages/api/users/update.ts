// src/pages/api/users/update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { User } from '@/types/database'; // Keep User type import

// Instantiate the repository
const userRepository: IUserRepository = new SupabaseUserRepository();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow PUT or PATCH method
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const userData: Partial<User> = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid id parameter' });
    }

    // Update the user using the repository
    const updatedUser = await userRepository.update(id, userData);

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found or update failed' });
    }
    
    // Return success with the updated user object
    return res.status(200).json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update user' 
    });
  }
}