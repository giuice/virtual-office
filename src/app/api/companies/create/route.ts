import { ICompanyRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { Company } from '@/types/database';
import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    if (authContext.dbUser.companyId) {
      return NextResponse.json(
        { success: false, error: 'You already belong to a company. Leave your current company before creating a new one.' },
        { status: 409 }
      );
    }

    const supabaseAdmin = await createSupabaseServerClient('service_role');
    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(supabaseAdmin);
    const userRepository: IUserRepository = new SupabaseUserRepository(supabaseAdmin);
    const { name, settings } = await request.json();

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name is required.' },
        { status: 400 }
      );
    }

    // 2. Prepare company data with the correct Supabase User UUID as admin
    const companyData: Omit<Company, 'id' | 'createdAt'> = {
      name: name,
      adminIds: [authContext.dbUser.id],
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
      const updatedUser = await userRepository.update(authContext.dbUser.id, { companyId: newCompany.id, role: 'admin' });
      if (!updatedUser) {
        console.warn(`Company ${newCompany.id} created, but failed to update user ${authContext.dbUser.id} with companyId.`);
      }
    } catch (userUpdateError) {
      console.error(`Error updating user ${authContext.dbUser.id} after company creation:`, userUpdateError);
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
