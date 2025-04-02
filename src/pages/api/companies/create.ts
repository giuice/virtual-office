// src/pages/api/companies/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ICompanyRepository, IUserRepository } from '@/repositories/interfaces'; // Import IUserRepository
import { SupabaseCompanyRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase'; // Import SupabaseUserRepository
import { Company, User } from '@/types/database'; // Import User type

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository(); // Instantiate UserRepository
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Expect company name and the creator's Firebase UID from the body
    const { name, creatorFirebaseUid, settings } = req.body;

    // Validate required fields
    if (!name || !creatorFirebaseUid) {
      return res.status(400).json({ error: 'Missing required fields: name and creatorFirebaseUid are required.' });
    }

    // 1. Find the Supabase User using the Firebase UID
    const creatorUser: User | null = await userRepository.findByFirebaseUid(creatorFirebaseUid);

    if (!creatorUser) {
      // This shouldn't happen if the user creation flow worked, but handle defensively
      return res.status(404).json({ success: false, error: 'Creator user not found in Supabase.' });
    }

    // 2. Prepare company data with the correct Supabase User UUID as admin
    const companyData: Omit<Company, 'id' | 'createdAt'> = {
      name: name,
      adminIds: [creatorUser.id], // Use the Supabase User UUID
      settings: settings || {}, // Use provided settings or default to empty object
    };

    // Create the company using the repository
    const newCompany = await companyRepository.create(companyData);

    if (!newCompany) {
      // Handle case where creation might fail but not throw (e.g., validation within repo)
      return res.status(500).json({ success: false, error: 'Failed to create company (repository)' });
    }
      // 3. Update the creator's user record with the new company ID
      try {
        const updatedUser = await userRepository.update(creatorUser.id, { companyId: newCompany.id });
        if (!updatedUser) {
          // Log this issue, but the company was created, so maybe don't fail the whole request?
          console.warn(`Company ${newCompany.id} created, but failed to update user ${creatorUser.id} with companyId.`);
        }
      } catch (userUpdateError) {
        console.error(`Error updating user ${creatorUser.id} after company creation:`, userUpdateError);
        // Log and continue, returning the created company.
      }

      // Return success with the created company object
      return res.status(201).json({
        success: true,
        company: newCompany,
        message: 'Company created successfully'
      });

    } catch (error) { // This is the main catch block for the handler
      console.error('Error creating company:', error);
      // Check if the error is the specific UUID error from the initial steps
      if (error instanceof Error && error.message.includes('invalid input syntax for type uuid')) {
         console.error("UUID Syntax Error detected during company creation/user update phase.");
      }
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create company'
      });
    }
}