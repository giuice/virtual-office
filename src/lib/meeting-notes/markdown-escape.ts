// src/lib/meeting-notes/markdown-escape.ts
// Escaping of user and AI text written into a Markdown export (FR-027,
// AC-003, SPEC §12). Every character that could start raw HTML becomes an
// entity (`<` `>` `&`), so the .md never contains a `<` from user text; the
// inline Markdown syntax characters are backslash-escaped, so text can never
// form a link, image, emphasis, code span, table cell, or strikethrough; and
// the block markers a line may start with (headings, list items, setext
// underlines, ordered-list numbers) are escaped at the start of every line —
// also when a line is assembled from several fragments — and a trailing `#`
// run of a heading is escaped so it is not taken as a closing sequence.
// Escaping more than strictly needed is always safe; escaping less is not.

const ENTITIES: Readonly<Record<string, string>> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };

/** Characters escaped wherever they appear. */
const ALWAYS_ESCAPED = /[\\`*_[\]~|<>&]/g;

/** Block markers that only matter at the start of a line (after optional spaces). */
const LINE_START_MARKER = /^(\s*)([#+\-=])/;
const LINE_START_ORDERED = /^(\s*\d+)([.)])/;

function escapeAlways(text: string): string {
  return text.replace(ALWAYS_ESCAPED, (char) => ENTITIES[char] ?? `\\${char}`);
}

function escapeLineStart(line: string): string {
  return line.replace(LINE_START_MARKER, '$1\\$2').replace(LINE_START_ORDERED, '$1\\$2');
}

/**
 * Re-checks the start of every line of already-escaped inline Markdown: a
 * block marker can be assembled from several text fragments (`<span>1</span>`
 * then `. text` forms `1. text`), which fragment-local escaping cannot see.
 * Idempotent: an escaped marker starts with `\` and is left alone. The
 * exporter's own inline syntax never starts a line with `#`, `+`, `-`, `=`, or
 * a digit, so only user text is affected.
 */
export function escapeAssembledLineStarts(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => escapeLineStart(line))
    .join('\n');
}

/**
 * Text that follows an ATX heading marker (`# `): a trailing run of `#`
 * preceded by a space would be read as the optional closing sequence and
 * dropped (`# Topic #` shows "Topic"), so its first `#` is escaped.
 */
export function escapeAtxHeadingText(text: string): string {
  return text.replace(/(^|[ \t])(#+)([ \t]*)$/, '$1\\$2$3');
}

/**
 * Escapes a run of text that sits inside a line. `atLineStart` says whether
 * the run may begin a line (it then also escapes the block markers).
 */
export function escapeMarkdownText(text: string, atLineStart: boolean): string {
  const escaped = escapeAlways(text);
  return atLineStart ? escapeLineStart(escaped) : escaped;
}

/** One-line plain text (a title or a name): whitespace runs collapse to one space. */
export function escapeMarkdownLine(text: string): string {
  return escapeMarkdownText(text.replace(/\s+/g, ' ').trim(), true);
}

/**
 * Multi-line plain text (a summary, an item description, a transcript): blank
 * lines separate paragraphs, other line breaks are kept as hard breaks, and
 * every line is escaped as a possible line start. Lines after the first get
 * `indent` (to continue a list item).
 */
export function escapeMarkdownBlock(text: string, indent = ''): string {
  const paragraphs: string[][] = [[]];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/[\t\f\v]/g, ' ').trim();
    if (line === '') {
      if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
      continue;
    }
    paragraphs[paragraphs.length - 1].push(escapeLineStart(escapeAlways(line)));
  }
  return paragraphs
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join(`\\\n${indent}`))
    .join(`\n\n${indent}`);
}

/** Characters percent-encoded in a link destination (`&` is backslash-escaped instead). */
const UNSAFE_IN_DESTINATION = /[\s<>()\\`"'[\]{}|^\u0000-\u001f\u007f]/g;

/**
 * A safe href (already restricted to http, https, or mailto) as a Markdown
 * link destination: characters that could end or reshape the destination are
 * percent-encoded, and `&` is escaped so no entity is decoded inside it.
 */
export function escapeMarkdownLinkDestination(href: string): string {
  return href
    .replace(UNSAFE_IN_DESTINATION, (char) =>
      Array.from(new TextEncoder().encode(char), (byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('')
    )
    .replace(/&/g, '\\&');
}
