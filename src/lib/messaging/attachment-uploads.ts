// src/lib/messaging/attachment-uploads.ts
// Lifecycle of pending message attachment uploads (Phase 4 T12, FR-008,
// FR-010): link-time re-validation against the stored objects, cancellation,
// and the uploader's stale-upload sweep. Callers pass the service-role client
// and the authorized users.id; nothing here authorizes on its own.
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  STALE_PENDING_UPLOAD_AGE_MS,
  checkAttachmentFile,
  checkVoiceNoteFile,
  type AttachmentPolicyViolation,
} from '@/lib/messaging/attachment-policy';
import { readAttachmentObject, removeAttachmentObjects } from '@/lib/messaging/attachment-storage';
import type { IMessageAttachmentUploadRepository } from '@/repositories/interfaces/IMessageAttachmentUploadRepository';
import type { PendingAttachmentUpload } from '@/types/messaging';

const STALE_SWEEP_BATCH = 20;

export interface AttachmentLinkViolation {
  status: number;
  code: AttachmentPolicyViolation['code'] | 'INVALID_ATTACHMENT';
  message: string;
}

/**
 * Re-checks each upload against the attachment policy using what Storage
 * actually holds (size and content type of the stored object), not what the
 * client declared. A missing object, or one that differs from its pending
 * record, is rejected.
 */
export async function validateUploadsForLink(
  serviceClient: SupabaseClient,
  uploads: readonly PendingAttachmentUpload[]
): Promise<AttachmentLinkViolation | null> {
  const stored = await Promise.all(uploads.map((upload) => readAttachmentObject(serviceClient, upload.storagePath)));
  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index];
    const object = stored[index];
    if (!object || object.size !== upload.size || object.contentType !== upload.type) {
      return {
        status: 400,
        code: 'INVALID_ATTACHMENT',
        message: 'An attachment is no longer available; upload it again',
      };
    }
    // Voice notes (T15) follow the voice policy (audio, duration-bound size);
    // every other upload the regular allowlist, which has no audio.
    const violation =
      upload.duration !== undefined
        ? checkVoiceNoteFile({ size: object.size, type: object.contentType }, upload.duration)
        : checkAttachmentFile({ size: object.size, type: object.contentType });
    if (violation) {
      return violation;
    }
  }
  return null;
}

/**
 * Cancels one of the uploader's pending uploads: the row goes first (a
 * concurrent send either linked it already — then nothing is deleted — or can
 * no longer link it), then the storage object.
 */
export async function cancelPendingUpload(
  serviceClient: SupabaseClient,
  uploads: IMessageAttachmentUploadRepository,
  uploadId: string,
  uploaderId: string
): Promise<'deleted' | 'not_found' | 'storage_failed'> {
  const removed = await uploads.deleteOwned(uploadId, uploaderId);
  if (!removed) {
    return 'not_found';
  }
  const result = await removeAttachmentObjects(serviceClient, [removed.storagePath]);
  if (!result.ok) {
    // The row is gone, so the object can never be linked or read; it only
    // occupies storage.
    console.error('Error deleting cancelled attachment object:', result.error);
    return 'storage_failed';
  }
  return 'deleted';
}

/**
 * Best-effort removal of the uploader's pending uploads abandoned for more
 * than a day (e.g. the tab was closed before sending). Never throws.
 */
export async function sweepStalePendingUploads(
  serviceClient: SupabaseClient,
  uploads: IMessageAttachmentUploadRepository,
  uploaderId: string,
  now: Date = new Date()
): Promise<number> {
  try {
    const stale = await uploads.deleteStaleOwned(
      uploaderId,
      new Date(now.getTime() - STALE_PENDING_UPLOAD_AGE_MS),
      STALE_SWEEP_BATCH
    );
    if (stale.length === 0) return 0;
    const result = await removeAttachmentObjects(
      serviceClient,
      stale.map((upload) => upload.storagePath)
    );
    if (!result.ok) {
      console.error('Error deleting stale attachment objects:', result.error);
    }
    return stale.length;
  } catch (error) {
    console.error('Stale pending upload sweep failed:', error);
    return 0;
  }
}
