// src/pages/api/spaces/update.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { Space } from '@/types/database';

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


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const authenticatedUserId = getUserIdFromRequest(req);
  if (!authenticatedUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    const { id: spaceId, ...updateData }: Partial<Space> & { id: string } = req.body;

    // Basic validation
    if (!spaceId) {
      return res.status(400).json({ message: 'Missing required field: id (spaceId)' });
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Missing update data in request body' });
    }

    // Authorization check (placeholder)
    const authorized = await canUpdateSpace(authenticatedUserId, spaceId, spaceRepository);
    if (!authorized) {
        return res.status(403).json({ message: 'Forbidden: User cannot update this space' });
    }

    // Remove fields that shouldn't be updated directly or are handled by DB
    // 'id' was already destructured into spaceId, no need to delete from updateData
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.createdBy;
    delete updateData.companyId; // Usually shouldn't change company

    // Perform the update
    const updatedSpace = await spaceRepository.update(spaceId, updateData);

    if (!updatedSpace) {
        return res.status(404).json({ message: `Space with ID ${spaceId} not found` });
    }

    return res.status(200).json(updatedSpace);

  } catch (error) {
    console.error('Error updating space:', error);
    // Add more specific error handling
    return res.status(500).json({ message: 'Internal Server Error updating space' });
  }
}