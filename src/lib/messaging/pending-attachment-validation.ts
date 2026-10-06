// src/lib/messaging/pending-attachment-validation.ts
// Composer-side checks of the attachment policy (Phase 4 FR-008): files that
// the server would refuse are rejected before any upload starts, with a
// message the user can act on. The server enforces the same policy.
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE_BYTES,
  checkAttachmentFile,
  resolveAttachmentMimeType,
} from '@/lib/messaging/attachment-policy';
import { AttachmentUploadError } from '@/lib/messaging/attachment-upload-client';

const MAX_SIZE_MB = MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024);
const ALLOWED_TYPES_TEXT = 'imagens JPEG, PNG, GIF ou WebP, PDF, TXT, DOC, DOCX, XLS ou XLSX';

export interface PendingFileSelection {
  /** Files to upload, typed with the MIME type the policy accepts. */
  accepted: File[];
  /** One message per refused file. */
  rejections: string[];
}

/**
 * Splits newly added files into those that may be uploaded and refusal
 * messages, given how many files the message already carries.
 */
export function selectPendingFiles(files: readonly File[], currentCount: number): PendingFileSelection {
  const accepted: File[] = [];
  const rejections: string[] = [];

  for (const file of files) {
    const type = resolveAttachmentMimeType(file);
    const violation = checkAttachmentFile({ size: file.size, type });
    if (violation?.code === 'FILE_TOO_LARGE') {
      rejections.push(`“${file.name}” tem mais de ${MAX_SIZE_MB} MB.`);
      continue;
    }
    if (violation) {
      rejections.push(`“${file.name}” não é um tipo permitido (${ALLOWED_TYPES_TEXT}).`);
      continue;
    }
    if (currentCount + accepted.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      rejections.push(
        `“${file.name}” não foi adicionado: uma mensagem leva no máximo ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos.`
      );
      continue;
    }
    accepted.push(type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified }));
  }

  return { accepted, rejections };
}

/** Message shown on a pending file (or voice note) whose upload failed. */
export function describeUploadFailure(error: unknown, { voice = false }: { voice?: boolean } = {}): string {
  if (voice) return describeVoiceNoteUploadFailure(error);
  if (error instanceof AttachmentUploadError) {
    if (error.status === 413) return `Arquivo maior que ${MAX_SIZE_MB} MB.`;
    if (error.status === 415) return 'Tipo de arquivo não permitido.';
    if (error.status === 429) return 'Muitos envios seguidos. Aguarde e tente de novo.';
    if (error.status === 403) return 'Você não pode enviar arquivos nesta conversa.';
  }
  return 'Falha no envio do arquivo.';
}

/** Voice notes (T16) fail for their own reasons (T15 contract codes). */
function describeVoiceNoteUploadFailure(error: unknown): string {
  if (error instanceof AttachmentUploadError) {
    if (error.code === 'VOICE_NOTE_TOO_LONG') return 'A nota de voz passa de 2 minutos. Grave de novo.';
    if (error.code === 'VOICE_NOTE_TOO_LARGE' || error.status === 413) {
      return 'A nota de voz ficou grande demais. Grave de novo.';
    }
    if (error.status === 400 || error.status === 415) return 'Gravação inválida. Grave de novo.';
    if (error.status === 429) return 'Muitos envios seguidos. Aguarde e tente de novo.';
    if (error.status === 403) return 'Você não pode enviar notas de voz nesta conversa.';
  }
  return 'Falha no envio da nota de voz.';
}
