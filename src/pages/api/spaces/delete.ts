// src/pages/api/spaces/delete.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';

// TODO: Implement proper authentication
const getUserIdFromRequest = (req: NextApiRequest): string | null => {
  // Replace with actual authentication logic
  return 'placeholder-auth-user-id';
};

// TODO: Implement proper authorization check
const canDeleteSpace = async (userId: string, spaceId: string, repository: ISpaceRepository): Promise<boolean> => {
  // Example: Check if user is admin or creator of the space
  // const space = await repository.findById(spaceId);
  // return space?.createdBy === userId || userHasAdminRole(userId);
  return true; // Placeholder
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const authenticatedUserId = getUserIdFromRequest(req);
  if (!authenticatedUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    const { spaceId } = req.query;

    // Basic validation
    if (!spaceId || typeof spaceId !== 'string') {
      return res.status(400).json({ message: 'Missing or invalid required query parameter: spaceId' });
    }

    // Authorization check (placeholder)
    const authorized = await canDeleteSpace(authenticatedUserId, spaceId, spaceRepository);
    if (!authorized) {
        return res.status(403).json({ message: 'Forbidden: User cannot delete this space' });
    }

    // Perform the delete
    const success = await spaceRepository.deleteById(spaceId);

    if (!success) {
        // This might happen if the space didn't exist or delete failed for other reasons
        // Depending on repository implementation, findById might be needed first
        return res.status(404).json({ message: `Space with ID ${spaceId} not found or delete failed` });
    }

    return res.status(200).json({ message: 'Space deleted successfully' }); // Or status 204 No Content

  } catch (error) {
    console.error('Error deleting space:', error);
    // Add more specific error handling
    return res.status(500).json({ message: 'Internal Server Error deleting space' });
  }
}