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

    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    if (!supabaseUid) {
      return NextResponse.json(
        { error: 'Missing required parameter: supabase_uid' },
        { status: 400 }
      );
    }

    if (supabaseUid !== currentUser.id) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    const user = await userRepository.findBySupabaseUid(supabaseUid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If user has company, fetch company name for AC6 display
    let companyName: string | null = null;
    if (user.companyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', user.companyId)
        .single();
      companyName = company?.name || null;
    }

    return NextResponse.json({ 
      user: { ...user, companyName } 
    }, { status: 200 });
  } catch (error) {
    console.error('Error in get-by-id:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get user' },
      { status: 500 }
    );
  }
}
