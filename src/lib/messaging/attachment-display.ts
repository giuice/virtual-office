// src/lib/messaging/attachment-display.ts
// Browser-safe helpers for showing message attachments (composer rows and
// feed previews, Phase 4 FR-009/FR-011/FR-015).

import { isVoiceNoteAttachment } from '@/lib/messaging/attachment-policy';
import type { FileAttachment } from '@/types/messaging';

/** Prefix of the authorized read route every linked attachment url uses. */
const ATTACHMENT_READ_ROUTE_PREFIX = '/api/messages/attachment/';

/** How the feed presents an attachment. */
export type AttachmentPreviewKind = 'image' | 'voice' | 'file';

/**
 * Voice notes (audio with voice-note metadata, T15/T18) get a player; an
 * audio attachment without that metadata stays a download card.
 */
export function attachmentPreviewKind(attachment: FileAttachment): AttachmentPreviewKind {
  if (isVoiceNoteAttachment(attachment)) return 'voice';
  return attachment.type.startsWith('image/') ? 'image' : 'file';
}

/** Human-readable size in Portuguese notation (e.g. "512 B", "12 KB", "1,5 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Link that downloads the attachment under its own name. The read route
 * re-checks membership and signs a fresh short-lived URL on every request, so
 * the link keeps working however long the feed stays open.
 */
export function attachmentDownloadUrl(url: string): string {
  if (!url.startsWith(ATTACHMENT_READ_ROUTE_PREFIX)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}
