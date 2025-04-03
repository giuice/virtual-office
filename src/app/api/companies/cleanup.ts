// src/pages/api/companies/cleanup.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ICompanyRepository } from '@/repositories/interfaces/ICompanyRepository';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { IUserRepository } from '@/repositories/interfaces/IUserRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { Company } from '@/types/database'; // Assuming Company type has createdAt

/**
 * This endpoint cleans up duplicate companies for a user,
 * ensuring they are only associated with one company as an admin.
 * It keeps the most recent company and updates the user record.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    // 1. Get the user (optional, depending on whether you need user info beyond the ID)
    // If you only need to update the user later, you can skip fetching them now.
    // const user = await userRepository.findById(userId);
    // if (!user) {
    //   return res.status(404).json({ message: 'User not found' });
    // }

    // 2. Find all companies where the user is an admin
    const associatedCompanies = await companyRepository.findAllByUserId(userId);

    if (!associatedCompanies || associatedCompanies.length <= 1) {
      return res.status(200).json({
        message: 'No duplicate companies found for this user as admin',
        companyCount: associatedCompanies?.length || 0
      });
    }

    // 3. Sort companies by creation date (newest first)
    // Ensure your Company type and Supabase table have a 'createdAt' or similar timestamp
    const sortedCompanies = associatedCompanies.sort((a, b) => {
        // Handle TimeStampType (string from Supabase or Firebase Timestamp)
        const timeA = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt as any)?.toDate?.().getTime() ?? 0;
        const timeB = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt as any)?.toDate?.().getTime() ?? 0;
        return timeB - timeA; // Newest first
    });

    // 4. Keep the newest company, identify the rest for deletion
    const newestCompany = sortedCompanies[0];
    const companiesToDelete = sortedCompanies.slice(1);

    // 5. Update the user to ensure their companyId points to the newest company
    // Note: This assumes a user has a direct `companyId` field. Adjust if your schema is different.
    // If a user can belong to multiple companies (not just admin), this logic might need revision.
    const updateResult = await userRepository.update(userId, { companyId: newestCompany.id });
    if (!updateResult) {
        // Handle case where user update failed (e.g., user deleted between steps)
        console.warn(`Cleanup: Failed to update user ${userId} companyId after finding duplicates.`);
        // Decide if you should proceed with deletion or return an error
    }


    // 6. Delete the old companies
    const deletePromises = companiesToDelete.map(company => {
      return companyRepository.deleteById(company.id);
    });

    const deleteResults = await Promise.all(deletePromises);
    const successfullyDeletedIds = companiesToDelete
        .filter((_, index) => deleteResults[index])
        .map(c => c.id);
    const failedToDeleteIds = companiesToDelete
        .filter((_, index) => !deleteResults[index])
        .map(c => c.id);


    if (failedToDeleteIds.length > 0) {
        console.warn(`Cleanup: Failed to delete some old companies for user ${userId}: ${failedToDeleteIds.join(', ')}`);
        // Consider returning a partial success or specific error
    }

    return res.status(200).json({
      message: 'Companies cleaned up successfully',
      keptCompanyId: newestCompany.id,
      deletedCompanyIds: successfullyDeletedIds,
      failedToDeleteCompanyIds: failedToDeleteIds,
      totalRemoved: successfullyDeletedIds.length
    });
  } catch (error) {
    console.error('Error cleaning up companies:', error);
    return res.status(500).json({
      message: 'Failed to clean up companies',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}