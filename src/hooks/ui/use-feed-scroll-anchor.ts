import { useCallback, useLayoutEffect, useRef } from 'react';

/** Attribute every rendered message wrapper carries so the feed can find it. */
export const FEED_MESSAGE_ID_ATTRIBUTE = 'data-message-id';

/** Distance from the bottom (px) within which the reader counts as "at the bottom". */
const PINNED_THRESHOLD_PX = 32;

interface ScrollAnchor {
  messageId: string;
  /** Distance from the viewport's top edge to the message's top edge, in px. */
  offset: number;
}

interface RenderedWindow {
  conversationId: string;
  firstMessageId: string | null;
  lastMessageId: string | null;
}

interface UseFeedScrollAnchorOptions {
  conversationId: string | null;
  /** Rendered messages, oldest first. A new array means the feed content changed. */
  messages: ReadonlyArray<{ id: string }>;
  /** False while the scroll viewport is replaced by a skeleton, error, or empty state. */
  isFeedRendered: boolean;
}

interface FeedScrollAnchor {
  /** Callback ref for the feed's scrolling element. */
  viewportRef: (node: HTMLDivElement | null) => (() => void) | undefined;
  /** Call right before the reader sends: the resulting newest message scrolls into view. */
  markOwnSend: () => void;
  /**
   * Centers a rendered message in the viewport and makes it the new reading
   * position, so later data changes keep it in place. Returns its wrapper, or
   * null when it is not rendered.
   */
  scrollMessageIntoView: (messageId: string) => HTMLElement | null;
  /**
   * Records the reading position from the DOM as it is right before React
   * applies a feed change (see FeedScrollSnapshot). The viewport's `scroll`
   * event is dispatched only at the next rendering step, so a change that is
   * committed between a scroll and that event would otherwise be anchored to
   * the position from before the scroll and undo it.
   */
  captureBeforeCommit: () => void;
}

/** First message whose top edge is inside the viewport (message tops increase in DOM order). */
function findFirstVisibleMessage(viewport: HTMLElement): ScrollAnchor | null {
  const nodes = viewport.querySelectorAll<HTMLElement>(`[${FEED_MESSAGE_ID_ATTRIBUTE}]`);
  const viewTop = viewport.getBoundingClientRect().top;
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (nodes[middle].getBoundingClientRect().top - viewTop >= -0.5) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  const node = nodes[low];
  const messageId = node?.getAttribute(FEED_MESSAGE_ID_ATTRIBUTE);
  if (!node || !messageId) return null;
  return { messageId, offset: node.getBoundingClientRect().top - viewTop };
}

/**
 * Keeps a message feed's reading position stable across data changes.
 *
 * - Opening a conversation starts at the bottom.
 * - A new newest message is followed only when the reader is already at the
 *   bottom or it is the reader's own send.
 * - Anything else (older pages prepended, background refetches, new messages
 *   while scrolled up) keeps the first visible message at the same offset.
 *
 * Positions are re-applied in a layout effect, before paint, so the reader
 * never sees the intermediate jump.
 */
export function useFeedScrollAnchor({
  conversationId,
  messages,
  isFeedRendered,
}: UseFeedScrollAnchorOptions): FeedScrollAnchor {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const pinnedToBottomRef = useRef(true);
  const ownSendPendingRef = useRef(false);
  const renderedWindowRef = useRef<RenderedWindow | null>(null);
  const attachedViewportRef = useRef<HTMLDivElement | null>(null);

  const recordPosition = useCallback((viewport: HTMLElement) => {
    pinnedToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= PINNED_THRESHOLD_PX;
    anchorRef.current = findFirstVisibleMessage(viewport);
  }, []);

  const viewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      viewportElementRef.current = node;
      // A new viewport element starts at the bottom of its conversation. The
      // same element can be re-attached (StrictMode replays ref callbacks), and
      // that must not count as a fresh start.
      if (node && node !== attachedViewportRef.current) {
        attachedViewportRef.current = node;
        renderedWindowRef.current = null;
      }
      if (!node) return undefined;

      const handleScroll = () => recordPosition(node);
      node.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        node.removeEventListener('scroll', handleScroll);
        if (viewportElementRef.current === node) {
          viewportElementRef.current = null;
        }
      };
    },
    [recordPosition]
  );

  const markOwnSend = useCallback(() => {
    ownSendPendingRef.current = true;
  }, []);

  const scrollMessageIntoView = useCallback(
    (messageId: string): HTMLElement | null => {
      const viewport = viewportElementRef.current;
      if (!viewport) return null;
      const node = viewport.querySelector<HTMLElement>(
        `[${FEED_MESSAGE_ID_ATTRIBUTE}="${CSS.escape(messageId)}"]`
      );
      if (!node) return null;
      const viewportRect = viewport.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      // Center it; a message taller than the viewport starts at the top edge.
      const centeredGap = Math.max(0, (viewport.clientHeight - nodeRect.height) / 2);
      viewport.scrollTop += nodeRect.top - viewportRect.top - centeredGap;
      // Record now: a data change before the scroll event fires must anchor
      // to this position, not to the one before the jump.
      recordPosition(viewport);
      return node;
    },
    [recordPosition]
  );

  const captureBeforeCommit = useCallback(() => {
    const viewport = viewportElementRef.current;
    if (viewport) recordPosition(viewport);
  }, [recordPosition]);

  useLayoutEffect(() => {
    const viewport = viewportElementRef.current;
    if (!viewport || !isFeedRendered || !conversationId) return;

    const previous = renderedWindowRef.current;
    const current: RenderedWindow = {
      conversationId,
      firstMessageId: messages[0]?.id ?? null,
      lastMessageId: messages[messages.length - 1]?.id ?? null,
    };
    renderedWindowRef.current = current;

    const scrollToBottom = () => {
      viewport.scrollTop = viewport.scrollHeight;
    };

    if (!previous || previous.conversationId !== current.conversationId) {
      ownSendPendingRef.current = false;
      scrollToBottom();
    } else {
      const newestChanged = current.lastMessageId !== previous.lastMessageId;
      const olderPrepended = !newestChanged && current.firstMessageId !== previous.firstMessageId;

      if (newestChanged && (pinnedToBottomRef.current || ownSendPendingRef.current)) {
        ownSendPendingRef.current = false;
        scrollToBottom();
      } else if (!olderPrepended && pinnedToBottomRef.current) {
        // Stay pinned through refetches that change message heights.
        scrollToBottom();
      } else {
        const anchor = anchorRef.current;
        const anchorNode = anchor
          ? viewport.querySelector<HTMLElement>(
              `[${FEED_MESSAGE_ID_ATTRIBUTE}="${CSS.escape(anchor.messageId)}"]`
            )
          : null;
        if (anchor && anchorNode) {
          const offset = anchorNode.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
          const drift = offset - anchor.offset;
          if (Math.abs(drift) >= 1) {
            viewport.scrollTop += drift;
          }
        }
      }
    }

    recordPosition(viewport);
  }, [conversationId, messages, isFeedRendered, recordPosition]);

  return { viewportRef, markOwnSend, scrollMessageIntoView, captureBeforeCommit };
}
