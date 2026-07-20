import { NextResponse } from 'next/server';
import { ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase/SupabaseCompanyRepository';
import { requireAuthUser } from '@/lib/auth/session';
import type { Company } from '@/types/database';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const companyUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    settings: z
      .object({
        allowGuestAccess: z.boolean().optional(),
        maxRooms: z.number().int().nonnegative().optional(),
        theme: z.string().max(64).optional(),
        defaultSpaceId: z.string().uuid().optional(),
        homeSpaces: z.record(z.string(), z.string().uuid()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    if (id !== authContext.dbUser.companyId || authContext.dbUser.role !== 'admin') {
      return NextResponse.json({ error: 'Only company admins can update this company' }, { status: 403 });
    }

    const parsedCompanyData = companyUpdateSchema.safeParse(await request.json());
    if (!parsedCompanyData.success) {
      return NextResponse.json(
        { error: 'Invalid company update', code: 'INVALID_COMPANY_UPDATE' },
        { status: 400 },
      );
    }
    const companyData: Partial<Omit<Company, 'id' | 'createdAt'>> = parsedCompanyData.data;

    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(authContext.supabase);
    const updatedCompany = await companyRepository.update(id, companyData);

    if (!updatedCompany) {
      return NextResponse.json({ success: false, message: 'Company not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      company: updatedCompany,
      message: 'Company updated successfully',
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update company',
    }, { status: 500 });
  }
}
