// src/pages/api/spaces/update.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { Space } from '@/types/database';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';

// TODO: Implement proper authentication
const getUserIdFromRequest = (req: NextApiRequest): string | null => {
  // Replace with actual authentication logic
  return 'placeholder-auth-user-id';
};

// TODO: Implement proper authorization check
const canUpdateSpace = async (userId: string, spaceId: string, repository: ISpaceRepository): Promise<boolean> => {
  // Example: Check if user is admin or creator of the space
  // const space = await repository.findById(spaceId);
  // return space?.createdBy === userId || userHasAdminRole(userId);
  return true; // Placeholder
};


export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const authenticatedUserId = getUserIdFromRequest(req);
  if (!authenticatedUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userRepository = new SupabaseUserRepository();

  try {
    const { id: spaceId } = req.body;

    if (!spaceId) {
      return res.status(400).json({ message: 'Missing required field: id (spaceId)' });
    }

    // Fetch current user
    const user = await userRepository.findById(authenticatedUserId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If already in this space, skip update
    if (user.current_space_id === spaceId) {
      console.log('[API] User already in this space, skipping update');
      return res.status(200).json(user);
    }

    // Update the user's current_space_id ONLY
    const updatedUser = await userRepository.updateCurrentSpace(authenticatedUserId, spaceId);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User update failed' });
    }

    return res.status(200).json(updatedUser);

  } catch (error) {
    console.error('Error updating user current_space_id:', error);
    return res.status(500).json({ message: 'Internal Server Error updating user location' });
  }
}