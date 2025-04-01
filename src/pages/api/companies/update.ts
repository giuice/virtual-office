// src/pages/api/companies/update.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
import { Company } from '@/types/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  // Only allow PUT or PATCH method
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    // Ensure 'id', 'createdAt', 'updatedAt' are not accidentally passed in the body for update
    const companyData: Partial<Omit<Company, 'id' | 'createdAt' | 'updatedAt'>> = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid id parameter' });
    }

    // Update the company using the repository
    const updatedCompany = await companyRepository.update(id, companyData);

    if (!updatedCompany) {
      // Handle case where company is not found or update fails
      return res.status(404).json({ success: false, message: 'Company not found or update failed' });
    }

    // Return success with the updated company object
    return res.status(200).json({
      success: true,
      company: updatedCompany,
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