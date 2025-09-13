// src/hooks/realtime/useMessageSubscription.ts
"use client";

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Message } from '@/types/messaging';

interface UseMessageSubscriptionOptions {
  isActive?: boolean;
}

/**
 * Subscribes to realtime changes for a conversation's messages and mirrors them into
 * the React Query cache used by `useMessages` (keyset pagination by timestamp).
 *
 * Contract expectations for cache shape:
 * queryKey: ['messages', conversationId]
 * data: { pages: Array<{ messages: Message[]; hasMoreOlder?: boolean; nextCursorBefore?: string }>, pageParams: any[] }
 */
export function useMessageSubscription(conversationId: string | null, options?: UseMessageSubscriptionOptions) {
  const isActive = options?.isActive ?? true;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);

  // Memoize the channel name to avoid unnecessary resubscribes
  const channelName = useMemo(() => (conversationId ? `messages:${conversationId}` : null), [conversationId]);

  useEffect(() => {
    if (!conversationId || !isActive || !channelName) {
      setStatus(null);
      return;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const evt = payload.eventType;

          if (evt === 'INSERT') {
            const row: any = payload.new;
            // Map to Message; ensure timestamp is Date
            const message: Message = {
              id: row.id,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              content: row.content,
              timestamp: new Date(row.timestamp),
              type: row.type,
              status: row.status,
              replyToId: row.reply_to_id || undefined,
              attachments: row.attachments || [],
              reactions: row.reactions || [],
              isEdited: !!row.is_edited,
            };

            // Write into last page if not present (dedupe by id)
            queryClient.setQueryData(
              ['messages', conversationId],
              (
                oldData:
                  | { pages: Array<{ messages: Message[]; hasMoreOlder?: boolean; nextCursorBefore?: string }>; pageParams: any[] }
                  | undefined
              ) => {
                if (!oldData || !oldData.pages || oldData.pages.length === 0) {
                  return { pages: [{ messages: [message] }], pageParams: [undefined] } as any;
                }
                // Skip if already present
                const exists = oldData.pages.some((p) => p.messages.some((m) => m.id === message.id));
                if (exists) return oldData;

                const pages = [...oldData.pages];
                const idx = pages.length - 1;
                pages[idx] = { ...pages[idx], messages: [...pages[idx].messages, message] };
                return { ...oldData, pages };
              }
            );
          } else if (evt === 'UPDATE') {
            const row: any = payload.new;
            queryClient.setQueryData(
              ['messages', conversationId],
              (
                oldData:
                  | { pages: Array<{ messages: Message[]; hasMoreOlder?: boolean; nextCursorBefore?: string }>; pageParams: any[] }
                  | undefined
              ) => {
                if (!oldData || !oldData.pages) return oldData;
                const pages = oldData.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((m) =>
                    m.id === row.id
                      ? {
                          ...m,
                          content: row.content ?? m.content,
                          status: row.status ?? m.status,
                          isEdited: row.is_edited ?? m.isEdited,
                          reactions: row.reactions ?? m.reactions,
                        }
                      : m
                  ),
                }));
                return { ...oldData, pages };
              }
            );
          } else if (evt === 'DELETE') {
            const row: any = payload.old;
            queryClient.setQueryData(
              ['messages', conversationId],
              (
                oldData:
                  | { pages: Array<{ messages: Message[]; hasMoreOlder?: boolean; nextCursorBefore?: string }>; pageParams: any[] }
                  | undefined
              ) => {
                if (!oldData || !oldData.pages) return oldData;
                const pages = oldData.pages.map((page) => ({
                  ...page,
                  messages: page.messages.filter((m) => m.id !== row.id),
                }));
                return { ...oldData, pages };
              }
            );
          }
        }
      )
      .subscribe((s) => setStatus(s));

    return () => {
      channel.unsubscribe();
      setStatus(null);
    };
  }, [conversationId, isActive, channelName, queryClient]);

  return { status };
}
