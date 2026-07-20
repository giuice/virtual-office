import { NextRequest, NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { requireAuthUser } from '@/lib/auth/session';
import { extractUserUploadsPath } from '@/lib/user-uploads-storage';
import sharp from 'sharp'; // For image processing

export const dynamic = 'force-dynamic';

const ALLOWED_INPUT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type OutputFormat = 'jpeg' | 'jpg' | 'png' | 'webp';

const OUTPUT_CONTENT_TYPES: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function POST(req: NextRequest) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userDbId = authContext.dbUser.id;
    const oldAvatarUrl = authContext.dbUser.avatarUrl;
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
    if (
      !ALLOWED_INPUT_MIMES.includes(
        avatarFile.type as (typeof ALLOWED_INPUT_MIMES)[number]
      )
    ) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }
    // We'll accept files up to 5MB initially, then process them down to 1MB
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
    let outputFormat: OutputFormat = 'jpeg';

    try {
      // Process the image to ensure it's under 1MB
      // 1. Determine image format based on file type
      const inputFormat = avatarFile.type.replace('image/', '');
      outputFormat = ['jpeg', 'jpg', 'png', 'webp'].includes(inputFormat)
        ? inputFormat as OutputFormat
        : 'jpeg';

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
      if (processedBuffer) {
        buffer = new Uint8Array(processedBuffer);
      } else if (!(buffer instanceof Uint8Array)) {
        buffer = new Uint8Array(buffer);
      }

    } catch (processingError) {
      console.error('Error processing image:', processingError);
      return NextResponse.json(
        { error: 'Invalid image file' },
        { status: 400 }
      );
    }

    // Create a unique file name
    const fileName = `avatar-${userDbId}-${Date.now()}.${outputFormat}`;
    const filePath = `avatars/${fileName}`;

    // Upload the file to Supabase Storage using service role client to bypass RLS
    // We can do this safely on the server since we've already authenticated the user
    const serviceRoleSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceRoleSupabase);
    const { error: uploadError } = await serviceRoleSupabase.storage
      .from('user-uploads')
      .upload(filePath, buffer, {
        contentType: OUTPUT_CONTENT_TYPES[outputFormat],
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

    // Update the user using the repository with userDbId (the database UUID)
    let updatedUser;
    try {
      updatedUser = await userRepository.update(userDbId, {
        avatarUrl: publicUrl
      });
    } catch (updateError) {
      await serviceRoleSupabase.storage
        .from('user-uploads')
        .remove([filePath])
        .catch(() => undefined);
      throw updateError;
    }

    if (!updatedUser) {
      await serviceRoleSupabase.storage
        .from('user-uploads')
        .remove([filePath])
        .catch(() => undefined);
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }

    const oldAvatarPath = extractUserUploadsPath(oldAvatarUrl);
    if (oldAvatarPath && oldAvatarPath !== filePath) {
      const { error: removeOldAvatarError } = await serviceRoleSupabase.storage
        .from('user-uploads')
        .remove([oldAvatarPath]);

      if (removeOldAvatarError) {
        console.warn('Failed to remove old avatar object:', removeOldAvatarError.message);
      }
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
