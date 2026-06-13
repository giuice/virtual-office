// src/app/api/messages/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

// Audit S-03: server-side upload limits. The 'attachments' bucket enforces
// the same caps (private bucket, signed reads) — this is the first gate.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Handle file upload for message attachments
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Get file and metadata from form data
    const file = formData.get('file') as File;
    const conversationId = formData.get('conversationId') as string;
    const messageId = formData.get('messageId') as string | undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'No conversation ID provided' }, { status: 400 });
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const rateLimited = await enforceRateLimit(ctx.serviceClient, ctx.dbUser.id, 'message:upload');
    if (rateLimited) {
      return rateLimited;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonError(413, 'FILE_TOO_LARGE', `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`);
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError(415, 'UNSUPPORTED_FILE_TYPE', 'File type is not allowed');
    }

    const supabase = ctx.supabase;
    const { messageRepository } = await getSupabaseRepositories(supabase);

    // Prepare file metadata
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const size = file.size;
    const type = file.type;
    const originalName = file.name;

    // Define path in storage
    const storagePath = `message-attachments/${conversationId}/${uniqueFilename}`;

    // Convert file to arrayBuffer for upload
    // Support environments (tests) where File.arrayBuffer might not exist
    let buffer: Uint8Array;
    if (typeof (file as any).arrayBuffer === 'function') {
      const bytes = await (file as any).arrayBuffer();
      buffer = new Uint8Array(bytes);
    } else {
      // Fallback: read via stream
      const reader = (file as any).stream?.().getReader?.();
      const chunks: Uint8Array[] = [];
      if (reader) {
        const readNextChunk = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) return;
          if (value) chunks.push(value);
          await readNextChunk();
        };
        await readNextChunk();
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          buffer.set(c, offset);
          offset += c.length;
        }
      } else {
        // Last resort empty buffer
        buffer = new Uint8Array();
      }
    }

    // Audit S-03: the bucket is private — uploads go through the service
    // client after the membership check; reads are signed via the GET
    // attachment route. Filename is a fresh UUID, so no upsert.
    const { error: uploadError } = await ctx.serviceClient
      .storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: type,
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Create file attachment record in database — url stores the storage
    // path; the serialized attachment exposes the authz'd API route instead.
    const attachmentData = {
      name: originalName,
      type,
      size,
      url: storagePath,
      thumbnailUrl: undefined
    };

    // If messageId is provided, link attachment to message
    if (messageId) {
      // Verify the message exists and belongs to the conversation
      const message = await messageRepository.findById(messageId);
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }

      if (message.conversationId !== conversationId) {
        return NextResponse.json({ error: 'Message does not belong to the specified conversation' }, { status: 400 });
      }

      const attachment = await messageRepository.addAttachment(messageId, attachmentData);
      return NextResponse.json({
        success: true,
        attachment
      });
    }

    // No DB row yet (attachment uploaded before message creation) — return a
    // short-lived signed URL so the client can preview the file.
    const { data: signed, error: signError } = await ctx.serviceClient
      .storage
      .from('attachments')
      .createSignedUrl(storagePath, 3600);

    if (signError || !signed) {
      console.error('Error signing uploaded file URL:', signError);
      return NextResponse.json({ error: 'Failed to get file URL' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      attachment: {
        id: uuidv4(), // Temporary ID
        ...attachmentData,
        url: signed.signedUrl
      }
    });

  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
