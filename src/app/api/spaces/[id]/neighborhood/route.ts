// src/app/api/spaces/[id]/neighborhood/route.ts
import { NextResponse } from 'next/server';
import { SupabaseNeighborhoodRepository } from '@/repositories/implementations/supabase/SupabaseNeighborhoodRepository';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AssignBody {
  neighborhoodId: string | null;
}

/**
 * PATCH /api/spaces/[id]/neighborhood
 * Assign or unassign a space to/from a neighborhood (admin only)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id: spaceId } = await params;
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

    // Verify space exists and belongs to user's company
    const spaceRepository = new SupabaseSpaceRepository(supabase);
    const space = await spaceRepository.findById(spaceId);

    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    if (space.companyId !== userProfile.companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body: AssignBody = await request.json();

    // If neighborhoodId is provided, verify it exists and belongs to user's company
    if (body.neighborhoodId !== null) {
      const neighborhoodRepository = new SupabaseNeighborhoodRepository(supabase);
      const neighborhood = await neighborhoodRepository.getById(body.neighborhoodId);

      if (!neighborhood) {
        return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
      }

      if (neighborhood.company_id !== userProfile.companyId) {
        return NextResponse.json({ error: 'Neighborhood does not belong to your company' }, { status: 403 });
      }
    }

    // Update the space's neighborhood assignment
    const updated = await spaceRepository.update(spaceId, {
      neighborhoodId: body.neighborhoodId ?? undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update space' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: body.neighborhoodId 
        ? 'Space assigned to neighborhood' 
        : 'Space unassigned from neighborhood',
      space: updated,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error assigning space to neighborhood:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
