// src/lib/meeting-notes/transcript-upload.ts
// Phase 6 T10 (FR-012, FR-013, AC-011): reads a multipart/form-data transcript
// upload with a bounded body and validates the file BEFORE any database write:
// extension .txt/.vtt/.srt (case-insensitive), non-empty, at most 1 MB,
// UTF-8 text (fatal decoding; known binary signatures, NUL bytes, and other
// control characters are refused). The text is returned as uploaded, minus a
// UTF-8 BOM and with nothing else changed (FR-005: viewers see what was
// uploaded); src/lib/meeting-notes/ai/transcript-normalizer.ts prepares it
// for a provider. No transcript text is ever logged or echoed in errors.
import 'server-only';

import type { NextResponse } from 'next/server';
import { readBoundedBody } from '@/lib/messaging/metrics-log';
import { meetingNoteError } from './route-support';
import { codePointLength, MEETING_NOTE_LIMITS, MEETING_NOTE_TRANSCRIPT_LIMITS } from './validation';

type Result<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export interface TranscriptUpload {
  /** The uploaded file's name (base name only). */
  fileName: string;
  /** The decoded text (UTF-8 BOM removed; otherwise exactly as uploaded). */
  text: string;
  /** The single-valued text fields sent next to the file. */
  fields: Map<string, string>;
}

/** Room for the multipart framing, the file name, and the small text fields. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = MEETING_NOTE_TRANSCRIPT_LIMITS.maxBytes + MULTIPART_OVERHEAD_BYTES;
const MAX_FIELD_CHARS = 256;

/**
 * Leading bytes of common binary formats someone could rename to .txt. Most
 * binaries also fail the NUL / UTF-8 / control-character checks below; the
 * signatures catch the ones that can start with plain ASCII (PDF, RTF) and
 * make the refusal independent of the rest of the file. Purely textual
 * prefixes that a real transcript could start with (e.g. "RIFF") are not
 * listed.
 */
const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  [0x7b, 0x5c, 0x72, 0x74, 0x66], // RTF ("{\rtf")
  [0x50, 0x4b, 0x03, 0x04], // ZIP (.docx, .xlsx, .odt, ...)
  [0x50, 0x4b, 0x05, 0x06], // empty ZIP
  [0xd0, 0xcf, 0x11, 0xe0], // OLE compound file (.doc, .xls)
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x1f, 0x8b], // gzip
  [0x37, 0x7a, 0xbc, 0xaf], // 7z
  [0x1a, 0x45, 0xdf, 0xa3], // Matroska / WebM
];

// C0 controls other than tab, line feed, form feed, and carriage return, and
// DEL: never part of a text transcript, typical of binary data.
const BINARY_CONTROL = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/;
const NAME_CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

function hasBinarySignature(bytes: Uint8Array): boolean {
  return BINARY_SIGNATURES.some(
    (signature) => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  );
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
}

function baseNameOf(fileName: string): string {
  return fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
}

/**
 * The note title for "New note from transcript" (FR-012): the file name
 * without its extension, control characters replaced by spaces, trimmed, and
 * cut to 200 code points; "Transcript" when nothing usable remains.
 */
export function transcriptTitleFromFileName(fileName: string): string {
  const base = baseNameOf(fileName);
  const dot = base.lastIndexOf('.');
  const stem = (dot < 0 ? base : base.slice(0, dot)).replace(NAME_CONTROL, ' ').trim();
  const title = Array.from(stem).slice(0, MEETING_NOTE_LIMITS.titleMaxChars).join('').trim();
  return title && title.isWellFormed() && codePointLength(title) <= MEETING_NOTE_LIMITS.titleMaxChars
    ? title
    : MEETING_NOTE_TRANSCRIPT_LIMITS.fallbackTitle;
}

function reject(
  status: number,
  code: string,
  ctx: { correlationId: string }
): { ok: false; response: NextResponse } {
  return { ok: false, response: meetingNoteError(status, code, ctx) };
}

/** Validates the file's bytes and decodes them (FR-013). */
function decodeTranscript(bytes: Uint8Array, ctx: { correlationId: string }): Result<string> {
  if (bytes.byteLength === 0) return reject(400, 'MEETING_NOTE_TRANSCRIPT_EMPTY', ctx);
  if (bytes.byteLength > MEETING_NOTE_TRANSCRIPT_LIMITS.maxBytes) {
    return reject(413, 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE', ctx);
  }
  if (hasBinarySignature(bytes) || bytes.includes(0)) {
    return reject(400, 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT', ctx);
  }
  let text: string;
  try {
    // ignoreBOM: false (default) drops a leading UTF-8 BOM.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return reject(400, 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT', ctx);
  }
  if (BINARY_CONTROL.test(text)) return reject(400, 'MEETING_NOTE_TRANSCRIPT_NOT_TEXT', ctx);
  if (text.trim() === '') return reject(400, 'MEETING_NOTE_TRANSCRIPT_EMPTY', ctx);
  return { ok: true, value: text };
}

/**
 * Reads a multipart/form-data body holding exactly one `file` part and the
 * text fields named in `fieldNames` (each at most once), with the whole body
 * bounded (Content-Length checked first, then the stream counted). Every
 * refusal is a 4xx response with a stable code; nothing has been written.
 */
export async function readTranscriptUpload(
  request: Request,
  fieldNames: readonly string[],
  ctx: { correlationId: string }
): Promise<Result<TranscriptUpload>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') {
    await request.body?.cancel().catch(() => undefined);
    return reject(415, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
  }

  const body = await readBoundedBody(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    return body.reason === 'too_large'
      ? reject(413, 'MEETING_NOTE_TRANSCRIPT_TOO_LARGE', ctx)
      : reject(400, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
  }

  let form: FormData;
  try {
    form = await new Response(new Blob([new Uint8Array(body.bytes)]), { headers: { 'content-type': contentType } }).formData();
  } catch {
    return reject(400, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
  }

  const allowed = new Set(['file', ...fieldNames]);
  const fields = new Map<string, string>();
  for (const name of new Set(form.keys())) {
    const values = form.getAll(name);
    if (!allowed.has(name) || values.length !== 1) {
      return reject(400, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
    }
    const [value] = values;
    if (name === 'file') continue;
    if (typeof value !== 'string' || value.length > MAX_FIELD_CHARS) {
      return reject(400, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
    }
    fields.set(name, value);
  }

  const file = form.get('file');
  if (file === null || typeof file === 'string') {
    return reject(400, 'MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID', ctx);
  }

  const fileName = baseNameOf(file.name ?? '');
  if (!(MEETING_NOTE_TRANSCRIPT_LIMITS.extensions as readonly string[]).includes(extensionOf(fileName))) {
    return reject(400, 'MEETING_NOTE_TRANSCRIPT_INVALID_TYPE', ctx);
  }

  const text = decodeTranscript(new Uint8Array(await file.arrayBuffer()), ctx);
  if (!text.ok) return text;
  return { ok: true, value: { fileName, text: text.value, fields } };
}
