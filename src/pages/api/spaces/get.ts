// src/pages/api/spaces/get.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ISpaceRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { Space } from '@/types/database';

type ResponseData = {
  spaces: Space[];
} | {
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(); // Instantiate repository

  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ message: 'Company ID is required' });
  }

  try {
    // Use the repository method to fetch spaces
    const spaces = await spaceRepository.findByCompany(companyId);

    // Ensure userIds array exists, even if empty
    // This might be redundant if the repository implementation guarantees it, but safe to keep.
    const spacesWithUsers = spaces.map(space => ({
      ...space,
      userIds: space.userIds || []
    }));

    res.status(200).json({ spaces: spacesWithUsers });
  } catch (error) {
    console.error('Error fetching spaces:', error);
    res.status(500).json({ message: 'Failed to fetch spaces' });
  }
}
