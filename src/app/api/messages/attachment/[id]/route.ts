// src/app/api/messages/attachment/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { isAuthzFailure, requireMessageParticipant } from '@/lib/auth/authorize';

/**
 * DELETE handler for removing a file attachment
 * The route handles the mismatch between Firebase UIDs and Database UUIDs
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const attachmentId = id;
    if (!attachmentId) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 });
    }

    const serviceClient = await createSupabaseServerClient('service_role');
    
    // Get the attachment to find its path in storage
    const { data: attachment, error: fetchError } = await serviceClient
      .from('message_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();
    
    if (fetchError || !attachment) {
      console.error('Error fetching attachment:', fetchError);
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const ctx = await requireMessageParticipant(attachment.message_id);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }
    
    const supabase = ctx.supabase;

    if (ctx.message.senderId !== ctx.dbUser.id) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
    
    // Extract storage path from URL - assuming standard Supabase URL format
    // This is a simplification - in real implementation, you'd store the path separately
    const urlParts = new URL(attachment.url);
    const pathMatch = urlParts.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.*)/);
    const storagePath = pathMatch ? pathMatch[1] : null;
    
    if (!storagePath) {
      console.error('Could not extract storage path from URL:', attachment.url);
      return NextResponse.json({ error: 'Invalid attachment URL format' }, { status: 400 });
    }
    
    // Delete from storage
    const { error: storageError } = await supabase
      .storage
      .from('attachments')
      .remove([storagePath]);
    
    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Continue to delete DB record even if storage deletion fails
    }
    
    // If attachment has a thumbnail, delete it too
    if (attachment.thumbnail_url) {
      const thumbnailUrlParts = new URL(attachment.thumbnail_url);
      const thumbnailPathMatch = thumbnailUrlParts.pathname.match(/\/storage\/v1\/object\/public\/attachments\/(.*)/);
      const thumbnailPath = thumbnailPathMatch ? thumbnailPathMatch[1] : null;
      
      if (thumbnailPath) {
        await supabase
          .storage
          .from('attachments')
          .remove([thumbnailPath]);
      }
    }
    
    // Delete the attachment record from database
    const { error: deleteError } = await supabase
      .from('message_attachments')
      .delete()
      .eq('id', attachmentId);
    
    if (deleteError) {
      console.error('Error deleting attachment record:', deleteError);
      return NextResponse.json({ error: 'Failed to delete attachment record' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Attachment deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
