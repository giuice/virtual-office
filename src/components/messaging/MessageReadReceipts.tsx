'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { isToday } from 'date-fns';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { useMessageReaders } from '@/hooks/queries/useMessageReaders';
import type { AvatarUser } from '@/lib/avatar-utils';
import type { MessageReader } from '@/types/messaging';

const READER_FALLBACK_NAME = 'Usuário';

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Time only for reads today, date and time otherwise (pt-BR). */
function formatReadAt(readAt: Date): string {
  return isToday(readAt) ? timeFormatter.format(readAt) : dateTimeFormatter.format(readAt);
}

/** Portal content must never reach the message item's or drawer's handlers. */
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

function ReaderRow({ reader }: { reader: MessageReader }) {
  const name = reader.displayName?.trim() || READER_FALLBACK_NAME;
  // Stable identity: the avatar resets its loading state when `user` changes.
  const avatarUser = useMemo<AvatarUser>(
    () => ({ id: reader.userId, displayName: name, avatarUrl: reader.avatarUrl ?? undefined }),
    [reader.userId, name, reader.avatarUrl]
  );
  return (
    <li className="flex items-center gap-2 py-1.5" data-testid={`reader-item-${reader.userId}`}>
      <span className="shrink-0" data-testid="reader-avatar">
        <EnhancedAvatarV2 user={avatarUser} size="sm" display={{ loadingState: false }} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" data-testid="reader-name">
        {name}
      </span>
      <time
        className="shrink-0 text-xs text-muted-foreground"
        dateTime={reader.readAt.toISOString()}
        data-testid="reader-read-at"
      >
        {formatReadAt(reader.readAt)}
      </time>
    </li>
  );
}

interface MessageReadReceiptsProps {
  messageId: string;
  /** Distinct non-sender readers from the feed; the control renders only when > 0. */
  readCount: number;
}

/**
 * "Lida por N" on the viewer's own message (Phase 4 FR-001/FR-002). Opening it
 * (click, Enter, or Space) lists who read it with avatar, name, and read time,
 * most recent first. The list is fetched only while open and refreshed live by
 * the Realtime receipt handler.
 */
export function MessageReadReceipts({ messageId, readCount }: MessageReadReceiptsProps) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, refetch } = useMessageReaders(messageId, open);
  const label = `Lida por ${readCount}`;
  const readers = data?.readers ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${label}. Ver quem leu`}
          data-avatar-interactive
          data-testid={`read-by-${messageId}`}
          onClick={stopPropagation}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="w-64 max-w-[calc(100vw-2rem)] p-3"
        aria-label={`Leitores da mensagem: ${label}`}
        data-avatar-interactive
        data-testid={`readers-list-${messageId}`}
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        onKeyDown={stopPropagation}
      >
        <p className="mb-1 text-xs font-medium text-muted-foreground">Lida por {data?.readCount ?? readCount}</p>
        {isPending ? (
          <p className="py-2 text-sm text-muted-foreground" role="status">
            Carregando…
          </p>
        ) : isError ? (
          <div className="py-2 text-sm" role="alert">
            <p className="text-muted-foreground">Não foi possível carregar quem leu.</p>
            <button
              type="button"
              className="mt-1 text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto" aria-label="Quem leu">
            {readers.map((reader) => (
              <ReaderRow key={reader.userId} reader={reader} />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
