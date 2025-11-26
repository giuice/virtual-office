// src/app/api/neighborhoods/[id]/route.ts
import { NextResponse } from 'next/server';
import { UpdateNeighborhoodData } from '@/types/database';
import { SupabaseNeighborhoodRepository } from '@/repositories/implementations/supabase/SupabaseNeighborhoodRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/neighborhoods/[id]
 * Get a single neighborhood by ID
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    const neighborhood = await neighborhoodRepository.getById(id);

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    // Verify user belongs to the same company
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (userProfile?.companyId !== neighborhood.company_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Include space count
    const spaceCount = await neighborhoodRepository.getSpaceCount(neighborhood.id);

    return NextResponse.json({ ...neighborhood, spaceCount }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error fetching neighborhood:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/neighborhoods/[id]
 * Update a neighborhood (admin only)
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (userProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update neighborhoods' }, { status: 403 });
    }

    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    
    // Verify neighborhood exists and belongs to user's company
    const existing = await neighborhoodRepository.getById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (userProfile.companyId !== existing.company_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body: UpdateNeighborhoodData = await request.json();

    // Validate fields if provided
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Neighborhood name cannot be empty' }, { status: 400 });
      }
      if (body.name.length > 50) {
        return NextResponse.json({ error: 'Neighborhood name must be 50 characters or less' }, { status: 400 });
      }
    }

    const updated = await neighborhoodRepository.update(id, {
      name: body.name?.trim(),
      description: body.description?.trim(),
      color: body.color,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update neighborhood' }, { status: 500 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error updating neighborhood:', error);

    // Check for unique constraint violation
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

/**
 * DELETE /api/neighborhoods/[id]
 * Delete a neighborhood (admin only)
 * Spaces assigned to this neighborhood will have their neighborhood_id set to NULL
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (userProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete neighborhoods' }, { status: 403 });
    }

    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    
    // Verify neighborhood exists and belongs to user's company
    const existing = await neighborhoodRepository.getById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (userProfile.companyId !== existing.company_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const deleted = await neighborhoodRepository.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete neighborhood' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Neighborhood deleted' }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error deleting neighborhood:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
