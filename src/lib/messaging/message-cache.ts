// src/lib/messaging/message-cache.ts
// Shared cache-merge helper for the ['messages', conversationId] infinite
// query (audit B-04). Page 0 holds the NEWEST window (pages go newer ->
// older), so incoming messages must land in page 0 — appending to the last
// page renders them in the middle of history once older pages are loaded.
import { Message } from '@/types/messaging';

export interface MessagesPage {
  messages: Message[];
  hasMoreOlder?: boolean;
  nextCursorBefore?: string;
}

export interface MessagesInfiniteData {
  pages: MessagesPage[];
  pageParams: unknown[];
}

const OPTIMISTIC_ID_PREFIX = 'temp-';

const getTimeMs = (value: Date | string): number => {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
};

export const isOptimisticMatch = (existing: Message, incoming: Message): boolean => {
  if (!existing.id.startsWith(OPTIMISTIC_ID_PREFIX)) {
    return false;
  }
  if (existing.senderId !== incoming.senderId) {
    return false;
  }
  if (existing.content !== incoming.content) {
    return false;
  }

  const existingTime = getTimeMs(existing.timestamp);
  const incomingTime = getTimeMs(incoming.timestamp);

  return (
    Number.isFinite(existingTime) &&
    Number.isFinite(incomingTime) &&
    Math.abs(existingTime - incomingTime) <= 1000
  );
};

const replaceAt = (
  oldData: MessagesInfiniteData,
  pageIndex: number,
  messageIndex: number,
  message: Message
): MessagesInfiniteData => {
  const pages = [...oldData.pages];
  const messages = [...pages[pageIndex].messages];
  messages[messageIndex] = message;
  pages[pageIndex] = { ...pages[pageIndex], messages };
  return { ...oldData, pages };
};

/**
 * Merges an incoming message into the infinite-query cache:
 * - id already present in ANY page → no-op (realtime echo / duplicate event);
 * - a matching optimistic `temp-` message → replaced in place (attachments
 *   from the optimistic copy survive, because realtime rows never carry them);
 * - otherwise → appended to page 0, the newest window.
 */
export function appendMessageToPages(
  oldData: MessagesInfiniteData | undefined,
  message: Message
): MessagesInfiniteData {
  if (!oldData || !oldData.pages || oldData.pages.length === 0) {
    return { pages: [{ messages: [message] }], pageParams: [undefined] };
  }

  for (const page of oldData.pages) {
    if (page.messages.some((existing) => existing.id === message.id)) {
      return oldData;
    }
  }

  // An optimistic incoming message (the send path) must never swallow another
  // pending temp- message with identical content sent moments before.
  if (!message.id.startsWith(OPTIMISTIC_ID_PREFIX)) {
    for (let pageIndex = 0; pageIndex < oldData.pages.length; pageIndex++) {
      const messageIndex = oldData.pages[pageIndex].messages.findIndex((existing) =>
        isOptimisticMatch(existing, message)
      );
      if (messageIndex >= 0) {
        const optimistic = oldData.pages[pageIndex].messages[messageIndex];
        const merged: Message = {
          ...message,
          attachments: message.attachments?.length ? message.attachments : optimistic.attachments,
        };
        return replaceAt(oldData, pageIndex, messageIndex, merged);
      }
    }
  }

  const pages = [...oldData.pages];
  pages[0] = { ...pages[0], messages: [...pages[0].messages, message] };
  return { ...oldData, pages };
}

/** Replaces a message by id across all pages (optimistic → saved swap). */
export function replaceMessageInPages(
  oldData: MessagesInfiniteData | undefined,
  previousId: string,
  message: Message
): MessagesInfiniteData | undefined {
  if (!oldData || !oldData.pages) {
    return oldData;
  }

  // If the saved id already landed via realtime, drop the optimistic copy
  // instead of swapping it in twice.
  const savedAlreadyPresent = oldData.pages.some((page) =>
    page.messages.some((existing) => existing.id === message.id)
  );
  if (savedAlreadyPresent) {
    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((existing) => existing.id !== previousId),
      })),
    };
  }

  for (let pageIndex = 0; pageIndex < oldData.pages.length; pageIndex++) {
    const messageIndex = oldData.pages[pageIndex].messages.findIndex(
      (existing) => existing.id === previousId
    );
    if (messageIndex >= 0) {
      return replaceAt(oldData, pageIndex, messageIndex, message);
    }
  }

  return oldData;
}
