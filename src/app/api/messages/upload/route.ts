// src/app/api/messages/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
// Removed deprecated auth-helpers client in favor of SSR client
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { validateUserSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

/**
 * Handle file upload for message attachments
 */
export async function POST(request: NextRequest) {
  try {
    // Validate user session
  const { userDbId, error: sessionError } = await validateUserSession();

    if (sessionError || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }

    // Create Supabase client with context
  const supabase = await createSupabaseServerClient();
  const { messageRepository } = await getSupabaseRepositories(supabase);
    
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
    
    // Check if user has access to the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('participants')
      .eq('id', conversationId)
      .single();
      
    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Verify user is a participant in the conversation (DB IDs)
    if (!conversation.participants.includes(userDbId)) {
      return NextResponse.json({ error: 'Not authorized to upload to this conversation' }, { status: 403 });
    }
    
    // Prepare file metadata
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const size = file.size;
    const type = file.type;
    const originalName = file.name;
    
    // Define paths in storage
    const storagePath = `message-attachments/${conversationId}/${uniqueFilename}`;
    let thumbnailPath = null;
    
    // Check if image and create thumbnail
    let thumbnailUrl = null;
    if (type.startsWith('image/')) {
      const thumbnailName = `thumb_${uniqueFilename}`;
      thumbnailPath = `message-attachments/${conversationId}/thumbnails/${thumbnailName}`;
    }
    
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
        // Read all chunks
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
        }
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
    
    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from('attachments') // Bucket name
      .upload(storagePath, buffer, {
        contentType: type,
        upsert: true
      });
    
    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
    
    // If it's an image, generate and upload a thumbnail
    if (thumbnailPath && type.startsWith('image/')) {
      // For simplicity, we're just using the same image as thumbnail
      // In a real implementation, you'd resize the image here
      const { error: thumbnailError } = await supabase
        .storage
        .from('attachments')
        .upload(thumbnailPath, buffer, {
          contentType: type,
          upsert: true
        });
        
      if (!thumbnailError) {
        // Get public URL for thumbnail
        const { data: thumbUrlData } = await supabase
          .storage
          .from('attachments')
          .getPublicUrl(thumbnailPath);
          
        thumbnailUrl = thumbUrlData?.publicUrl;
      }
    }
    
    // Get public URL for original file
    const { data: urlData } = await supabase
      .storage
      .from('attachments')
      .getPublicUrl(storagePath);
      
    if (!urlData) {
      return NextResponse.json({ error: 'Failed to get file URL' }, { status: 500 });
    }
    
    // Create file attachment record in database
    const attachmentData = {
      name: originalName,
      type,
      size,
      url: urlData.publicUrl,
      thumbnailUrl: thumbnailUrl === null ? undefined : thumbnailUrl
    };
    
    // If messageId is provided, link attachment to message
    let attachment;
    if (messageId) {
      // Verify the message exists and belongs to the conversation
      const message = await messageRepository.findById(messageId);
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }
      
      if (message.conversationId !== conversationId) {
        return NextResponse.json({ error: 'Message does not belong to the specified conversation' }, { status: 400 });
      }
      
      attachment = await messageRepository.addAttachment(messageId, attachmentData);
    } else {
      // For attachments uploaded before message creation, store in session or return to client
      // Here we're just returning the attachment data without storing in DB yet
      attachment = {
        id: uuidv4(), // Temporary ID
        ...attachmentData
      };
    }
    
    return NextResponse.json({ 
      success: true,
      attachment
    });
    
  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
