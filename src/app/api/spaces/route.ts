import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { Space } from '@/types/database';
import { API_ERROR_CODES } from '@/lib/api/error-contract';
import { createCorrelationId, jsonError, jsonSuccess } from '@/lib/api/server-error';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSpaceInUseDeleteError(error: unknown): boolean {
  if (!isRecord(error) || error.code !== '23503') {
    return false;
  }

  const searchableText = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  return /(?:\w+_space_id_fkey|users_current_space_id_fkey)/.test(searchableText);
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();

  try {
    const authContext = await requireAuthUser({ correlationId, pathname: '/api/spaces' });
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return jsonError(400, API_ERROR_CODES.BAD_REQUEST, 'Company ID is required', {
        correlationId,
        context: 'spaces.get',
      });
    }

    if (companyId !== authContext.dbUser.companyId) {
      return jsonError(403, API_ERROR_CODES.FORBIDDEN, 'Cannot access spaces outside your company', {
        correlationId,
        context: 'spaces.get',
      });
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);
    const spaces = await spaceRepository.findByCompany(companyId);

    return jsonSuccess({ spaces }, correlationId);
  } catch (error: unknown) {
    return jsonError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch spaces', {
      correlationId,
      cause: error,
      context: 'spaces.get',
    });
  }
}

export async function POST(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const spaceDataFromRequest: Partial<Space> = await request.json();

    if (!spaceDataFromRequest.name || !spaceDataFromRequest.type || !spaceDataFromRequest.companyId) {
      return NextResponse.json(
        { message: 'Missing required fields: name, type, companyId' },
        { status: 400 }
      );
    }

    if (spaceDataFromRequest.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot create spaces outside your company' }, { status: 403 });
    }

    const dataToCreate = {
      ...spaceDataFromRequest,
      createdBy: authContext.dbUser.id,
    };

    delete dataToCreate.id;
    delete dataToCreate.createdAt;
    delete dataToCreate.updatedAt;

    const spaceToCreateRepoInput = dataToCreate as Omit<Space, 'id' | 'createdAt' | 'updatedAt'>;

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);
    const newSpace = await spaceRepository.create(spaceToCreateRepoInput);

    return NextResponse.json(newSpace, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating space:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Failed to create space' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { id: spaceId, ...updateData } = await request.json();

    if (!spaceId) {
      return NextResponse.json(
        { message: 'Space ID is required' },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: 'Missing update data in request body' },
        { status: 400 }
      );
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(authContext.supabase);
    const existingSpace = await spaceRepository.findById(spaceId);
    if (!existingSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    if (existingSpace.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot update spaces outside your company' }, { status: 403 });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.createdBy;
    delete updateData.companyId;
    delete updateData.userIds;

    const updatedSpace = await spaceRepository.update(spaceId, updateData);

    if (!updatedSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedSpace);
  } catch (error: unknown) {
    console.error('Error updating space:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Failed to update space' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get('id') || searchParams.get('spaceId');

    if (!spaceId) {
      return NextResponse.json(
        { message: 'Space ID is required' },
        { status: 400 }
      );
    }

    const serviceClient = await createSupabaseServerClient('service_role');
    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository(serviceClient);
    const existingSpace = await spaceRepository.findById(spaceId);
    if (!existingSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found or delete failed` },
        { status: 404 }
      );
    }

    if (existingSpace.companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ message: 'Cannot delete spaces outside your company' }, { status: 403 });
    }

    const { error, count } = await serviceClient
      .from('spaces')
      .delete({ count: 'exact' })
      .eq('id', spaceId);

    if (error) {
      if (isSpaceInUseDeleteError(error)) {
        return NextResponse.json(
          { success: false, code: 'SPACE_IN_USE' },
          { status: 409 }
        );
      }

      console.error('Error deleting space:', error);
      return NextResponse.json(
        { message: 'Failed to delete space' },
        { status: 500 }
      );
    }

    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found or delete failed` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Space deleted successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error deleting space:', error);
    return NextResponse.json(
      { message: 'Failed to delete space' },
      { status: 500 }
    );
  }
}
