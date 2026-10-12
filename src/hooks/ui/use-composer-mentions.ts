// src/hooks/ui/use-composer-mentions.ts
'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useConversationMembers } from '@/hooks/queries/useConversationMembers';
import {
  filterMentionCandidates,
  findMentionQuery,
  hasMentionToken,
  insertMention,
  mentionIdsInText,
  mentionLabel,
  segmentMentions,
  type MentionCandidate,
  type MentionSegment,
} from '@/lib/messaging/mentions';

interface UseComposerMentionsOptions {
  /** The conversation the draft belongs to; chosen mentions are dropped when it changes. */
  conversationId: string | null;
  /** The signed-in user (users.id); never offered. */
  viewerId: string | null;
  /** The composer's current text. */
  content: string;
  /** Replaces the composer's text (the composer's own change path). */
  setContent: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface ComposerMentionList {
  id: string;
  options: MentionCandidate[];
  activeIndex: number;
  optionId: (index: number) => string;
  choose: (candidate: MentionCandidate) => void;
  setActiveIndex: (index: number) => void;
}

/**
 * Phase 5 T17 (FR-023, BR-010, AC-023, AC-037): the composer's "@" mention
 * list. Typing "@" (at the start or after a space) offers the conversation's
 * current members except the viewer — the members route roster
 * (`useConversationMembers`, T4/T15), so a removed or never-joined user is
 * never offered — filtered as the user types. Arrows move, Enter/Tab choose,
 * Escape closes it (until the caret leaves that "@"), and the mouse picks an
 * option. A chosen member is inserted as "@<name> " and stays a mention while
 * that token is intact; "@name" typed without choosing is plain text.
 * `mentionIds` is what the send carries (users.id, sorted).
 */
export function useComposerMentions({
  conversationId,
  viewerId,
  content,
  setContent,
  textareaRef,
}: UseComposerMentionsOptions) {
  const listId = useId();
  const { data: roster, refetch: refetchRoster } = useConversationMembers(conversationId, viewerId);
  const candidates = useMemo<MentionCandidate[]>(
    () =>
      (roster ?? [])
        .filter((member) => member.userId !== viewerId)
        .map((member) => ({ userId: member.userId, label: mentionLabel(member.displayName) })),
    [roster, viewerId]
  );

  // Chosen mentions belong to the draft of one conversation, and only while
  // their token is still in the text (render-time adjustment, no effect).
  const [chosen, setChosen] = useState<{ conversationId: string | null; mentions: MentionCandidate[] }>(() => ({
    conversationId,
    mentions: [],
  }));
  const current = chosen.conversationId === conversationId ? chosen.mentions : [];
  const mentions = current.filter((mention) => hasMentionToken(content, mention.label));
  if (chosen.conversationId !== conversationId || mentions.length !== chosen.mentions.length) {
    setChosen({ conversationId, mentions });
  }

  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  // An "@" closed with Escape stays closed until the caret leaves it.
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [active, setActive] = useState<{ key: string; index: number }>({ key: '', index: 0 });

  const trigger = focused && caret !== null ? findMentionQuery(content, caret) : null;
  if (dismissedStart !== null && trigger?.start !== dismissedStart) {
    setDismissedStart(null);
  }
  const options =
    trigger && trigger.start !== dismissedStart ? filterMentionCandidates(candidates, trigger.query) : [];
  const isOpen = options.length > 0;
  const activeKey = trigger ? `${trigger.start}:${trigger.query}` : '';
  const activeIndex = isOpen && active.key === activeKey ? Math.min(active.index, options.length - 1) : 0;
  const optionId = useCallback((index: number) => `${listId}-option-${index}`, [listId]);

  // Block C fix F6: each "@" query that opens re-reads the roster (the cached
  // one shows meanwhile). Another member joining or coming back sends this
  // viewer no event (RLS shows only the viewer's own member rows), so any
  // cached roster may be stale here; removals also refresh it live
  // (useConversationRealtime). Already submitted sends keep their ids.
  const triggerStart = trigger?.start ?? null;
  useEffect(() => {
    if (triggerStart === null || !conversationId || !viewerId) return;
    void refetchRoster({ cancelRefetch: false });
  }, [conversationId, refetchRoster, triggerStart, viewerId]);

  // The caret goes after an inserted mention once React has written the text.
  const pendingCaretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = pendingCaretRef.current;
    const textarea = textareaRef.current;
    if (position === null || !textarea || textarea.value !== content) return;
    pendingCaretRef.current = null;
    textarea.focus();
    textarea.setSelectionRange(position, position);
  }, [content, textareaRef]);

  const choose = useCallback(
    (candidate: MentionCandidate) => {
      if (!trigger) return;
      const end = trigger.start + 1 + trigger.query.length;
      const next = insertMention(content, trigger.start, end, candidate.label);
      setChosen((state) => ({
        conversationId,
        mentions: [
          ...(state.conversationId === conversationId ? state.mentions : []).filter(
            (mention) => mention.userId !== candidate.userId
          ),
          candidate,
        ],
      }));
      pendingCaretRef.current = next.caret;
      setCaret(next.caret);
      setContent(next.text);
    },
    [content, conversationId, setContent, trigger]
  );

  const setActiveIndex = useCallback(
    (index: number) => setActive({ key: activeKey, index }),
    [activeKey]
  );

  /** Handles the list's keys; returns true when the key was used by the list. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!isOpen || !trigger) return false;
    // Block C fix F7: keys that confirm or move within an IME composition are the IME's.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return false;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
    if (!plain) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive({ key: activeKey, index: (activeIndex + step + options.length) % options.length });
    } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
      choose(options[activeIndex]);
    } else if (event.key === 'Escape') {
      setDismissedStart(trigger.start);
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const trackCaret = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart === event.currentTarget.selectionEnd ? event.currentTarget.selectionStart : null);
  }, []);

  const segments: MentionSegment[] = segmentMentions(content, mentions);
  const mentionIds = mentionIdsInText(content, mentions);

  const list: ComposerMentionList | null = isOpen
    ? { id: listId, options, activeIndex, optionId, choose, setActiveIndex }
    : null;

  return {
    list,
    /** Props for the composer's textarea (combined with its own handlers by the caller). */
    textareaProps: {
      'aria-autocomplete': 'list' as const,
      'aria-controls': isOpen ? listId : undefined,
      'aria-activedescendant': isOpen ? optionId(activeIndex) : undefined,
    },
    handleKeyDown,
    trackCaret,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    /** Text split into plain pieces and chosen mention tokens (the composer's highlight). */
    segments,
    hasMentions: mentions.length > 0,
    /** users.id of the chosen mentions still in the text, sorted. */
    mentionIds,
  };
}
