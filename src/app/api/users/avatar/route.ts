import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient(); // Use the async helper
    
    // Use getUser() instead of getSession() for better security as per warning
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Check if the user is authenticated
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    
    const { userRepository } = await getSupabaseRepositories();
    const userDbId = await userRepository.findBySupabaseUid(user.id).then(user => user?.id) as string;
    console.log('userDbId', userDbId);
    // Parse the multipart form data
    const formData = await req.formData();
    const avatarFile = formData.get('avatar') as File;
    
    if (!avatarFile) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!avatarFile.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (avatarFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 2MB limit' },
        { status: 400 }
      );
    }

    // Convert the file to an array buffer
    const arrayBuffer = await avatarFile.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Create a unique file name
    const fileName = `avatar-${userDbId}-${Date.now()}.${avatarFile.name.split('.').pop()}`;
    const filePath = `avatars/${fileName}`;

    // Upload the file to Supabase Storage using service role client to bypass RLS
    // We can do this safely on the server since we've already authenticated the user
    const serviceRoleSupabase = await createSupabaseServerClient('service_role');
    const { data: uploadData, error: uploadError } = await serviceRoleSupabase.storage
      .from('user-uploads')
      .upload(filePath, buffer, {
        contentType: avatarFile.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(filePath);

    // Update the user using the repository with userDbId (the database UUID)
    const updatedUser = await userRepository.update(userDbId, { 
      avatarUrl: publicUrl 
    });

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      avatarUrl: publicUrl,
      message: 'Avatar updated successfully',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
