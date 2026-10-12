// src/hooks/useMessageOutbox.ts
// Phase 5 T8: runs the signed-in user's durable message outbox (one per
// application user, users.id) for as long as the messaging provider is
// mounted, and returns the function that queues a text/reply send — plus
// (T27) "Tentar de novo" and "Apagar" for a failed or expired item, and
// (T10) "Cancelar" for a never-dispatched waiting item, and (T12) the count
// and deletion behind the "Sair" confirmation. T11: the outbox sends
// and applies responses only while the browser's authenticated user is its
// owner (users.id `ownerId`, whose auth identity is `ownerAuthUid`, that
// user's users.supabase_uid).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { MessageOutbox } from '@/lib/messaging/outbox/message-outbox';
import { createOutboxIdentity } from '@/lib/messaging/outbox/outbox-identity';
import {
  beginOutboxSignOut,
  countUnsentOutboxItems,
  type OutboxSignOut,
} from '@/lib/messaging/outbox/outbox-sign-out';
import type { OutboxEnqueueInput } from '@/types/message-outbox';

export type QueueTextMessage = (input: OutboxEnqueueInput) => Promise<void>;

export interface MessageOutboxActions {
  queueTextMessage: QueueTextMessage;
  /** "Tentar de novo" on a failed or expired item (by its clientMessageId). */
  retryOutboxMessage: (clientMessageId: string) => Promise<void>;
  /** "Apagar": removes a failed or expired item from this browser only. */
  discardOutboxMessage: (clientMessageId: string) => Promise<void>;
  /** "Cancelar" (T10): removes a never-dispatched waiting item in every tab, unless a claim won. */
  cancelOutboxMessage: (clientMessageId: string) => Promise<void>;
  /**
   * T12: the signed-in user's unsent items in this browser (0 when there is no
   * outbox user, or the browser is not signed in as that user — F2).
   */
  countUnsentOutboxMessages: () => Promise<number>;
  /**
   * T12 "Sair mesmo": stops every drain of the user in every tab now; then
   * `discard()` deletes the user's outbox and `release()` ends the stop once
   * the sign-out finished. Null when there is no outbox user.
   */
  beginOutboxSignOut: () => OutboxSignOut | null;
  /**
   * T13 (FR-002): the messages Realtime stream recovered; every conversation
   * drains again (owner check and sign-out stop still apply). No-op without an outbox.
   */
  resumeOutboxDrains: () => void;
  /**
   * Block B fix F3: this tab's Realtime socket is down — a connectivity loss
   * whose recovery (resumeOutboxDrains) advances the owner's shared recovery
   * epoch. No-op without an outbox.
   */
  noteOutboxConnectivityLost: () => void;
}

export function useMessageOutbox(
  ownerId: string | null | undefined,
  ownerAuthUid: string | null | undefined
): MessageOutboxActions {
  const queryClient = useQueryClient();
  const outboxRef = useRef<MessageOutbox | null>(null);

  // The browser's authenticated user compared with the owner (T11); also gates
  // the sign-out count and deletion (block A fix F2).
  const identity = useMemo(() => (ownerAuthUid ? createOutboxIdentity(ownerAuthUid) : null), [ownerAuthUid]);

  useEffect(() => {
    if (!ownerId || !identity) return;
    const outbox = new MessageOutbox(ownerId, queryClient, identity);
    outboxRef.current = outbox;
    outbox.start();
    return () => {
      outbox.dispose();
      if (outboxRef.current === outbox) outboxRef.current = null;
    };
  }, [ownerId, identity, queryClient]);

  const currentOutbox = useCallback((): MessageOutbox => {
    const outbox = outboxRef.current;
    if (!outbox || outbox.ownerId !== ownerId) {
      throw new Error('The message outbox is not ready');
    }
    return outbox;
  }, [ownerId]);

  const queueTextMessage = useCallback(
    async (input: OutboxEnqueueInput) => {
      await currentOutbox().enqueue(input);
    },
    [currentOutbox]
  );
  const retryOutboxMessage = useCallback(
    async (clientMessageId: string) => {
      await currentOutbox().retry(clientMessageId);
    },
    [currentOutbox]
  );
  const discardOutboxMessage = useCallback(
    async (clientMessageId: string) => {
      await currentOutbox().discard(clientMessageId);
    },
    [currentOutbox]
  );
  const cancelOutboxMessage = useCallback(
    async (clientMessageId: string) => {
      await currentOutbox().cancel(clientMessageId);
    },
    [currentOutbox]
  );

  // T12: read from and act on the outbox database by owner (users.id), so they
  // work whether or not this tab's instance has started — only while the
  // browser is signed in as the owner (F2: a stale tab's other user gets 0
  // and deletes nothing).
  const isOwner = useCallback(
    async () => (identity ? (await identity.check()) === 'owner' : false),
    [identity]
  );
  const countUnsentOutboxMessages = useCallback(
    async () => (ownerId ? countUnsentOutboxItems(ownerId, isOwner) : 0),
    [ownerId, isOwner]
  );
  const resumeOutboxDrains = useCallback(() => {
    const outbox = outboxRef.current;
    if (outbox && outbox.ownerId === ownerId) outbox.resumeDrains();
  }, [ownerId]);
  const noteOutboxConnectivityLost = useCallback(() => {
    const outbox = outboxRef.current;
    if (outbox && outbox.ownerId === ownerId) outbox.noteConnectivityLost('realtime');
  }, [ownerId]);
  const beginSignOut = useCallback(
    () => (ownerId ? beginOutboxSignOut(ownerId, queryClient, isOwner) : null),
    [ownerId, queryClient, isOwner]
  );

  return useMemo(
    () => ({
      queueTextMessage,
      retryOutboxMessage,
      discardOutboxMessage,
      cancelOutboxMessage,
      countUnsentOutboxMessages,
      beginOutboxSignOut: beginSignOut,
      resumeOutboxDrains,
      noteOutboxConnectivityLost,
    }),
    [
      queueTextMessage,
      retryOutboxMessage,
      discardOutboxMessage,
      cancelOutboxMessage,
      countUnsentOutboxMessages,
      beginSignOut,
      resumeOutboxDrains,
      noteOutboxConnectivityLost,
    ]
  );
}
