import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import sharp from 'sharp'; // For image processing
import { invalidateAvatarCache } from '@/lib/avatar-utils'; // Import the cache invalidation function

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
    let buffer = new Uint8Array(arrayBuffer);
    // Removed unused variable 'processedSuccessfully'

    // --- Image Processing --- 
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
        processedBuffer = await processedImage[outputFormat]({
          quality: quality
        }).toBuffer();
        
        if (processedBuffer.length <= targetSize) {
          break;
        }
        
        // Reduce quality and try again
        quality -= 10;
      }

      // If we still can't get it under 1MB, use the smallest version generated
      if (processedBuffer && processedBuffer.length > targetSize) {
         console.warn(`[API/AvatarUpload] Processed image still exceeds target size (${(buffer.length / 1024).toFixed(2)} KB). Using smallest processed version.`);
      }
      buffer = processedBuffer || buffer; // Use processed if available, else original
      // Removed assignment to unused variable 'processedSuccessfully'
      console.log(`[API/AvatarUpload] Image processed: Original size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB, Final size: ${(buffer.length / 1024).toFixed(2)} KB`);

    } catch (processingError) {
      console.error('[API/AvatarUpload] Error during image processing:', processingError);
      // Log the error but continue with the original buffer
      console.warn('[API/AvatarUpload] Using original image due to processing error.');
      // buffer remains the original arrayBuffer content
    }
    
    // Final size check (even if processing failed)
    const finalMaxSize = 1 * 1024 * 1024; // 1MB
    if (buffer.length > finalMaxSize) {
        console.error(`[API/AvatarUpload] Final image size (${(buffer.length / 1024).toFixed(2)} KB) exceeds limit of 1MB, even after processing attempts.`);
        return NextResponse.json({ error: 'Processed file size still exceeds 1MB limit. Please use a smaller image.' }, { status: 400 });
    }

    // --- Storage Operations --- 
    const fileExtension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'; // Default extension
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const finalExtension = validExtensions.includes(fileExtension) ? fileExtension : 'jpg';
    const fileName = `avatar-${userDbId}.${finalExtension}`;
    const filePath = `avatars/${fileName}`;

    const serviceRoleSupabase = await createSupabaseServerClient('service_role');

    // Check for and remove any existing avatar(s) for this user
    try {
      const { data: existingFiles, error: listError } = await serviceRoleSupabase.storage
        .from('user-uploads') // Ensure this matches your bucket name
        .list('avatars', { search: `avatar-${userDbId}.` });

      if (listError) {
        // Log error but don't block the upload, upsert might handle it
        console.error(`[API/AvatarUpload] Error listing existing avatars for user ${userDbId}:`, listError.message);
      } else if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles
          .map(file => `avatars/${file.name}`)
          .filter(path => path !== filePath); // Don't remove the exact file we are about to upload
          
        if (filesToRemove.length > 0) {
            console.log(`[API/AvatarUpload] Found ${filesToRemove.length} potentially conflicting avatar(s) for user ${userDbId}: ${filesToRemove.join(', ')}. Attempting removal...`);
            const { data: removeData, error: removeError } = await serviceRoleSupabase.storage
              .from('user-uploads') // Ensure this matches your bucket name
              .remove(filesToRemove);
              
            if (removeError) {
              console.error(`[API/AvatarUpload] Error removing existing avatar(s) for user ${userDbId}:`, removeError.message);
              // Log error but proceed, upsert might still work
            } else {
              console.log(`[API/AvatarUpload] Successfully removed ${removeData?.length || 0} conflicting avatar(s).`);
            }
        } else {
             console.log(`[API/AvatarUpload] Existing file found matches target path ${filePath}. Upsert will handle replacement.`);
        }
      } else {
        console.log(`[API/AvatarUpload] No existing avatar found for user ${userDbId}. Proceeding with new upload.`);
      }
    } catch (checkRemoveError) {
      console.error('[API/AvatarUpload] Unexpected error during avatar check/removal:', checkRemoveError);
      // Log and proceed with upload
    }

    // Upload the file (use Buffer for sharp output)
    const { data: uploadData, error: uploadError } = await serviceRoleSupabase.storage
      .from('user-uploads') // Ensure this matches your bucket name
      .upload(filePath, Buffer.from(buffer), { // Use Buffer.from() for Uint8Array
        contentType: `image/${finalExtension}`,
        upsert: true, // Replace if exists
      });

    if (uploadError) {
      console.error(`[API/AvatarUpload] Error uploading file ${filePath}:`, uploadError);
      return NextResponse.json({ error: `Failed to upload file: ${uploadError.message}` }, { status: 500 });
    }
    console.log(`[API/AvatarUpload] Successfully uploaded ${filePath}`);

    // --- URL Generation and Verification --- 
    const { data: { publicUrl } } = supabase.storage
      .from('user-uploads') // Ensure this matches your bucket name
      .getPublicUrl(filePath);
      
    if (!publicUrl) {
        console.error(`[API/AvatarUpload] Failed to get public URL for ${filePath} after successful upload.`);
        return NextResponse.json({ error: 'Failed to retrieve public URL for avatar.' }, { status: 500 });
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
    const updatedUser = await userRepository.update(userDbId, { avatarUrl: publicUrl });

    if (!updatedUser) {
      console.error(`[API/AvatarUpload] Failed to update user profile (DB ID: ${userDbId}) with new avatar URL.`);
      // Attempt to remove the just-uploaded avatar to avoid inconsistency
      try {
          await serviceRoleSupabase.storage.from('user-uploads').remove([filePath]);
          console.log(`[API/AvatarUpload] Rolled back avatar upload (${filePath}) due to profile update failure.`);
      } catch (rollbackError) {
          console.error(`[API/AvatarUpload] Failed to roll back avatar upload (${filePath}) after profile update failure:`, rollbackError);
      }
      return NextResponse.json({ error: 'Failed to update user profile with new avatar.' }, { status: 500 });
    }
    
    // --- Cache Invalidation --- 
    invalidateAvatarCache();
    console.log(`[API/AvatarUpload] Avatar cache invalidated for user ${userDbId}.`);

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
