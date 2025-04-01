// src/pages/api/users/create.ts
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
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userData: Partial<User> = req.body; // Add type hint
    
    // Validate required fields
    if (!userData.email || !userData.companyId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create the user using the repository
    // We've validated required fields, so assert the type
    const createdUser = await userRepository.create(userData as Omit<User, 'id' | 'createdAt' | 'lastActive'>);
    
    // Return success with the created user object
    return res.status(201).json({
      success: true,
      user: createdUser,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create user' 
    });
  }
}