// src/pages/api/spaces/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { Space } from '@/types/database'; // Use global Space type

// TODO: Implement proper authentication
const getUserIdFromRequest = (req: NextApiRequest): string | null => {
  // Replace with actual authentication logic (e.g., Clerk, NextAuth.js)
  return 'placeholder-auth-user-id';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const authenticatedUserId = getUserIdFromRequest(req);
  if (!authenticatedUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    const spaceData: Partial<Space> = req.body;

    // Basic validation (expand as needed)
    if (!spaceData.name || !spaceData.type || !spaceData.companyId) {
       return res.status(400).json({ message: 'Missing required fields: name, type, companyId' });
    }

    // Add createdBy field (assuming it's needed and comes from auth)
    const dataToCreate = {
        ...spaceData,
        createdBy: authenticatedUserId, // Add creator ID
    };

    // Remove fields potentially added client-side but handled by DB/repo
    delete dataToCreate.id;
    delete dataToCreate.createdAt;
    delete dataToCreate.updatedAt;


    // Type assertion might be needed if create expects a more specific type
    const newSpace = await spaceRepository.create(dataToCreate as Omit<Space, 'id' | 'createdAt' | 'updatedAt'>);

    return res.status(201).json(newSpace);

  } catch (error) {
    console.error('Error creating space:', error);
    // Add more specific error handling based on potential repository errors
    return res.status(500).json({ message: 'Internal Server Error creating space' });
  }
}