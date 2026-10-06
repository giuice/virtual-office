// src/lib/messaging/attachment-policy.ts
// Server-side attachment contract (Phase 4 FR-008, BR-006, BR-011). The one
// place that defines what a message attachment may be; the upload route checks
// it on arrival and the create route re-checks the STORED object at link time.
// Voice notes (T15) extend this module rather than adding a parallel list.
// The drawer composer (T13) imports it too, to refuse files before upload:
// keep it free of server-only imports.
import { MessageType, type FileAttachment, type VoiceNoteAttachment } from '@/types/messaging';

export const ATTACHMENTS_BUCKET = 'attachments';

/** Maximum attachments on one message (also bounded in create_message_with_attachments). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Per-file limit; the private bucket enforces the same file_size_limit. */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Lifetime of signed read URLs handed to conversation members. */
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 300;

/** Pending uploads older than this are removed by the uploader's next upload. */
export const STALE_PENDING_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;

const MAX_ATTACHMENT_NAME_LENGTH = 255;

/** Allowed attachment extensions and the MIME type each one is uploaded as. */
const ATTACHMENT_EXTENSION_MIME_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ALLOWED_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set(Object.values(ATTACHMENT_EXTENSION_MIME_TYPES));

/** `accept` value for a file input offering only allowed attachments. */
export const ATTACHMENT_INPUT_ACCEPT = [
  ...ALLOWED_ATTACHMENT_MIME_TYPES,
  ...Object.keys(ATTACHMENT_EXTENSION_MIME_TYPES).map((extension) => `.${extension}`),
].join(',');

/** `accept` value for a file input offering only the allowed image types. */
export const IMAGE_ATTACHMENT_INPUT_ACCEPT = Object.entries(ATTACHMENT_EXTENSION_MIME_TYPES)
  .filter(([, mimeType]) => mimeType.startsWith('image/'))
  .flatMap(([extension, mimeType]) => [mimeType, `.${extension}`])
  .filter((value, index, values) => values.indexOf(value) === index)
  .join(',');

/**
 * MIME type to upload a browser file as: its own type, or — when the browser
 * reports none (no OS mapping for the extension) — the type of an allowed
 * extension. Empty when neither is known; the policy then refuses it.
 */
export function resolveAttachmentMimeType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  return ATTACHMENT_EXTENSION_MIME_TYPES[extension] ?? '';
}

export interface AttachmentPolicyViolation {
  status: number;
  code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE_TYPE' | VoiceNotePolicyViolationCode;
  message: string;
}

/** Null when a file of this size and MIME type may be attached. */
export function checkAttachmentFile(file: { size: number; type: string }): AttachmentPolicyViolation | null {
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)} MB limit`,
    };
  }
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return { status: 415, code: 'UNSUPPORTED_FILE_TYPE', message: 'File type is not allowed' };
  }
  return null;
}

/** Display name stored with the attachment (bounded like the database check). */
export function normalizeAttachmentName(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed.length > 0 ? trimmed : 'file';
  return Array.from(safe).slice(0, MAX_ATTACHMENT_NAME_LENGTH).join('');
}

/** Storage path for a new upload; the extension is kept only when it is plain. */
export function buildAttachmentStoragePath(conversationId: string, uploadId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const suffix = /^[a-z0-9]{1,10}$/.test(extension) ? `.${extension}` : '';
  return `message-attachments/${conversationId}/${uploadId}${suffix}`;
}

/** True when the path is an object directly inside the conversation's attachment folder. */
export function isConversationAttachmentPath(storagePath: string, conversationId: string): boolean {
  const prefix = `message-attachments/${conversationId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const objectName = storagePath.slice(prefix.length);
  return objectName.length > 0 && !objectName.includes('/') && !objectName.includes('..');
}

/**
 * Message type of a message carrying these attachment MIME types. A voice
 * note (audio) makes a file message.
 */
export function attachmentMessageType(types: readonly string[]): MessageType {
  return types.length > 0 && types.every((type) => type.startsWith('image/'))
    ? MessageType.IMAGE
    : MessageType.FILE;
}

// --- Voice notes (Phase 4 T15: FR-018, BR-006, BR-008) ----------------------
//
// Audio is accepted ONLY as a voice note: an upload with kind=voice, a
// duration of at most two minutes, and waveform metadata. A voice note is the
// only attachment of its message. Database checks mirror these bounds
// (migration 20261005141134_voice_note_attachments).
//
// Container choice (SPEC open question): recordings are stored as WebM
// (Opus) or MP4 (AAC). WebM/Opus is the long-standing MediaRecorder path of
// the mandatory browsers (Chrome, Edge) and Firefox, and Safari 15+ plays it
// (best effort, FR-019); Safari records MP4/AAC, which every target browser
// plays. Recorders (T16) try VOICE_NOTE_RECORDER_MIME_TYPES in order with
// MediaRecorder.isTypeSupported. Ogg (Firefox's default when no type is
// given) is not accepted: Firefox records WebM when asked. Playback across
// browsers is verified by T18 (AC-022).
//
// What the server guarantees: the container type (the bytes start with a
// WebM EBML header or an MP4 `ftyp` box), the stored type audio/webm or
// audio/mp4, the storage extension .webm/.m4a, and a size bounded by the
// claimed duration (MAX_VOICE_NOTE_BYTES_PER_SECOND, at most ~4.9 MB at
// 120 s). Duration is a client claim, bounded (0 < d <= 120 s) and stored in
// whole seconds (ceil). The server does not decode the media, so it does not
// prove the content is audio-only or as long as claimed: a member could store
// a longer low-bitrate recording, a short video, or trailing bytes as a voice
// note (residual risk: readable only by that conversation's members, always
// served as audio/*, within the size bound).

/** Longest voice note (BR-008). */
export const MAX_VOICE_NOTE_DURATION_SECONDS = 120;

/** Waveform bounds: 1-256 amplitudes in [0, 1]. */
export const VOICE_NOTE_WAVEFORM_MAX_SAMPLES = 256;

/** 320 kbps: about 2.5x the browsers' default recording bitrate. */
export const MAX_VOICE_NOTE_BYTES_PER_SECOND = 40_000;

/** Headers, cues and padding allowed on top of the audio bitrate bound. */
const VOICE_NOTE_CONTAINER_ALLOWANCE_BYTES = 64 * 1024;

/** Longest accepted multipart `waveform` field (bounds JSON.parse). */
const MAX_VOICE_NOTE_WAVEFORM_FIELD_LENGTH = 16 * 1024;

/** Upload `kind` form value that marks a voice note. */
export const VOICE_NOTE_UPLOAD_KIND = 'voice';

/** Container type (no parameters) → extension of the stored object. */
const VOICE_NOTE_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

/** Container types (no parameters) a voice note is stored as. */
export const VOICE_NOTE_MIME_TYPES: readonly string[] = Object.keys(VOICE_NOTE_EXTENSIONS);

/**
 * Storage path of a voice note: the extension follows the verified container,
 * never the client's file name.
 */
export function buildVoiceNoteStoragePath(conversationId: string, uploadId: string, containerType: string): string {
  const extension = VOICE_NOTE_EXTENSIONS[containerType];
  if (!extension) {
    throw new Error(`Not a voice note container type: ${containerType}`);
  }
  return `message-attachments/${conversationId}/${uploadId}.${extension}`;
}

/** MediaRecorder mimeType candidates in order of preference (T16). */
export const VOICE_NOTE_RECORDER_MIME_TYPES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

/**
 * The private bucket's allowed_mime_types: regular attachment types plus the
 * voice-note containers (kept equal to the migration; a DB test compares).
 */
export const ATTACHMENT_BUCKET_MIME_TYPES: readonly string[] = [...ALLOWED_ATTACHMENT_MIME_TYPES, ...VOICE_NOTE_MIME_TYPES];

export type VoiceNotePolicyViolationCode =
  | 'INVALID_VOICE_NOTE_DURATION'
  | 'VOICE_NOTE_TOO_LONG'
  | 'INVALID_VOICE_NOTE_WAVEFORM'
  | 'VOICE_NOTE_TOO_LARGE';

export interface VoiceNoteMetadata {
  /** Whole seconds, 1-120. */
  duration: number;
  /** 1-256 amplitudes in [0, 1]. */
  waveformData: number[];
}

/** Lowercase MIME type without parameters ("audio/webm;codecs=opus" → "audio/webm"). */
export function mimeTypeEssence(type: string): string {
  return type.split(';', 1)[0].trim().toLowerCase();
}

export function isVoiceNoteMimeType(type: string): boolean {
  return VOICE_NOTE_MIME_TYPES.includes(mimeTypeEssence(type));
}

/** Largest voice note file accepted for this duration (whole seconds). */
export function maxVoiceNoteSizeBytes(durationSeconds: number): number {
  return Math.min(
    MAX_ATTACHMENT_SIZE_BYTES,
    Math.ceil(durationSeconds) * MAX_VOICE_NOTE_BYTES_PER_SECOND + VOICE_NOTE_CONTAINER_ALLOWANCE_BYTES
  );
}

function voiceNoteViolation(code: VoiceNotePolicyViolationCode, message: string): AttachmentPolicyViolation {
  return { status: code === 'VOICE_NOTE_TOO_LARGE' ? 413 : 400, code, message };
}

/**
 * Validates the claimed duration (decimal seconds, e.g. "42.7") and the
 * waveform (JSON array text) of a voice-note upload. Duration is stored as
 * whole seconds rounded up; amplitudes are rounded to 3 decimals.
 */
export function parseVoiceNoteMetadata(input: {
  duration: unknown;
  waveform: unknown;
}): { ok: true; value: VoiceNoteMetadata } | { ok: false; violation: AttachmentPolicyViolation } {
  const durationText = typeof input.duration === 'string' ? input.duration.trim() : '';
  const seconds = /^\d{1,6}(\.\d{1,6})?$/.test(durationText) ? Number(durationText) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {
      ok: false,
      violation: voiceNoteViolation('INVALID_VOICE_NOTE_DURATION', 'Voice note duration must be a positive number of seconds'),
    };
  }
  if (seconds > MAX_VOICE_NOTE_DURATION_SECONDS) {
    return {
      ok: false,
      violation: voiceNoteViolation(
        'VOICE_NOTE_TOO_LONG',
        `Voice notes can be at most ${MAX_VOICE_NOTE_DURATION_SECONDS / 60} minutes long`
      ),
    };
  }

  const invalidWaveform = {
    ok: false as const,
    violation: voiceNoteViolation(
      'INVALID_VOICE_NOTE_WAVEFORM',
      `Voice note waveform must be 1-${VOICE_NOTE_WAVEFORM_MAX_SAMPLES} numbers between 0 and 1`
    ),
  };
  if (typeof input.waveform !== 'string' || input.waveform.length > MAX_VOICE_NOTE_WAVEFORM_FIELD_LENGTH) {
    return invalidWaveform;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.waveform);
  } catch {
    return invalidWaveform;
  }
  const waveformData = toVoiceNoteWaveform(parsed);
  if (!waveformData) {
    return invalidWaveform;
  }
  return { ok: true, value: { duration: Math.ceil(seconds), waveformData } };
}

/** The waveform with amplitudes rounded to 3 decimals; null when it breaks the bounds. */
export function toVoiceNoteWaveform(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > VOICE_NOTE_WAVEFORM_MAX_SAMPLES) {
    return null;
  }
  const samples: number[] = [];
  for (const sample of value) {
    if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample > 1) {
      return null;
    }
    samples.push(Math.round(sample * 1000) / 1000);
  }
  return samples;
}

/**
 * Null when a voice note of this stored size, container type, and duration
 * (whole seconds) may be attached. Checked on arrival and again on the stored
 * object at link time.
 */
export function checkVoiceNoteFile(file: { size: number; type: string }, durationSeconds: number): AttachmentPolicyViolation | null {
  if (!VOICE_NOTE_MIME_TYPES.includes(file.type)) {
    return { status: 415, code: 'UNSUPPORTED_FILE_TYPE', message: 'Voice notes must be WebM or MP4 audio' };
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
    return voiceNoteViolation('INVALID_VOICE_NOTE_DURATION', 'Voice note duration must be a positive number of seconds');
  }
  if (durationSeconds > MAX_VOICE_NOTE_DURATION_SECONDS) {
    return voiceNoteViolation(
      'VOICE_NOTE_TOO_LONG',
      `Voice notes can be at most ${MAX_VOICE_NOTE_DURATION_SECONDS / 60} minutes long`
    );
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxVoiceNoteSizeBytes(durationSeconds)) {
    return voiceNoteViolation('VOICE_NOTE_TOO_LARGE', 'Voice note is larger than its duration allows');
  }
  return null;
}

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const WEBM_DOCTYPE = [0x77, 0x65, 0x62, 0x6d]; // "webm"
const MP4_FTYP = [0x66, 0x74, 0x79, 0x70]; // "ftyp"

function bytesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * True when the bytes start like the container type: a WebM EBML header
 * (doc type "webm" within the first 64 bytes) or an MP4 `ftyp` box.
 */
export function matchesVoiceNoteContainer(bytes: Uint8Array, containerType: string): boolean {
  if (containerType === 'audio/webm') {
    if (!bytesAt(bytes, 0, EBML_MAGIC)) return false;
    const limit = Math.min(bytes.length, 64) - WEBM_DOCTYPE.length;
    for (let offset = EBML_MAGIC.length; offset <= limit; offset += 1) {
      if (bytesAt(bytes, offset, WEBM_DOCTYPE)) return true;
    }
    return false;
  }
  if (containerType === 'audio/mp4') {
    return bytesAt(bytes, 4, MP4_FTYP);
  }
  return false;
}

/** True for an attachment that carries voice-note metadata (rendered by T18). */
export function isVoiceNoteAttachment(attachment: FileAttachment): attachment is VoiceNoteAttachment {
  return (
    isVoiceNoteMimeType(attachment.type) &&
    typeof (attachment as Partial<VoiceNoteAttachment>).duration === 'number'
  );
}
