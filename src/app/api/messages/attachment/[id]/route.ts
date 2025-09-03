// src/app/api/messages/attachment/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { validateUserSession } from '@/lib/auth/session';

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
    // Validate user session
    const { userDbId, error: sessionError } = await validateUserSession();
    
    if (sessionError || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }
    
    const attachmentId = id;
    if (!attachmentId) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 });
    }
    
    // Create Supabase client with context
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get the attachment to find its path in storage
    const { data: attachment, error: fetchError } = await supabase
      .from('message_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching attachment:', fetchError);
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    
    // Get message to check if user has permission to delete this attachment
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('sender_id, conversation_id')
      .eq('id', attachment.message_id)
      .single();
    
    if (messageError) {
      console.error('Error fetching message:', messageError);
      return NextResponse.json({ error: 'Associated message not found' }, { status: 404 });
    }
    
    // Check if user has permission (is sender or admin)
    // Using Database UUID (userDbId) for comparison with database sender_id
    if (message.sender_id !== userDbId) {
      // For group chats, check if user is admin - add implementation if needed
      // For now, only message sender can delete attachments
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
