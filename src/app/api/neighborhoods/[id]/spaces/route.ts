// src/app/api/neighborhoods/[id]/spaces/route.ts
import { NextResponse } from 'next/server';
import { SupabaseNeighborhoodRepository } from '@/repositories/implementations/supabase/SupabaseNeighborhoodRepository';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface BatchAssignBody {
  spaceIds: string[];
}

/**
 * POST /api/neighborhoods/[id]/spaces
 * Batch assign multiple spaces to a neighborhood (admin only)
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: neighborhoodId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (userProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can assign spaces to neighborhoods' }, { status: 403 });
    }

    if (!userProfile.companyId) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    // Verify neighborhood exists and belongs to user's company
    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    const neighborhood = await neighborhoodRepository.getById(neighborhoodId);

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (neighborhood.company_id !== userProfile.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body: BatchAssignBody = await request.json();

    if (!Array.isArray(body.spaceIds) || body.spaceIds.length === 0) {
      return NextResponse.json({ error: 'spaceIds must be a non-empty array' }, { status: 400 });
    }

    // Validate all space IDs are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = body.spaceIds.filter(id => !uuidRegex.test(id));
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: 'Invalid space ID format', invalidIds }, { status: 400 });
    }

    // Batch update spaces
    const spaceRepository = new SupabaseSpaceRepository(supabase);
    const results = await Promise.allSettled(
      body.spaceIds.map(spaceId => 
        spaceRepository.update(spaceId, { neighborhoodId })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
    const failed = results.length - successful;

    return NextResponse.json({
      success: true,
      message: `Assigned ${successful} space(s) to neighborhood`,
      assigned: successful,
      failed,
      neighborhoodId,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error batch assigning spaces:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/neighborhoods/[id]/spaces
 * Unassign all spaces from a neighborhood (admin only)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: neighborhoodId } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const userRepository = new SupabaseUserRepository(supabase);
    const userProfile = await userRepository.findBySupabaseUid(user.id);

    if (userProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can unassign spaces' }, { status: 403 });
    }

    // Verify neighborhood exists and belongs to user's company
    const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
    const neighborhood = await neighborhoodRepository.getById(neighborhoodId);

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (neighborhood.company_id !== userProfile.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Unassign all spaces from this neighborhood
    const { error, count } = await supabase
      .from('spaces')
      .update({ neighborhood_id: null })
      .eq('neighborhood_id', neighborhoodId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: `Unassigned ${count ?? 0} space(s) from neighborhood`,
      unassigned: count ?? 0,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error unassigning spaces:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
