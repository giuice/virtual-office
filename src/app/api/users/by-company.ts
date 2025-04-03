// src/pages/api/users/by-company.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { User } from '@/types/database'; // Corrected import path

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
    const { companyId } = req.query;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid companyId parameter' });
    }

    // Get users by company
    // Get users by company using the repository
    const users: User[] = await userRepository.findByCompany(companyId);
    
    // Return success with users
    return res.status(200).json({ 
      success: true, 
      users
    });
  } catch (error) {
    console.error('Error getting users by company:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get users' 
    });
  }
}