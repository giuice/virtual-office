'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Download, FileSpreadsheet, FileText, ImageOff, Loader2, X } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button-variants';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { VoiceNotePlayer } from '@/components/messaging/VoiceNotePlayer';
import { attachmentDownloadUrl, attachmentPreviewKind, formatFileSize } from '@/lib/messaging/attachment-display';
import { isVoiceNoteAttachment } from '@/lib/messaging/attachment-policy';
import { cn } from '@/lib/utils';
import type { FileAttachment } from '@/types/messaging';

// Feed previews of a message's attachments (Phase 4 FR-011, AC-014, AC-037).
// Every read goes through the authorized route (`attachment.url`), which
// checks membership and redirects to a fresh short-lived signed URL; no
// signed URL is kept on the client, so an old feed can still open and
// download. Plain <img> on purpose: next/image's optimizer fetches the route
// without the user's session (400), and caching would outlive the signed URL.

interface MessageAttachmentsProps {
  attachments: readonly FileAttachment[];
  /** The message is still being sent: its files are not readable yet. */
  pending: boolean;
}

export function MessageAttachments({ attachments, pending }: MessageAttachmentsProps) {
  const images = attachments.filter((attachment) => attachmentPreviewKind(attachment) === 'image');
  const voiceNotes = attachments.filter(isVoiceNoteAttachment);
  const files = attachments.filter((attachment) => attachmentPreviewKind(attachment) === 'file');
  if (images.length === 0 && voiceNotes.length === 0 && files.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="message-attachments">
      {/* A voice note travels alone in its message (T15); one player each. */}
      {voiceNotes.map((attachment) => (
        <VoiceNotePlayer key={attachment.id} attachment={attachment} pending={pending} />
      ))}
      {images.length > 0 && (
        <ul aria-label="Imagens anexadas" className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((attachment) => (
            <li key={attachment.id} className="min-w-0">
              <ImageThumbnail attachment={attachment} pending={pending} single={images.length === 1} />
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul aria-label="Arquivos anexados" className="flex min-w-0 flex-col gap-1">
          {files.map((attachment) => (
            <li key={attachment.id} className="min-w-0">
              <FileCard attachment={attachment} pending={pending} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fixed box per thumbnail: the feed does not shift when images finish loading. */
const thumbnailFrame = (single: boolean) =>
  cn('block max-w-full overflow-hidden rounded-md bg-muted text-muted-foreground', single ? 'h-40 w-52' : 'size-24');

function ImageThumbnail({ attachment, pending, single }: { attachment: FileAttachment; pending: boolean; single: boolean }) {
  const [failed, setFailed] = useState(false);
  // Remounts the <img> on retry so the browser requests the route again.
  const [attempt, setAttempt] = useState(0);
  const thumbnailRef = useRef<HTMLButtonElement>(null);
  const { name } = attachment;

  // The retry button disappears on click; keep keyboard focus on the image.
  useEffect(() => {
    if (attempt > 0) thumbnailRef.current?.focus();
  }, [attempt]);

  if (pending) {
    return (
      <div className={cn(thumbnailFrame(single), 'flex items-center justify-center')} data-testid="attachment-image-pending">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Enviando {name}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className={cn(thumbnailFrame(single), 'flex flex-col items-center justify-center gap-1 p-2 text-center text-xs')}
        data-testid="attachment-image-failed"
        data-attachment-id={attachment.id}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        <span>Não foi possível carregar a imagem.</span>
        <button
          type="button"
          className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Tentar carregar ${name} de novo`}
          onClick={() => {
            setAttempt((value) => value + 1);
            setFailed(false);
          }}
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          ref={thumbnailRef}
          type="button"
          className={cn(
            thumbnailFrame(single),
            'cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
          aria-label={`Ampliar imagem ${name}`}
          data-testid="attachment-image-thumbnail"
          data-attachment-id={attachment.id}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route; see file comment */}
          <img
            key={attempt}
            src={attachment.url}
            alt={name}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        </button>
      </DialogTrigger>
      <AttachmentLightbox attachment={attachment} />
    </Dialog>
  );
}

/** Keeps dialog events out of the message item and feed behind the portal. */
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

function AttachmentLightbox({ attachment }: { attachment: FileAttachment }) {
  const { name } = attachment;
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border bg-background p-3 text-foreground shadow-lg"
        data-testid="attachment-lightbox"
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        onKeyDown={stopPropagation}
      >
        <div className="flex min-w-0 items-center gap-1">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium" title={name}>
            {name}
          </DialogTitle>
          <a
            href={attachmentDownloadUrl(attachment.url)}
            download={name}
            aria-label={`Baixar ${name}`}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <Download aria-hidden="true" />
          </a>
          <DialogPrimitive.Close
            aria-label="Fechar"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <X aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route; see file comment */}
          <img
            src={attachment.url}
            alt={name}
            className="max-h-[calc(100dvh-7rem)] max-w-full object-contain"
            data-testid="attachment-lightbox-image"
          />
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

const SPREADSHEET_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function FileCard({ attachment, pending }: { attachment: FileAttachment; pending: boolean }) {
  const { name } = attachment;
  const Icon = SPREADSHEET_TYPES.has(attachment.type) ? FileSpreadsheet : FileText;
  return (
    <div
      className="flex w-60 min-w-0 max-w-full items-center gap-2 rounded-md border bg-background/90 p-2 text-foreground"
      data-testid="attachment-file-card"
      data-attachment-id={attachment.id}
    >
      <Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={name} data-testid="attachment-file-name">
          {name}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="attachment-file-size">
          {formatFileSize(attachment.size)}
        </p>
      </div>
      {pending ? (
        <span className="flex size-9 shrink-0 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Enviando {name}</span>
        </span>
      ) : (
        <a
          href={attachmentDownloadUrl(attachment.url)}
          download={name}
          aria-label={`Baixar ${name}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0')}
        >
          <Download aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
