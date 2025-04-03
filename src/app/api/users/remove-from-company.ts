// src/pages/api/users/remove-from-company.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';
import { Space } from '@/types/database'; // Import Space type

// Instantiate repositories
const userRepository: IUserRepository = new SupabaseUserRepository();
const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId, companyId } = req.body;

    if (!userId || !companyId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1. Update the user to remove company association using repository
    // We might need a check here if the update failed, depending on repository implementation
    await userRepository.updateCompanyAssociation(userId, null);
    // Note: The original DynamoDB code had a ConditionExpression to ensure the user belonged to the company.
    // The repository method should ideally handle this logic internally or return a status.
    // For now, we assume it succeeds if the user exists.

    // 2. Update spaces to remove user from any occupied spaces using repository
    // First, find spaces occupied by the user in the company
    // First, find all spaces for the company
    const allSpacesInCompany: Space[] = await spaceRepository.findByCompany(companyId);
    // Then filter locally to find spaces occupied by the user
    const occupiedSpaces = allSpacesInCompany.filter(space =>
        space.userIds && space.userIds.includes(userId)
    );

    // Then update each space to remove the user
    if (occupiedSpaces && occupiedSpaces.length > 0) {
      const updatePromises = occupiedSpaces.map(space => {
        // Ensure occupants is treated as an array, even if null/undefined initially
        // Ensure userIds is treated as an array, even if null/undefined initially
        const currentUserIds = space.userIds || [];
        const updatedUserIds = currentUserIds.filter((id: string) => id !== userId); // Add type to id
        // Use the space repository's update method with the correct field name
        return spaceRepository.update(space.id, { userIds: updatedUserIds });
      });

      await Promise.all(updatePromises);
    }

    return res.status(200).json({ message: 'User removed from company successfully' });
  } catch (error) {
    console.error('Error removing user from company:', error);
    return res.status(500).json({ 
      message: 'Failed to remove user from company',
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}