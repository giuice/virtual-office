// src/lib/messaging/attachment-upload-client.ts
// Browser side of the pending-upload contract (Phase 4 T12/T13): upload one
// file for a future message with progress, and cancel a pending upload.
import { VOICE_NOTE_UPLOAD_KIND } from '@/lib/messaging/attachment-policy';
import type { FileAttachment } from '@/types/messaging';

/** An upload the server or the network refused; `status` 0 = no response. */
export class AttachmentUploadError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'AttachmentUploadError';
    this.status = status;
    this.code = code;
  }
}

/** The upload was aborted through its signal. */
export class AttachmentUploadAbortedError extends Error {
  constructor() {
    super('Upload aborted');
    this.name = 'AttachmentUploadAbortedError';
  }
}

/** Voice-note metadata (Phase 4 T15/T16): the upload is sent with kind=voice. */
export interface VoiceNoteUploadMetadata {
  /** Decimal seconds, 0 < d <= 120. */
  durationSeconds: number;
  /** 1–256 amplitudes in [0, 1]. */
  waveform: readonly number[];
}

interface UploadOptions {
  /** Fraction of the request body sent, 0–1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Present for a voice note. */
  voice?: VoiceNoteUploadMetadata;
}

function parseErrorBody(responseText: string): { code: string | null; message: string | null } {
  try {
    const body = JSON.parse(responseText) as { code?: unknown; error?: unknown };
    return {
      code: typeof body.code === 'string' ? body.code : null,
      message: typeof body.error === 'string' ? body.error : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

/**
 * POST /api/messages/upload through XMLHttpRequest, the browser API that
 * reports request-body progress (fetch does not). Resolves with the pending
 * attachment (its id goes into `attachmentIds` when the message is created).
 */
export function uploadPendingAttachment(
  file: File,
  conversationId: string,
  { onProgress, signal, voice }: UploadOptions = {}
): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AttachmentUploadAbortedError());
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationId', conversationId);
    if (voice) {
      formData.append('kind', VOICE_NOTE_UPLOAD_KIND);
      formData.append('duration', voice.durationSeconds.toFixed(3));
      formData.append('waveform', JSON.stringify(voice.waveform));
    }

    const xhr = new XMLHttpRequest();
    const onAbortSignal = () => xhr.abort();
    const settle = () => signal?.removeEventListener('abort', onAbortSignal);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      settle();
      if (xhr.status === 201) {
        try {
          const body = JSON.parse(xhr.responseText) as { attachment?: FileAttachment };
          if (body.attachment?.id) {
            onProgress?.(1);
            resolve(body.attachment);
            return;
          }
        } catch {
          // fall through to the error below
        }
        reject(new AttachmentUploadError(xhr.status, null, 'Invalid upload response'));
        return;
      }
      const { code, message } = parseErrorBody(xhr.responseText);
      reject(new AttachmentUploadError(xhr.status, code, message ?? 'Upload failed'));
    };
    xhr.onerror = () => {
      settle();
      reject(new AttachmentUploadError(0, null, 'Network error'));
    };
    xhr.onabort = () => {
      settle();
      reject(new AttachmentUploadAbortedError());
    };

    signal?.addEventListener('abort', onAbortSignal);
    xhr.open('POST', '/api/messages/upload');
    xhr.send(formData);
  });
}

/**
 * DELETE /api/messages/upload/{id}: removes a pending upload (record and
 * stored file). Best effort — an upload that is never sent stays invisible
 * and is swept by the server; `keepalive` lets it finish during unload.
 */
export async function cancelPendingAttachment(uploadId: string): Promise<void> {
  try {
    await fetch(`/api/messages/upload/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
      keepalive: true,
    });
  } catch (error) {
    console.warn('Failed to cancel pending attachment upload:', error);
  }
}
