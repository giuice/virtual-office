// src/app/api/messages/attachment/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { isAuthzFailure, requireMessageParticipant } from '@/lib/auth/authorize';

// Audit S-03: message_attachments.url stores the storage path; legacy rows
// may still hold a full public URL — extract the path in that case.
function resolveStoragePath(url: string): string | null {
  if (!url.startsWith('http')) {
    return url;
  }
  const pathMatch = new URL(url).pathname.match(/\/storage\/v1\/object\/(?:public\/)?attachments\/(.*)/);
  return pathMatch ? pathMatch[1] : null;
}

/**
 * GET handler — authz'd read of a private attachment (audit S-03).
 * Checks conversation membership, then redirects to a short-lived signed URL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (!id) {
      return NextResponse.json({ error: 'Attachment ID is required' }, { status: 400 });
    }

    const serviceClient = await createSupabaseServerClient('service_role');
    const { data: attachment, error: fetchError } = await serviceClient
      .from('message_attachments')
      .select('id, message_id, url')
      .eq('id', id)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const ctx = await requireMessageParticipant(attachment.message_id);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const storagePath = resolveStoragePath(attachment.url);
    if (!storagePath) {
      return NextResponse.json({ error: 'Invalid attachment URL format' }, { status: 400 });
    }

    const { data: signed, error: signError } = await serviceClient
      .storage
      .from('attachments')
      .createSignedUrl(storagePath, 3600);

    if (signError || !signed) {
      console.error('Error signing attachment URL:', signError);
      return NextResponse.json({ error: 'Failed to get file URL' }, { status: 500 });
    }

    return NextResponse.redirect(signed.signedUrl);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE handler for removing a file attachment (sender only).
 */
export async function DELETE(
  _request: NextRequest,
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
    
    // Audit S-03: the bucket is private — mutations go through the service
    // client after the membership + sender checks.
    const supabase = ctx.serviceClient;

    if (ctx.message.senderId !== ctx.dbUser.id) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
    
    const storagePath = resolveStoragePath(attachment.url);

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
      const thumbnailPath = resolveStoragePath(attachment.thumbnail_url);

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
