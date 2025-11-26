// src/app/api/neighborhoods/route.ts
import { NextResponse } from 'next/server';
import { CreateNeighborhoodData } from '@/types/database';
import { SupabaseNeighborhoodRepository } from '@/repositories/implementations/supabase/SupabaseNeighborhoodRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

/**
 * GET /api/neighborhoods
 * List all neighborhoods for the current user's company
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to find company
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (!userProfile?.companyId) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    const neighborhoods = await neighborhoodRepository.getByCompanyId(userProfile.companyId);

    // Optionally include space counts for each neighborhood
    const neighborhoodsWithCounts = await Promise.all(
      neighborhoods.map(async (neighborhood) => ({
        ...neighborhood,
        spaceCount: await neighborhoodRepository.getSpaceCount(neighborhood.id),
      }))
    );

    return NextResponse.json(neighborhoodsWithCounts, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error fetching neighborhoods:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/neighborhoods
 * Create a new neighborhood (admin only)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check admin role
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (!userProfile?.companyId) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    if (userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create neighborhoods' }, { status: 403 });
    }

    const body: CreateNeighborhoodData = await request.json();

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Neighborhood name is required' }, { status: 400 });
    }

    if (body.name.length > 50) {
      return NextResponse.json({ error: 'Neighborhood name must be 50 characters or less' }, { status: 400 });
    }

    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    const newNeighborhood = await neighborhoodRepository.create(userProfile.companyId, {
      name: body.name.trim(),
      description: body.description?.trim(),
      color: body.color || '--vo-neighborhood-1',
    });

    return NextResponse.json(newNeighborhood, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating neighborhood:', error);
    
    // Check for unique constraint violation (duplicate name)
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json({ error: 'A neighborhood with this name already exists' }, { status: 409 });
    }
    
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
