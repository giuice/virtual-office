// src/pages/api/companies/update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { updateCompany } from '@/lib/dynamo';
import { Company } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow PUT or PATCH method
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const companyData: Partial<Company> = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid id parameter' });
    }

    // Update the company
    await updateCompany(id, companyData);
    
    // Return success
    return res.status(200).json({ 
      success: true, 
      message: 'Company updated successfully' 
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update company' 
    });
  }
}