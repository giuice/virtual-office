import { NextResponse } from 'next/server';
import { ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { Space } from '@/types/database';

export async function GET(request: Request) {
  // Get companyId from URL params
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ message: 'Company ID is required' }, { status: 400 });
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    // Use the repository method to fetch spaces
    const spaces = await spaceRepository.findByCompany(companyId);


    return NextResponse.json({ spaces: spaces });
  } catch (error) {
    console.error('Error fetching spaces:', error);
    return NextResponse.json({ message: 'Failed to fetch spaces' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const spaceData = await request.json();

    // Basic validation
    if (!spaceData.name || !spaceData.type || !spaceData.companyId) {
      return NextResponse.json(
        { message: 'Missing required fields: name, type, companyId' },
        { status: 400 }
      );
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

    // Create new space
    const newSpace = await spaceRepository.create(spaceData);

    return NextResponse.json(newSpace, { status: 201 });
  } catch (error) {
    console.error('Error creating space:', error);
    return NextResponse.json(
      { message: 'Failed to create space' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id: spaceId, ...updateData } = await request.json();

    if (!spaceId) {
      return NextResponse.json(
        { message: 'Space ID is required' },
        { status: 400 }
      );
    }

    const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

    // Remove fields that shouldn't be updated directly
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.createdBy;
    delete updateData.companyId;

    const updatedSpace = await spaceRepository.update(spaceId, updateData);

    if (!updatedSpace) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedSpace);
  } catch (error) {
    console.error('Error updating space:', error);
    return NextResponse.json(
      { message: 'Failed to update space' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('id');

  if (!spaceId) {
    return NextResponse.json(
      { message: 'Space ID is required' },
      { status: 400 }
    );
  }

  const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

  try {
    const success = await spaceRepository.deleteById(spaceId);

    if (!success) {
      return NextResponse.json(
        { message: `Space with ID ${spaceId} not found or delete failed` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Space deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting space:', error);
    return NextResponse.json(
      { message: 'Failed to delete space' },
      { status: 500 }
    );
  }
}