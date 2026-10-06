import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { MessageStatus, type Message } from '@/types/messaging';
import { FEED_MESSAGE_ID_ATTRIBUTE } from './use-feed-scroll-anchor';

/** The server accepts at most this many ids per receipt request. */
const MAX_IDS_PER_REQUEST = 100;
/** Messages that become visible within this window go out in one request. */
const BATCH_DELAY_MS = 300;
/** Minimum spacing between requests, so scrolling stays far below the 120/min limit. */
const MIN_REQUEST_INTERVAL_MS = 1_000;
/** Back-off before re-sending a batch that failed (network, 429, 5xx). */
const RETRY_DELAY_MS = 5_000;
/** Share of a message (or of the feed viewport, for tall messages) that must be on screen. */
const SEEN_RATIO = 0.5;
const INTERSECTION_THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const MESSAGE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UseVisibleMessageReceiptsOptions {
  conversationId: string | null;
  /** The feed's scrolling element; the visibility root. */
  viewport: HTMLElement | null;
  /** True only while the drawer shows this conversation (open, not minimized, conversation view). */
  enabled: boolean;
  messages: ReadonlyArray<Message>;
  currentUserId: string | null;
  /**
   * In a direct conversation a message's READ status can only come from the
   * viewer's own receipt, so those messages need no new receipt.
   */
  isDirectConversation: boolean;
  submit: (conversationId: string, messageIds: readonly string[]) => Promise<void>;
}

function isSeen(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= SEEN_RATIO) return true;
  // A message taller than the viewport can never be half visible; it counts
  // once it fills at least half of the viewport.
  const rootHeight = entry.rootBounds?.height ?? 0;
  return rootHeight > 0 && entry.intersectionRect.height >= rootHeight * SEEN_RATIO;
}

/**
 * Reports read receipts only for messages the viewer actually sees (SPEC
 * BR-001): a message from someone else counts once it is at least half
 * visible inside the feed viewport while the feed is enabled and the tab is
 * visible. Messages that were on screen while the tab was hidden are reported
 * when the tab becomes visible again, if they are still on screen.
 *
 * Ids are batched (≤100 per request), spaced out, never re-sent once accepted
 * in this conversation, and retried after a failure.
 */
export function useVisibleMessageReceipts({
  conversationId,
  viewport,
  enabled,
  messages,
  currentUserId,
  isDirectConversation,
  submit,
}: UseVisibleMessageReceiptsOptions): void {
  // Ids sent (or in flight) per conversation; survives feed re-renders and
  // viewport re-attachment so nothing is reported twice.
  const submittedByConversationRef = useRef(new Map<string, Set<string>>());
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  );

  const needsReceipt = useEffectEvent((messageId: string, submitted: ReadonlySet<string>) => {
    if (submitted.has(messageId) || !MESSAGE_UUID_PATTERN.test(messageId)) return false;
    const message = messagesById.get(messageId);
    if (!message || !currentUserId || message.senderId === currentUserId) return false;
    return !(isDirectConversation && message.status === MessageStatus.READ);
  });

  const sendReceipts = useEffectEvent((targetConversationId: string, messageIds: readonly string[]) =>
    submit(targetConversationId, messageIds)
  );

  useEffect(() => {
    if (!enabled || !viewport || !conversationId) return;

    const submittedMap = submittedByConversationRef.current;
    const submitted = submittedMap.get(conversationId) ?? new Set<string>();
    submittedMap.set(conversationId, submitted);

    const onScreen = new Set<string>();
    const pending = new Set<string>();
    const observedIds = new Map<Element, string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let lastRequestAt = 0;
    let disposed = false;

    const isTabVisible = () => document.visibilityState === 'visible';

    const send = (batch: string[]) => {
      batch.forEach((id) => {
        pending.delete(id);
        submitted.add(id);
      });
      return sendReceipts(conversationId, batch).then(
        () => true,
        () => {
          // Allow a later retry; only re-queue while this feed is still live.
          batch.forEach((id) => {
            submitted.delete(id);
            if (!disposed) pending.add(id);
          });
          return false;
        }
      );
    };

    const schedule = (delay: number) => {
      if (timer !== null || inFlight || pending.size === 0) return;
      const wait = Math.max(delay, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
      timer = setTimeout(flush, wait);
    };

    const flush = () => {
      timer = null;
      if (inFlight || pending.size === 0) return;
      inFlight = true;
      lastRequestAt = Date.now();
      void send([...pending].slice(0, MAX_IDS_PER_REQUEST)).then((ok) => {
        inFlight = false;
        if (!disposed) schedule(ok ? 0 : RETRY_DELAY_MS);
      });
    };

    const enqueue = (messageId: string) => {
      if (pending.has(messageId) || !needsReceipt(messageId, submitted)) return;
      pending.add(messageId);
      schedule(BATCH_DELAY_MS);
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const messageId = observedIds.get(entry.target);
          if (!messageId) continue;
          if (isSeen(entry)) {
            onScreen.add(messageId);
            if (isTabVisible()) enqueue(messageId);
          } else {
            onScreen.delete(messageId);
          }
        }
      },
      { root: viewport, threshold: INTERSECTION_THRESHOLDS }
    );

    // Observe each message's own item (the wrapper's first child), so an
    // expanded thread below a message does not dilute its visible share.
    const syncObservedMessages = () => {
      for (const [element, messageId] of observedIds) {
        if (!element.isConnected) {
          intersectionObserver.unobserve(element);
          observedIds.delete(element);
          onScreen.delete(messageId);
        }
      }
      viewport.querySelectorAll<HTMLElement>(`[${FEED_MESSAGE_ID_ATTRIBUTE}]`).forEach((wrapper) => {
        const messageId = wrapper.getAttribute(FEED_MESSAGE_ID_ATTRIBUTE);
        const item = wrapper.firstElementChild;
        if (!messageId || !item || observedIds.has(item)) return;
        observedIds.set(item, messageId);
        intersectionObserver.observe(item);
      });
    };

    const mutationObserver = new MutationObserver(syncObservedMessages);
    mutationObserver.observe(viewport, { childList: true, subtree: true });
    syncObservedMessages();

    const handleVisibilityChange = () => {
      if (isTabVisible()) onScreen.forEach(enqueue);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      if (timer !== null) clearTimeout(timer);
      // Messages already seen but still waiting for their batch are reported
      // now (e.g. the reader went back to the list right after seeing them).
      const remaining = [...pending];
      for (let start = 0; start < remaining.length; start += MAX_IDS_PER_REQUEST) {
        void send(remaining.slice(start, start + MAX_IDS_PER_REQUEST));
      }
    };
  }, [enabled, viewport, conversationId]);
}
