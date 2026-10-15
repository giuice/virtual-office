// src/lib/meeting-notes/html-text.ts
// Plain text of meeting-note rich text, for showing a user's own unsaved
// text where it can be copied (conflict warning). Browser-only parsing of
// already-sanitized HTML; DOMParser never runs scripts.
import { sanitizeMeetingNoteHtml } from './content-sanitizer';

const BLOCK_END = /<\/(?:p|h[1-6]|li)>|<br\s*\/?>/gi;

export function meetingNoteHtmlToText(html: string): string {
  const marked = sanitizeMeetingNoteHtml(html).replace(BLOCK_END, (tag) => `${tag}\n`);
  if (typeof DOMParser === 'undefined') {
    return marked.replace(/<[^>]*>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${marked}</body>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
