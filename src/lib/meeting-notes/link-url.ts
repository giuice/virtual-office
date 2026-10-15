// src/lib/meeting-notes/link-url.ts
// Links a meeting note may hold (FR-002): http, https, and mailto only — the
// same schemes the content sanitizer keeps. Used by the editor so a link the
// sanitizer would drop is never created in the first place.

const SAFE_LINK_HREF = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+)$/i;
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;
const BARE_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s]*)?$/i;

/** true for an absolute http, https, or mailto URL. */
export function isSafeMeetingNoteLink(href: string): boolean {
  return SAFE_LINK_HREF.test(href.trim());
}

/**
 * What a user typed in the link field → a safe href: "example.com/x" gains
 * https://, "ana@example.com" gains mailto:; null for anything else
 * (javascript:, data:, relative paths, other schemes).
 */
export function normalizeMeetingNoteLinkInput(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (isSafeMeetingNoteLink(value)) return value;
  if (EMAIL.test(value)) return `mailto:${value}`;
  if (BARE_HOST.test(value)) return `https://${value}`;
  return null;
}
