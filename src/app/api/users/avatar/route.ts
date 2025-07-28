import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import sharp from 'sharp'; // For image processing

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
    }    // We'll accept files up to 5MB initially, then process them down to 1MB
    const initialMaxSize = 5 * 1024 * 1024; // 5MB
    if (avatarFile.size > initialMaxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    // Convert the file to an array buffer
    const arrayBuffer = await avatarFile.arrayBuffer();
    let buffer = new Uint8Array(arrayBuffer);

    try {
      // Process the image to ensure it's under 1MB
      // 1. Determine image format based on file type
      const inputFormat = avatarFile.type.replace('image/', '');
      const outputFormat = ['jpeg', 'jpg', 'png', 'webp'].includes(inputFormat) ? inputFormat : 'jpeg';

      // 2. Process image with sharp
      let processedImage = sharp(buffer);
      const metadata = await processedImage.metadata();

      // 3. Resize large images
      if (metadata.width && metadata.height) {
        // If image is larger than 800px in any dimension, resize it
        if (metadata.width > 800 || metadata.height > 800) {
          processedImage = processedImage.resize({
            width: Math.min(800, metadata.width),
            height: Math.min(800, metadata.height),
            fit: 'inside',
            withoutEnlargement: true
          });
        }
      }

      // 4. Convert and compress the image
      // Start with quality of 90% and reduce if needed
      let quality = 90;
      let processedBuffer;

      // Process in decreasing quality steps until under target size
      const targetSize = 1024 * 1024; // 1MB

      while (quality >= 60) { // Don't go below 60% quality
        // Use type-safe method calls based on output format
        switch (outputFormat) {
          case 'jpeg':
          case 'jpg':
            processedBuffer = await processedImage.jpeg({ quality }).toBuffer();
            break;
          case 'png':
            // PNG doesn't support quality parameter, use compression level instead
            const compressionLevel = Math.floor((100 - quality) / 10); // Convert quality to compression level (0-9)
            processedBuffer = await processedImage.png({ compressionLevel: Math.min(9, compressionLevel) }).toBuffer();
            break;
          case 'webp':
            processedBuffer = await processedImage.webp({ quality }).toBuffer();
            break;
          default:
            processedBuffer = await processedImage.jpeg({ quality }).toBuffer();
            break;
        }

        if (processedBuffer.length <= targetSize) {
          break;
        }

        // Reduce quality and try again
        quality -= 10;
      }
      // If we still can't get it under 1MB, use the smallest version
      buffer = processedBuffer || buffer;

      // Log the file size reduction
      console.log(`Avatar image processed: Original size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB, Processed size: ${(buffer.length / 1024).toFixed(2)} KB`);
    } catch (processingError) {
      console.error('Error processing image:', processingError);
      // Continue with original buffer if processing fails
      console.log('Using original image due to processing error');
      // We don't return an error here, we'll just use the original image
    }

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

    // Get the public URL using the service role client for consistency
    const { data: { publicUrl } } = serviceRoleSupabase.storage
      .from('user-uploads')
      .getPublicUrl(filePath);

    console.log(`Avatar uploaded successfully: ${filePath}`);
    console.log(`Public URL generated: ${publicUrl}`);

    // Test if the URL is immediately accessible
    try {
      const testResponse = await fetch(publicUrl, { method: 'HEAD' });
      console.log(`Avatar URL test: ${testResponse.status} ${testResponse.statusText}`);
    } catch (testError) {
      console.warn('Avatar URL test failed:', testError);
    }

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
