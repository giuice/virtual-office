// src/pages/api/companies/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createCompany } from '@/lib/dynamo';
import { Company } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const companyData: Omit<Company, 'id' | 'createdAt'> = req.body;
    
    // Validate required fields
    if (!companyData.name || !companyData.adminIds || companyData.adminIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create the company
    const companyId = await createCompany(companyData);
    
    // Return success with the ID
    return res.status(201).json({ 
      success: true, 
      companyId, 
      message: 'Company created successfully' 
    });
  } catch (error) {
    console.error('Error creating company:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create company' 
    });
  }
}