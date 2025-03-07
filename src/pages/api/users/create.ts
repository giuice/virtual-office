// src/pages/api/users/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createUser } from '@/lib/dynamo';
import { User } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userData = req.body;
    
    // Validate required fields
    if (!userData.email || !userData.companyId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create the user
    const userId = await createUser(userData);
    
    // Return success with the ID
    return res.status(201).json({ 
      success: true, 
      userId, 
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