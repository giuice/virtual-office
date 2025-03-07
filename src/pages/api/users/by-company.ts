// src/pages/api/users/by-company.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUsersByCompany } from '@/lib/dynamo';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { companyId } = req.query;
    
    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid companyId parameter' });
    }

    // Get users by company
    const users = await getUsersByCompany(companyId);
    
    // Return success with users
    return res.status(200).json({ 
      success: true, 
      users
    });
  } catch (error) {
    console.error('Error getting users by company:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get users' 
    });
  }
}