'use client';

import { AlertCircle, FileText, Image as ImageIcon, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PendingAttachment } from '@/hooks/ui/use-composer-attachments';
import { formatFileSize } from '@/lib/messaging/attachment-display';
import { cn } from '@/lib/utils';

function summarize(items: readonly PendingAttachment[]): string {
  const uploaded = items.filter((item) => item.status === 'uploaded').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  if (failed > 0) return `${failed === 1 ? '1 arquivo falhou' : `${failed} arquivos falharam`}: tente de novo ou remova.`;
  if (uploaded < items.length) return `Enviando arquivos: ${uploaded} de ${items.length} prontos.`;
  return items.length === 1 ? '1 arquivo pronto.' : `${items.length} arquivos prontos.`;
}

interface ComposerPendingFilesProps {
  items: readonly PendingAttachment[];
  /** Rows can not be removed while a send that carries them is in flight. */
  locked: boolean;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/** Files of the message being composed, with progress, error, retry, and remove (FR-009). */
export function ComposerPendingFiles({ items, locked, onRemove, onRetry }: ComposerPendingFilesProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-2" data-testid="composer-pending-files">
      <p role="status" className="mb-1 text-xs text-muted-foreground" data-testid="composer-pending-files-summary">
        {summarize(items)}
      </p>
      <ul className="max-h-32 space-y-1 overflow-y-auto" aria-label="Arquivos anexados">
        {items.map((item) => {
          const name = item.file.name;
          const isImage = item.file.type.startsWith('image/');
          const FileIcon = isImage ? ImageIcon : FileText;
          return (
            <li
              key={item.localId}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs',
                item.status === 'failed' ? 'border-destructive/50 bg-destructive/5' : 'bg-secondary/40'
              )}
              data-testid="pending-file"
              data-file-name={name}
              data-upload-status={item.status}
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate font-medium" title={name}>
                    {name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatFileSize(item.file.size)}</span>
                </div>
                {item.status === 'uploading' && (
                  <div
                    role="progressbar"
                    aria-label={`Enviando ${name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                    className="mt-1 h-1 w-full overflow-hidden rounded bg-muted"
                    data-testid="pending-file-progress"
                  >
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === 'failed' && (
                  <p role="alert" className="flex items-center gap-1 text-destructive" data-testid="pending-file-error">
                    <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.error}</span>
                  </p>
                )}
              </div>
              {item.status === 'failed' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => onRetry(item.localId)}
                  aria-label={`Tentar enviar ${name} de novo`}
                  title="Tentar de novo"
                  data-testid="pending-file-retry"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => onRemove(item.localId)}
                disabled={locked && item.status === 'uploaded'}
                aria-label={item.status === 'uploading' ? `Cancelar envio de ${name}` : `Remover ${name}`}
                title={item.status === 'uploading' ? 'Cancelar envio' : 'Remover'}
                data-testid="pending-file-remove"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ComposerFileRejectionsProps {
  rejections: readonly string[];
  onDismiss: () => void;
}

/** Files refused before upload (count, size, type), announced to screen readers. */
export function ComposerFileRejections({ rejections, onDismiss }: ComposerFileRejectionsProps) {
  if (rejections.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-2 flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
      data-testid="composer-file-rejections"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <ul className="min-w-0 flex-1 space-y-0.5 break-words">
        {rejections.map((rejection, index) => (
          <li key={index}>{rejection}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={onDismiss}
        aria-label="Fechar aviso de arquivos recusados"
        data-testid="composer-file-rejections-dismiss"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
