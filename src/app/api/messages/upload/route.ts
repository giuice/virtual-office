// src/app/api/messages/upload/route.ts
import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  VOICE_NOTE_UPLOAD_KIND,
  buildAttachmentStoragePath,
  buildVoiceNoteStoragePath,
  checkAttachmentFile,
  checkVoiceNoteFile,
  matchesVoiceNoteContainer,
  mimeTypeEssence,
  normalizeAttachmentName,
  parseVoiceNoteMetadata,
  type VoiceNoteMetadata,
} from '@/lib/messaging/attachment-policy';
import { removeAttachmentObjects, uploadAttachmentObject } from '@/lib/messaging/attachment-storage';
import { sweepStalePendingUploads } from '@/lib/messaging/attachment-uploads';
import { SupabaseMessageAttachmentUploadRepository } from '@/repositories/implementations/supabase/SupabaseMessageAttachmentUploadRepository';
import type { FileAttachment, VoiceNoteAttachment } from '@/types/messaging';

/**
 * Uploads one file for a future message of the conversation (Phase 4 T12).
 *
 * The file is stored in the private attachments bucket and recorded as a
 * PENDING upload of the caller: nobody can read it until a message is created
 * with it (POST /api/messages/create `attachmentIds`); DELETE
 * /api/messages/upload/{id} cancels it. Limits (size, MIME type) come from the
 * server attachment policy and are checked again on the stored object when
 * the message is created.
 *
 * Response 201: `{ success, attachment: { id, name, type, size, url } }` —
 * `id` is the upload id to send in `attachmentIds` and becomes the attachment
 * id; `url` is the member-only read route, which answers 404 until the
 * message exists.
 *
 * Voice notes (Phase 4 T15): form fields `kind=voice`, `duration` (decimal
 * seconds, 0 < d <= 120) and `waveform` (JSON array of 1-256 numbers in
 * [0, 1]); the file must be WebM or MP4 audio (codec parameters are dropped:
 * the stored type is `audio/webm` or `audio/mp4`, the object extension
 * .webm or .m4a) whose bytes start like that container and whose size fits
 * the duration. The response adds `duration`
 * (whole seconds, rounded up) and `waveformData`. Audio without `kind=voice`
 * is refused (415 UNSUPPORTED_FILE_TYPE); send the upload id alone in
 * `attachmentIds` (a voice note is the only attachment of its message).
 */
// Multipart framing around one file is small; anything larger than the file
// limit plus this allowance is refused before the body is buffered.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  try {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return jsonError(413, 'FILE_TOO_LARGE', `File exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)} MB limit`);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Expected multipart form data');
    }

    const file = formData.get('file');
    const conversationId = formData.get('conversationId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      return NextResponse.json({ error: 'No conversation ID provided' }, { status: 400 });
    }
    // Attaching to an existing message bypassed the per-message limits and
    // the atomic send (BR-007); uploads are linked only at message creation.
    if (formData.get('messageId') !== null) {
      return jsonError(
        400,
        'MESSAGE_ID_NOT_SUPPORTED',
        'Upload without messageId and send the upload id in attachmentIds when creating the message'
      );
    }
    const kind = formData.get('kind');
    if (kind !== null && kind !== VOICE_NOTE_UPLOAD_KIND) {
      return jsonError(400, 'INVALID_UPLOAD_KIND', `kind must be omitted or "${VOICE_NOTE_UPLOAD_KIND}"`);
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }
    const { serviceClient, dbUser, conversation } = ctx;

    const rateLimited = await enforceRateLimit(serviceClient, dbUser.id, 'message:upload');
    if (rateLimited) {
      return rateLimited;
    }

    // Audio is accepted only as a voice note with valid metadata (T15).
    let voiceNote: VoiceNoteMetadata | undefined;
    let contentType = file.type;
    if (kind === VOICE_NOTE_UPLOAD_KIND) {
      const metadata = parseVoiceNoteMetadata({ duration: formData.get('duration'), waveform: formData.get('waveform') });
      if (!metadata.ok) {
        return jsonError(metadata.violation.status, metadata.violation.code, metadata.violation.message);
      }
      voiceNote = metadata.value;
      contentType = mimeTypeEssence(file.type);
    }
    const checkFile = (size: number) =>
      voiceNote
        ? checkVoiceNoteFile({ size, type: contentType }, voiceNote.duration)
        : checkAttachmentFile({ size, type: contentType });

    const declaredViolation = checkFile(file.size);
    if (declaredViolation) {
      return jsonError(declaredViolation.status, declaredViolation.code, declaredViolation.message);
    }

    const body = new Uint8Array(await file.arrayBuffer());
    // Size actually received, not the declared one.
    const receivedViolation = checkFile(body.byteLength);
    if (receivedViolation) {
      return jsonError(receivedViolation.status, receivedViolation.code, receivedViolation.message);
    }
    if (voiceNote && !matchesVoiceNoteContainer(body, contentType)) {
      return jsonError(415, 'UNSUPPORTED_FILE_TYPE', 'Voice note content does not match its audio type');
    }

    const uploadId = randomUUID();
    const name = normalizeAttachmentName(file.name);
    const storagePath = voiceNote
      ? buildVoiceNoteStoragePath(conversation.id, uploadId, contentType)
      : buildAttachmentStoragePath(conversation.id, uploadId, name);

    const stored = await uploadAttachmentObject(serviceClient, storagePath, body, contentType);
    if (!stored.ok) {
      console.error('Error uploading attachment object:', stored.error);
      return jsonError(500, 'INTERNAL_ERROR', 'Failed to upload file');
    }

    const uploads = new SupabaseMessageAttachmentUploadRepository(serviceClient);
    try {
      await uploads.create({
        id: uploadId,
        conversationId: conversation.id,
        uploaderId: dbUser.id,
        storagePath,
        name,
        type: contentType,
        size: body.byteLength,
        duration: voiceNote?.duration,
        waveformData: voiceNote?.waveformData,
      });
    } catch {
      // Without its pending record the object could never be linked; drop it.
      await removeAttachmentObjects(serviceClient, [storagePath]);
      return jsonError(500, 'INTERNAL_ERROR', 'Failed to upload file');
    }

    await sweepStalePendingUploads(serviceClient, uploads, dbUser.id);

    const fileAttachment: FileAttachment = {
      id: uploadId,
      name,
      type: contentType,
      size: body.byteLength,
      url: `/api/messages/attachment/${uploadId}`,
    };
    const attachment: FileAttachment | VoiceNoteAttachment = voiceNote
      ? { ...fileAttachment, duration: voiceNote.duration, waveformData: voiceNote.waveformData }
      : fileAttachment;
    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    console.error('Error handling file upload:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}
