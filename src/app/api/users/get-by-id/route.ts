// src/app/api/users/get-by-id/route.ts
import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    const { searchParams } = new URL(request.url);
    const supabaseUid = searchParams.get('supabase_uid');

    if (!supabaseUid) {
      return NextResponse.json(
        { error: 'Missing required parameter: supabase_uid' },
        { status: 400 }
      );
    }

  const user = await userRepository.findBySupabaseUid(supabaseUid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    console.error('Error in get-by-id:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get user' },
      { status: 500 }
    );
  }
}
