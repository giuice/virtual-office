// src/pages/api/companies/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
import { Company } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Assuming req.body contains the necessary fields (name, adminIds, settings, etc.)
    // The repository's create method should handle setting id and createdAt
    const companyData: Omit<Company, 'id' | 'createdAt' | 'updatedAt'> = req.body;
    
    // Validate required fields
    // Ensure the user making the request is added as an admin if not already present
    // This logic might need refinement based on how user identity is retrieved (e.g., from session/token)
    // For now, assuming adminIds comes correctly populated from the request body.
    if (!companyData.name || !companyData.adminIds || companyData.adminIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create the company using the repository
    const newCompany = await companyRepository.create(companyData);

    if (!newCompany) {
      // Handle case where creation might fail but not throw (e.g., validation within repo)
      return res.status(500).json({ success: false, error: 'Failed to create company (repository)' });
    }

    // Return success with the created company object
    return res.status(201).json({
      success: true,
      company: newCompany,
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