// src/pages/api/users/get-by-firebase-id.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { User } from '@/types/database'; // Import User type

// Instantiate the repository
const userRepository: IUserRepository = new SupabaseUserRepository();
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { firebaseId } = req.query;
    
    if (!firebaseId || typeof firebaseId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid firebaseId parameter' });
    }

    // Get the user
    // Get the user using the repository
    const user: User | null = await userRepository.findByFirebaseUid(firebaseId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Return success with the user data
    return res.status(200).json({ 
      success: true, 
      user
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get user' 
    });
  }
}