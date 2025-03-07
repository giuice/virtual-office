// src/pages/api/users/[id]/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserByFirebaseId, updateUser } from '@/lib/dynamo';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // GET request - retrieve user
  if (req.method === 'GET') {
    try {
      const user = await getUserByFirebaseId(id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.status(200).json({ user });
    } catch (error) {
      console.error('Error retrieving user:', error);
      return res.status(500).json({ 
        error: 'Failed to retrieve user',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // PUT request - update user
  else if (req.method === 'PUT') {
    try {
      const userData = req.body;
      
      await updateUser(id, userData);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ 
        error: 'Failed to update user',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Method not allowed
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
