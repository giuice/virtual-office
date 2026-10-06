// src/app/api/messages/attachment/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { isAuthzFailure, jsonError, requireMessageParticipant } from '@/lib/auth/authorize';
import {
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  isConversationAttachmentPath,
  normalizeAttachmentName,
} from '@/lib/messaging/attachment-policy';
import { signAttachmentUrl } from '@/lib/messaging/attachment-storage';

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
 * Only linked attachments resolve here: pending uploads (not yet sent) are
 * not in message_attachments and answer 404 (Phase 4 FR-010).
 * `?download=1` signs the URL as a download saved under the attachment's
 * name (feed file cards, Phase 4 FR-011); otherwise it is served inline.
 */
export async function GET(
  request: NextRequest,
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
      .select('id, message_id, url, name')
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
    // Phase 4 T12: sign only objects stored under the message's own
    // conversation folder, so a row can never expose another conversation's
    // object (or a pending upload of another conversation).
    if (!isConversationAttachmentPath(storagePath, ctx.message.conversationId)) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Phase 4 BR-011: short-lived signed URL (ATTACHMENT_SIGNED_URL_TTL_SECONDS),
    // issued only after the membership check; the redirect itself is not
    // cacheable so every read re-checks membership.
    const download = request.nextUrl.searchParams.get('download') === '1';
    const signedUrl = await signAttachmentUrl(
      serviceClient,
      storagePath,
      ATTACHMENT_SIGNED_URL_TTL_SECONDS,
      download ? { downloadName: normalizeAttachmentName(String(attachment.name ?? '')) } : {}
    );
    if (!signedUrl) {
      return NextResponse.json({ error: 'Failed to get file URL' }, { status: 500 });
    }

    const response = NextResponse.redirect(signedUrl);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
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

    // Phase 4 T12: an attachment-only message keeps at least one attachment
    // (it would otherwise be an empty message).
    const [{ data: owner, error: ownerError }, { count: attachmentCount, error: countError }] = await Promise.all([
      supabase.from('messages').select('content').eq('id', attachment.message_id).single(),
      supabase
        .from('message_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('message_id', attachment.message_id),
    ]);
    if (ownerError || countError || !owner || attachmentCount === null) {
      console.error('Error checking attachment removal:', ownerError ?? countError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    if (owner.content === '' && attachmentCount <= 1) {
      return jsonError(
        409,
        'LAST_ATTACHMENT_OF_EMPTY_MESSAGE',
        'The only attachment of a message without text cannot be removed; delete the message instead'
      );
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
