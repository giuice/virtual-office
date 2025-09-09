import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { z } from 'zod';

const updateLocationSchema = z.object({
  userId: z.string().uuid(),
  spaceId: z.string().uuid().nullable(),
});

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  try {
    // Create server client and repository instance
    const supabase = await createSupabaseServerClient();
    const userRepository = new SupabaseUserRepository(supabase);

    let requestBody;
    try {
      requestBody = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validationResult = updateLocationSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: validationResult.error.errors 
      }, { status: 400 });
    }

    const { userId, spaceId } = validationResult.data;

    // Verify user exists before attempting update
    const existingUser = await userRepository.findById(userId);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = await userRepository.updateLocation(userId, spaceId);

    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update user location' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Location updated successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error updating user location:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update location',
      details: error 
    }, { status: 500 });
  }
}