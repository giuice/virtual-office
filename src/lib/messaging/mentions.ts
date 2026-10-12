// src/lib/messaging/mentions.ts
// Phase 5 T17 (FR-023, FR-026): @mentions in message text. The stored text is
// plain ("Oi @Bruno Silva"); which "@name" spans are mentions comes from the
// ids chosen in the composer (sent as `mentionIds`) or stored with the message
// (`mentionedUserIds`). A mention is a token "@<label>" that starts the text
// or follows whitespace and is not followed by a letter, digit or "_". Pure
// helpers, no React or I/O.

/** A member that can be (or is) mentioned: users.id and the label shown after "@". */
export interface MentionCandidate {
  userId: string;
  label: string;
}

/** A piece of message text: plain, or one mention token ("@" + label). */
export interface MentionSegment {
  text: string;
  mention?: MentionCandidate;
}

/** The "@" query being typed: the "@" is at `start`, `query` runs up to the caret. */
export interface MentionQuery {
  start: number;
  query: string;
}

const FALLBACK_LABEL = 'Usuário';
const MAX_QUERY_LENGTH = 64;
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const WHITESPACE = /\s/;

/** The label of a member's mention: their display name, or a fixed fallback when they have none. */
export function mentionLabel(displayName: string | null | undefined): string {
  const label = displayName?.trim();
  return label ? label : FALLBACK_LABEL;
}

/** Case- and accent-insensitive form used to filter the list. */
const searchForm = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/**
 * The "@" query ending at `caret`, or null when the caret is not inside one:
 * an "@" at the start of the text or after whitespace, followed (up to the
 * caret) by no line break and no other "@".
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const end = Math.min(Math.max(caret, 0), text.length);
  for (let index = end - 1; index >= 0 && end - index <= MAX_QUERY_LENGTH + 1; index -= 1) {
    const char = text[index];
    if (char === '\n' || char === '\r') return null;
    if (char !== '@') continue;
    if (index > 0 && !WHITESPACE.test(text[index - 1])) return null;
    return { start: index, query: text.slice(index + 1, end) };
  }
  return null;
}

/**
 * Candidates matching the typed query, in their given order: the label (or
 * one of its words) starts with the query, ignoring case and accents. An
 * empty query matches everyone.
 */
export function filterMentionCandidates(
  candidates: readonly MentionCandidate[],
  query: string
): MentionCandidate[] {
  const wanted = searchForm(query);
  if (!wanted) return [...candidates];
  return candidates.filter((candidate) => {
    const label = searchForm(candidate.label);
    return label.startsWith(wanted) || label.split(/\s+/).some((word) => word.startsWith(wanted));
  });
}

/**
 * Replaces the typed "@query" (from `start` to `end`) with "@<label>" and a
 * space (unless whitespace already follows); returns the new text and the
 * caret position after the mention.
 */
export function insertMention(
  text: string,
  start: number,
  end: number,
  label: string
): { text: string; caret: number } {
  const after = text.slice(end);
  const token = `@${label}`;
  const separator = after.length > 0 && WHITESPACE.test(after[0]) ? '' : ' ';
  const next = `${text.slice(0, start)}${token}${separator}${after}`;
  return { text: next, caret: start + token.length + 1 };
}

/** Whether a mention token of `label` starts at `index` (which holds an "@"). */
const tokenAt = (text: string, index: number, label: string): boolean => {
  if (text[index] !== '@' || (index > 0 && !WHITESPACE.test(text[index - 1]))) return false;
  if (!text.startsWith(label, index + 1)) return false;
  const next = text[index + 1 + label.length];
  return next === undefined || !WORD_CHAR.test(next);
};

/**
 * Splits `text` into plain pieces and mention tokens of `mentions` (the
 * longest label wins where labels overlap, e.g. "Ana" and "Ana Paula").
 */
export function segmentMentions(text: string, mentions: readonly MentionCandidate[]): MentionSegment[] {
  if (mentions.length === 0 || !text.includes('@')) return text ? [{ text }] : [];
  const byLength = [...mentions].sort((a, b) => b.label.length - a.label.length);
  const segments: MentionSegment[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < text.length) {
    const mention = text[index] === '@' ? byLength.find((candidate) => tokenAt(text, index, candidate.label)) : undefined;
    if (!mention) {
      index += 1;
      continue;
    }
    if (index > plainStart) segments.push({ text: text.slice(plainStart, index) });
    const tokenEnd = index + 1 + mention.label.length;
    segments.push({ text: text.slice(index, tokenEnd), mention });
    index = tokenEnd;
    plainStart = tokenEnd;
  }
  if (plainStart < text.length) segments.push({ text: text.slice(plainStart) });
  return segments;
}

/** Whether `text` still holds a mention token of `label`. */
export function hasMentionToken(text: string, label: string): boolean {
  for (let index = text.indexOf('@'); index !== -1; index = text.indexOf('@', index + 1)) {
    if (tokenAt(text, index, label)) return true;
  }
  return false;
}

/**
 * The users.id of every chosen mention whose token is still in `text`
 * (lowercase, distinct, sorted — the server's canonical form, so a retry of
 * the same composition sends the same set).
 */
export function mentionIdsInText(text: string, mentions: readonly MentionCandidate[]): string[] {
  const ids = new Set<string>();
  for (const segment of segmentMentions(text, mentions)) {
    if (segment.mention) ids.add(segment.mention.userId.toLowerCase());
  }
  return [...ids].sort();
}
