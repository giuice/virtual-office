import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { MessageHistorySearchResult } from '@/types/messaging';

/** How long a message reached by a jump stays highlighted. */
const HIGHLIGHT_DURATION_MS = 6_000;

type JumpPhase = 'loading' | 'found' | 'shown' | 'unavailable';

interface JumpState {
  id: number;
  conversationId: string;
  messageId: string;
  phase: JumpPhase;
  /** A collapsed thread was expanded once to render the message. */
  revealed: boolean;
}

interface HighlightState {
  conversationId: string;
  messageId: string;
}

interface UseFeedJumpOptions {
  conversationId: string | null;
  /** True while the feed's scroll viewport is mounted (not the starred view, skeleton, or error). */
  isFeedRendered: boolean;
  /** Messages rendered in the feed, including thread replies. */
  messages: ReadonlyArray<{ id: string }>;
  /**
   * Whether the message is in the feed cache right now. The search reads the
   * cache, and the rendered `messages` can lag one notification behind it.
   */
  isMessageLoaded: (messageId: string) => boolean;
  loadHistoryUntilMessage: (messageId: string, signal: AbortSignal) => Promise<MessageHistorySearchResult>;
  /** Makes a loaded message rendered, e.g. by expanding the threads above it. */
  revealMessage: (messageId: string) => void;
  scrollMessageIntoView: (messageId: string) => HTMLElement | null;
}

interface FeedJump {
  /** Opens a message in the feed, loading older history until it is there. */
  jumpToMessage: (messageId: string) => void;
  cancelJump: () => void;
  /** History is being loaded to reach the message. */
  isLoading: boolean;
  /** The message could not be reached; the notice is shown until dismissed. */
  isUnavailable: boolean;
  dismissNotice: () => void;
  /** Message reached by the current jump; its wrapper is focusable (tabIndex -1). */
  targetMessageId: string | null;
  highlightedMessageId: string | null;
}

/**
 * "Go to this message" for the conversation feed (Phase 4 FR-022): loads
 * history until the message is present (bounded and abortable, in
 * loadHistoryUntilMessage), then centers it, focuses it, and highlights it.
 * A message that cannot be reached ends in a notice; the feed stays as it is.
 */
export function useFeedJump({
  conversationId,
  isFeedRendered,
  messages,
  isMessageLoaded,
  loadHistoryUntilMessage,
  revealMessage,
  scrollMessageIntoView,
}: UseFeedJumpOptions): FeedJump {
  const [jump, setJump] = useState<JumpState | null>(null);
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  // A jump belongs to the conversation it started in.
  const activeJump = jump && jump.conversationId === conversationId ? jump : null;

  const abortRunning = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const jumpToMessage = useCallback(
    (messageId: string) => {
      if (!conversationId) return;
      abortRunning();
      const controller = new AbortController();
      controllerRef.current = controller;
      sequenceRef.current += 1;
      const id = sequenceRef.current;
      setHighlight(null);
      setJump({ id, conversationId, messageId, phase: 'loading', revealed: false });

      const settle = (result: MessageHistorySearchResult) => {
        if (result === 'cancelled' || controller.signal.aborted) return;
        if (controllerRef.current === controller) controllerRef.current = null;
        setJump((current) =>
          current?.id === id ? { ...current, phase: result === 'found' ? 'found' : 'unavailable' } : current
        );
      };
      loadHistoryUntilMessage(messageId, controller.signal).then(settle, () => settle('unavailable'));
    },
    [abortRunning, conversationId, loadHistoryUntilMessage]
  );

  const cancelJump = useCallback(() => {
    abortRunning();
    setJump(null);
    setHighlight(null);
  }, [abortRunning]);

  const dismissNotice = useCallback(() => {
    setJump((current) => (current?.phase === 'unavailable' ? null : current));
  }, []);

  // Switching conversations or unmounting abandons a running search.
  useEffect(() => abortRunning, [abortRunning, conversationId]);

  // Once loaded, the message is shown: scrolled to the center, focused, and
  // highlighted. A reply inside a collapsed thread is revealed first (one
  // attempt); a message that left the feed meanwhile ends in the notice.
  useLayoutEffect(() => {
    if (!activeJump || activeJump.phase !== 'found' || !isFeedRendered) return;
    const { id, messageId } = activeJump;
    const fail = () =>
      setJump((current) => (current?.id === id ? { ...current, phase: 'unavailable' } : current));

    if (!messages.some((message) => message.id === messageId)) {
      // The search found it in the cache, but this render can precede the
      // provider's re-render with the page that holds it: wait for the next
      // `messages` while the cache still has it; it left the feed otherwise.
      if (!isMessageLoaded(messageId)) fail();
      return;
    }
    const node = scrollMessageIntoView(messageId);
    if (!node) {
      if (activeJump.revealed) {
        fail();
        return;
      }
      setJump((current) => (current?.id === id ? { ...current, revealed: true } : current));
      revealMessage(messageId);
      return;
    }
    node.focus({ preventScroll: true });
    setJump((current) => (current?.id === id ? { ...current, phase: 'shown' } : current));
    setHighlight({ conversationId: activeJump.conversationId, messageId });
  }, [activeJump, isFeedRendered, isMessageLoaded, messages, revealMessage, scrollMessageIntoView]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  const isTargetPhase = activeJump?.phase === 'found' || activeJump?.phase === 'shown';

  return {
    jumpToMessage,
    cancelJump,
    isLoading: activeJump?.phase === 'loading',
    isUnavailable: activeJump?.phase === 'unavailable',
    dismissNotice,
    targetMessageId: isTargetPhase && activeJump ? activeJump.messageId : null,
    highlightedMessageId:
      highlight && highlight.conversationId === conversationId ? highlight.messageId : null,
  };
}
