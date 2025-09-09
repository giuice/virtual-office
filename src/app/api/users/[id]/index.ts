// src/pages/api/users/[id]/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { User } from '@/types/database'; // Import User type
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = await createSupabaseServerClient();
  const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // GET request - retrieve user
  if (req.method === 'GET') {
    try {
      // Use findById from the repository
      const user: User | null = await userRepository.findById(id);
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      return res.status(200).json({ success: true, user });
    } catch (error) {
      console.error('Error retrieving user:', error);
      return res.status(500).json({ 
        success: false, error: 'Failed to retrieve user',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // PUT request - update user
  // DELETE request - delete user
  else if (req.method === 'DELETE') {
    try {
      const deleted = await userRepository.deleteById(id);
      
      if (!deleted) {
        // This could mean the user wasn't found or delete failed for other reasons
        return res.status(404).json({ success: false, message: 'User not found or delete failed' });
      }
      
      return res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete user',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Method not allowed
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
