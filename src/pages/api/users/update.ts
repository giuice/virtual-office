// src/pages/api/users/update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { updateUser } from '@/lib/dynamo';
import { User } from '@/types/database';

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

    // Update the user
    await updateUser(id, userData);
    
    // Return success
    return res.status(200).json({ 
      success: true, 
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