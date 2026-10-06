// src/lib/messaging/attachment-storage.ts
// Object operations on the private attachments bucket. Every function takes
// the SERVICE-ROLE client: the bucket has no storage.objects policies, so
// callers must authorize the user (membership / ownership) before calling.
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { ATTACHMENTS_BUCKET, ATTACHMENT_SIGNED_URL_TTL_SECONDS } from '@/lib/messaging/attachment-policy';

export interface StoredAttachmentObject {
  size: number;
  contentType: string;
}

export async function uploadAttachmentObject(
  serviceClient: SupabaseClient,
  storagePath: string,
  body: Uint8Array,
  contentType: string
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  // Fresh uuid path per upload: never overwrite (no upsert).
  const { error } = await serviceClient.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, body, { contentType, upsert: false });
  return error ? { ok: false, error } : { ok: true };
}

/** Size and MIME type recorded by Storage for the object; null when it does not exist. */
export async function readAttachmentObject(
  serviceClient: SupabaseClient,
  storagePath: string
): Promise<StoredAttachmentObject | null> {
  const { data, error } = await serviceClient.storage.from(ATTACHMENTS_BUCKET).info(storagePath);
  if (error || !data) {
    return null;
  }
  if (typeof data.size !== 'number' || typeof data.contentType !== 'string') {
    return null;
  }
  return { size: data.size, contentType: data.contentType };
}

export async function removeAttachmentObjects(
  serviceClient: SupabaseClient,
  storagePaths: readonly string[]
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  if (storagePaths.length === 0) return { ok: true };
  const { error } = await serviceClient.storage.from(ATTACHMENTS_BUCKET).remove([...storagePaths]);
  return error ? { ok: false, error } : { ok: true };
}

export interface SignAttachmentUrlOptions {
  /**
   * Serve the object as a download saved under this name (Storage answers
   * with `Content-Disposition: attachment`). Omitted: served inline.
   */
  downloadName?: string;
}

/** Short-lived signed read URL; callers must have authorized a conversation member. */
export async function signAttachmentUrl(
  serviceClient: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number = ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  options: SignAttachmentUrlOptions = {}
): Promise<string | null> {
  const { data, error } = await serviceClient.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) {
    console.error('Error signing attachment URL:', error);
    return null;
  }
  if (!options.downloadName) {
    return data.signedUrl;
  }
  // Added here rather than through createSignedUrl's `download` option, which
  // percent-encodes the name twice (non-ASCII names arrive garbled). The
  // token signs the object path; `download` only selects the disposition.
  // Control characters, quotes, and path separators never reach the
  // Content-Disposition that Storage builds from this name.
  const safeName = options.downloadName.replace(/[\u0000-\u001f\u007f"\\/]/g, '_');
  const signedUrl = new URL(data.signedUrl);
  signedUrl.searchParams.set('download', safeName);
  return signedUrl.toString();
}
