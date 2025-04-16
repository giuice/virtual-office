import { ICompanyRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { Company } from '@/types/database';
import { NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {

  // Get Supabase client using the server helper

  const { supabaseUid: userId, userDbId, error: sessionError } = await validateUserSession();

  if (sessionError || !userId || !userDbId) {
    return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
  }

  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    const { name, creatorSupabaseUid, settings } = await request.json();

    // Validate required fields
    if (!name || !creatorSupabaseUid) {
      return NextResponse.json(
        { error: 'Missing required fields: name and creatorFirebaseUid are required.' },
        { status: 400 }
      );
    }

    // 1. Get the user 
    const creatorUser = await userRepository.findBySupabaseUid(creatorSupabaseUid);

    if (!creatorUser) {
      return NextResponse.json(
        { success: false, error: 'Creator user not found in Supabase.' },
        { status: 404 }
      );
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
      return NextResponse.json(
        { success: false, error: 'Failed to create company (repository)' },
        { status: 500 }
      );
    }

    // 3. Update the creator's user record with the new company ID
    try {
      const updatedUser = await userRepository.update(creatorUser.id, { companyId: newCompany.id });
      if (!updatedUser) {
        console.warn(`Company ${newCompany.id} created, but failed to update user ${creatorUser.id} with companyId.`);
      }
    } catch (userUpdateError) {
      console.error(`Error updating user ${creatorUser.id} after company creation:`, userUpdateError);
      // Log and continue, returning the created company.
    }

    // Return success with the created company object
    return NextResponse.json({
      success: true,
      company: newCompany,
      message: 'Company created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating company:', error);
    // Check if the error is the specific UUID error from the initial steps
    if (error instanceof Error && error.message.includes('invalid input syntax for type uuid')) {
      console.error("UUID Syntax Error detected during company creation/user update phase.");
    }
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create company'
    }, { status: 500 });
  }
}