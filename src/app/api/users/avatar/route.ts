import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { AvatarStorage } from '@/server/avatar-storage';
import sharp, { Sharp } from 'sharp';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient();

    // Use getUser() instead of getSession() for better security
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Check if the user is authenticated
    if (authError || !user) {
      console.warn('[API/AvatarUpload] Authentication failed:', authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user repository
    const { userRepository } = await getSupabaseRepositories();
    
    // Find the internal database ID for the authenticated user
    const userProfile = await userRepository.findBySupabaseUid(user.id);
    if (!userProfile || !userProfile.id) {
      console.error(`[API/AvatarUpload] Critical: Could not find user profile in DB for authenticated Supabase user ${user.id}`);
      return NextResponse.json({ error: 'User profile not found in database.' }, { status: 404 });
    }
    const userDbId = userProfile.id;
    console.log(`[API/AvatarUpload] Processing avatar for user DB ID: ${userDbId}`);

    // Parse the multipart form data
    const formData = await req.formData();
    const avatarFile = formData.get('avatar') as File;

    if (!avatarFile) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!avatarFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    // Validate initial file size (before processing)
    const initialMaxSize = 5 * 1024 * 1024; // 5MB
    if (avatarFile.size > initialMaxSize) {
      return NextResponse.json({ error: `File size exceeds initial limit of ${initialMaxSize / 1024 / 1024}MB.` }, { status: 400 });
    }

    // Convert the file to an array buffer
    const arrayBuffer = await avatarFile.arrayBuffer();
    // Initialize bufferForProcessing, leave original arrayBuffer for potential fallback
    let bufferForProcessing: Buffer | Uint8Array = new Uint8Array(arrayBuffer);

    // --- Image Processing --- 
    try {
      let processedImage: Sharp = sharp(bufferForProcessing);
      const metadata = await processedImage.metadata();
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
      let processedBuffer: Buffer | undefined;
      // Process in decreasing quality steps until under target size
      const targetSize = 1024 * 1024; // 1MB
      while (quality >= 60) { // Don't go below 60% quality
        // Use the typed outputFormat directly as method name
        const inputFormat = avatarFile.type.replace('image/', '');
        // Ensure outputFormat is one of the known types for sharp output methods
        let outputFormat: 'jpeg' | 'png' | 'webp';
        if (inputFormat === 'png') outputFormat = 'png';
        else if (inputFormat === 'webp') outputFormat = 'webp';
        else outputFormat = 'jpeg'; // Default to jpeg

        processedBuffer = await processedImage[outputFormat]({ quality: quality }).toBuffer();
        
        if (processedBuffer.length <= targetSize) {
          break;
        }
        
        // Reduce quality and try again
        quality -= 10;
      }

      // If we still can't get it under 1MB, use the smallest version generated
      if (processedBuffer && processedBuffer.length > targetSize) {
         console.warn(`[API/AvatarUpload] Processed image still exceeds target size (${(processedBuffer.length / 1024).toFixed(2)} KB). Using smallest processed version.`);
      }
      // Use the processed Buffer if available, otherwise keep the original Uint8Array
      bufferForProcessing = processedBuffer || bufferForProcessing;
      console.log(`[API/AvatarUpload] Image processed: Original size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB, Final size: ${(bufferForProcessing.length / 1024).toFixed(2)} KB`);

    } catch (processingError) {
      console.error('[API/AvatarUpload] Error during image processing:', processingError);
      console.warn('[API/AvatarUpload] Using original image due to processing error.');
      // Ensure bufferForProcessing is the original content if processing failed
      bufferForProcessing = new Uint8Array(arrayBuffer);
    }

    // Final size check (even if processing failed)
    const finalMaxSize = 1 * 1024 * 1024; // 1MB
    if (bufferForProcessing.length > finalMaxSize) {
        console.error(`[API/AvatarUpload] Final image size (${(bufferForProcessing.length / 1024).toFixed(2)} KB) exceeds limit of 1MB, even after processing attempts.`);
        return NextResponse.json({ error: 'Processed file size still exceeds 1MB limit. Please use a smaller image.' }, { status: 400 });
    }

    // --- Storage Operations --- 
    const fileExtension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'; // Default extension
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const finalExtension = validExtensions.includes(fileExtension) ? fileExtension : 'jpg';
    const fileName = `avatar-${userDbId}.${finalExtension}`;
    const filePath = `avatars/${fileName}`;
    const contentType = `image/${finalExtension}`;

    // Use AvatarStorage service
    try {
      // Check for and remove any existing avatar(s) for this user
      const existingFiles = await AvatarStorage.listUserAvatars(userDbId);
      const filesToRemove = existingFiles
        .filter(path => path !== filePath); // Don't remove the exact file we are about to upload

      if (filesToRemove.length > 0) {
          console.log(`[API/AvatarUpload] Found ${filesToRemove.length} potentially conflicting avatar(s) for user ${userDbId}: ${filesToRemove.join(', ')}. Attempting removal...`);
          await AvatarStorage.removeAvatars(filesToRemove);
      } else {
          console.log(`[API/AvatarUpload] Existing file found matches target path ${filePath}. Upsert will handle replacement.`);
      }

      // Upload the avatar - ensure it's a Buffer if processed, otherwise pass ArrayBuffer
      // AvatarStorage.uploadAvatar accepts Buffer | ArrayBuffer
      const uploadPayload = Buffer.isBuffer(bufferForProcessing) ? bufferForProcessing : arrayBuffer;
      await AvatarStorage.uploadAvatar(filePath, uploadPayload, contentType);

    } catch (storageError) {
      console.error(`[API/AvatarUpload] Storage operation failed for user ${userDbId}:`, storageError);
      // Log error and decide how to handle it
      return NextResponse.json({ error: `Storage operation failed: ${storageError instanceof Error ? storageError.message : 'Unknown error'}` }, { status: 500 });
    }

    // --- URL Generation and Verification --- 
    let publicUrl: string;
    try {
      publicUrl = await AvatarStorage.getPublicUrl(filePath);
    } catch (urlError) {
       console.error(`[API/AvatarUpload] Failed to get public URL for ${filePath} after upload:`, urlError);
       // Decide how to handle this - maybe try to rollback upload?
       return NextResponse.json({ error: 'Failed to retrieve public URL for avatar after upload.' }, { status: 500 });
    }

    console.log(`[API/AvatarUpload] Generated public URL: ${publicUrl}`);
    
    // Verify URL accessibility (optional, for debugging)
    try {
      const headResponse = await fetch(publicUrl, { method: 'HEAD' });
      console.log(`[API/AvatarUpload] Avatar URL accessibility check: ${headResponse.ok ? 'Success ✅' : 'Failed ❌'} (Status: ${headResponse.status})`);
      if (!headResponse.ok) {
          console.warn(`[API/AvatarUpload] Public URL ${publicUrl} returned status ${headResponse.status}. Check bucket permissions and RLS.`);
      }
    } catch (fetchError) {
      console.error('[API/AvatarUpload] Avatar URL accessibility check failed with error:', fetchError);
    }

    // --- Update User Profile --- 
    try {
      const updatedUser = await userRepository.update(userDbId, { avatarUrl: publicUrl });
      if (!updatedUser) {
        throw new Error('User profile update returned no user.'); // More specific error
      }
    } catch (updateError) {
      console.error(`[API/AvatarUpload] Failed to update user profile (DB ID: ${userDbId}) with new avatar URL:`, updateError);
      // Attempt to roll back the storage upload
      try {
          await AvatarStorage.removeAvatars([filePath]);
          console.log(`[API/AvatarUpload] Rolled back avatar upload (${filePath}) due to profile update failure.`);
      } catch (rollbackError) {
          console.error(`[API/AvatarUpload] Failed to roll back avatar upload (${filePath}) after profile update failure:`, rollbackError);
      }
      return NextResponse.json({ error: 'Failed to update user profile with new avatar.' }, { status: 500 });
    }

    // --- Cache Invalidation (Handled by Context/Service on client-side after successful API call) --- 
    console.log(`[API/AvatarUpload] Avatar update process completed for user ${userDbId}.`);

    // --- Success Response --- 
    return NextResponse.json({
      avatarUrl: publicUrl,
      message: 'Avatar updated successfully',
    });

  } catch (error) {
    console.error('[API/AvatarUpload] Unexpected error in POST handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `An unexpected error occurred: ${errorMessage}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    // Get Supabase client using the server helper
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userRepository } = await getSupabaseRepositories();
    const userProfile = await userRepository.findBySupabaseUid(user.id);
    if (!userProfile || !userProfile.id) {
      return NextResponse.json({ error: 'User profile not found in database.' }, { status: 404 });
    }
    const userDbId = userProfile.id;

    // --- Storage Removal ---
    try {
      // Use AvatarStorage service to remove all avatars for the user
      await AvatarStorage.removeAllUserAvatars(userDbId);
    } catch (storageError) {
       console.error(`[API/AvatarRemove] Storage removal failed for user ${userDbId}:`, storageError);
       return NextResponse.json({ error: `Failed to remove avatar file(s): ${storageError instanceof Error ? storageError.message : 'Unknown error'}` }, { status: 500 });
    }

    // --- Update User Profile ---
    try {
      // Use undefined instead of null to clear the avatarUrl field
      await userRepository.update(userDbId, { avatarUrl: undefined });
    } catch (updateError) {
       console.error(`[API/AvatarRemove] Failed to update user profile (DB ID: ${userDbId}) after removing avatar:`, updateError);
       // Log error, but proceed - avatar is removed from storage, profile update is secondary
       // Consider if this should return an error instead
    }

    // --- Cache Invalidation (Handled by Context/Service on client-side) ---
    console.log(`[API/AvatarRemove] Avatar removal process completed for user ${userDbId}.`);

    return NextResponse.json({ message: 'Avatar removed successfully' });

  } catch (error) {
    console.error('[API/AvatarRemove] Unexpected error in DELETE handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `An unexpected error occurred: ${errorMessage}` }, { status: 500 });
  }
}
