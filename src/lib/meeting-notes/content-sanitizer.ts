// src/lib/meeting-notes/content-sanitizer.ts
// Phase 6 FR-002 / AC-003: the single allow-list for meeting-note rich text.
// Used on write by the API routes and meant for reuse on render (T6), so it
// must stay isomorphic (no server-only imports).
//
// Allowed: paragraphs, line breaks, headings, bold/strong, italic/em, bulleted
// and numbered lists, list items, the task-list markup Tiptap's TaskList /
// TaskItem emit (ul[data-type="taskList"], li[data-type="taskItem"][data-checked],
// label > input[type=checkbox] + span, div), and links whose href is
// http, https, or mailto. Everything else is removed: scripts, styles, event
// handlers, iframes, images, forms, classes, inline styles, and any other
// URL scheme (javascript:, data:, vbscript:, relative or protocol-relative).
import sanitizeHtml from 'sanitize-html';

const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i;

/** Rel set on every surviving link. */
export const MEETING_NOTE_LINK_REL = 'noopener noreferrer nofollow';

export const MEETING_NOTE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    'ul',
    'ol',
    'li',
    'a',
    'label',
    'input',
    'span',
    'div',
  ],
  allowedAttributes: {
    a: ['href', 'rel', { name: 'target', multiple: false, values: ['_blank'] }],
    ol: ['start'],
    ul: [{ name: 'data-type', multiple: false, values: ['taskList'] }],
    li: [
      { name: 'data-type', multiple: false, values: ['taskItem'] },
      { name: 'data-checked', multiple: false, values: ['true', 'false'] },
    ],
    input: [
      { name: 'type', multiple: false, values: ['checkbox'] },
      'checked',
      'disabled',
    ],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // Drop the CONTENT of these too, not only the tags.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg', 'math'],
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: false,
  parseStyleAttributes: false,
  transformTags: {
    a: (tagName, attribs) => {
      const href = (attribs.href ?? '').trim();
      const next: sanitizeHtml.Attributes = {};
      if (SAFE_HREF.test(href)) {
        next.href = href;
        next.rel = MEETING_NOTE_LINK_REL;
        if (attribs.target === '_blank') next.target = '_blank';
      }
      return { tagName, attribs: next };
    },
    ol: (tagName, attribs) => {
      const next: sanitizeHtml.Attributes = {};
      if (attribs.start !== undefined && /^\d{1,6}$/.test(attribs.start)) next.start = attribs.start;
      return { tagName, attribs: next };
    },
  },
  // Only checkbox inputs survive (an input whose type is not exactly
  // "checkbox" is removed with its attributes).
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
};

/** Sanitizes meeting-note rich text with the allow-list above. */
export function sanitizeMeetingNoteHtml(html: string): string {
  // NUL is invalid in Postgres text and replaced by browsers anyway. A lone
  // surrogate cannot be stored either and becomes U+FFFD, as the parser
  // already does for a surrogate character reference such as &#xD800;.
  return sanitizeHtml(html.replace(/\u0000/g, '').toWellFormed(), MEETING_NOTE_SANITIZE_OPTIONS);
}

const DISPLAY_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  ...MEETING_NOTE_SANITIZE_OPTIONS,
  transformTags: {
    ...MEETING_NOTE_SANITIZE_OPTIONS.transformTags,
    // A read view never toggles a checklist: the stored state is shown only.
    // The allow-list above still filters the result (type, checked, disabled).
    input: (tagName, attribs) => ({ tagName, attribs: { ...attribs, disabled: 'disabled' } }),
  },
};

/**
 * Render-side sanitization (FR-002, AC-003): the same allow-list as on write,
 * run again on whatever the server returned before it reaches
 * dangerouslySetInnerHTML; checklist boxes are made read-only.
 */
export function sanitizeMeetingNoteHtmlForDisplay(html: string): string {
  return sanitizeHtml(html.replace(/\u0000/g, '').toWellFormed(), DISPLAY_SANITIZE_OPTIONS);
}
