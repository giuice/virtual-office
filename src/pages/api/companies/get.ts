// src/pages/api/companies/get.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid id parameter' });
    }

    // Get the company
    // Get the company using the repository
    const company = await companyRepository.findById(id);
    
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }
    
    // Return success with the company data
    return res.status(200).json({ 
      success: true, 
      company
    });
  } catch (error) {
    console.error('Error getting company:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get company' 
    });
  }
}