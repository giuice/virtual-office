// src/pages/api/spaces/get.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSpacesByCompany } from '@/lib/dynamo'; // Use the function from dynamo.ts
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

  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ message: 'Company ID is required' });
  }

  try {
    // Use the function from dynamo.ts to fetch spaces
    const spaces = await getSpacesByCompany(companyId);

    // Ensure users array exists, even if empty (double-check, though api.ts also does this)
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
