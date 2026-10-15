// src/lib/meeting-notes/html-to-markdown.ts
// Meeting-note rich text → Markdown for the export (FR-027). The stored HTML
// is sanitized again with the note allow-list (content-sanitizer.ts), so the
// converter only meets the SPEC schema: paragraphs, hard breaks, bold, italic,
// headings, bulleted/numbered lists, task lists with their checked state, and
// http/https/mailto links. It walks the tree htmlparser2 builds (the parser
// sanitize-html already uses; pinned as a direct dependency) instead of a
// general HTML-to-Markdown package, because every text node must go through
// the export escaping (markdown-escape.ts) — a general converter passes `<`
// and `&` through as raw HTML. Anything outside the schema is reduced to its
// escaped text.
import { ElementType, parseDocument } from 'htmlparser2';

import { sanitizeMeetingNoteHtml } from './content-sanitizer';
import { isSafeMeetingNoteLink } from './link-url';
import {
  escapeAssembledLineStarts,
  escapeAtxHeadingText,
  escapeMarkdownLinkDestination,
  escapeMarkdownText,
} from './markdown-escape';

type DomNode = ReturnType<typeof parseDocument>['children'][number];
type DomElement = Extract<DomNode, { attribs: Record<string, string> }>;
type DomText = Extract<DomNode, { type: typeof ElementType.Text }>;

function isElement(node: DomNode): node is DomElement {
  return 'attribs' in node;
}

function isText(node: DomNode): node is DomText {
  return node.type === ElementType.Text;
}

const HEADING = /^h([1-6])$/;
const INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'a', 'span', 'label', 'br', 'input']);
/** Deeper nesting is flattened to text (keeps the walk's recursion bounded). */
const MAX_DEPTH = 24;
const HARD_BREAK = '\\\n';

/** Plain text of a subtree, without recursion. */
function textOf(nodes: readonly DomNode[]): string {
  const parts: string[] = [];
  const stack: DomNode[] = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as DomNode;
    if (isText(node)) {
      parts.push(node.data);
    } else if (isElement(node)) {
      if (node.name === 'br') parts.push(' ');
      for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push(node.children[index]);
      if (!INLINE_TAGS.has(node.name)) parts.push(' ');
    }
  }
  return parts.join('');
}

/** true when nothing but spaces follows the last line break of `out`. */
function atLineStart(out: string): boolean {
  return /(?:^|\n)[ ]*$/.test(out);
}

/** Wraps inline Markdown in a delimiter, keeping outer spaces outside it. */
function wrap(inner: string, delimiter: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!match || match[2] === '') return inner;
  return `${match[1]}${delimiter}${match[2]}${delimiter}${match[3]}`;
}

function renderInline(nodes: readonly DomNode[], depth: number): string {
  if (depth > MAX_DEPTH) return escapeMarkdownText(textOf(nodes).replace(/\s+/g, ' '), true);
  let out = '';
  for (const node of nodes) {
    if (isText(node)) {
      out += escapeMarkdownText(node.data.replace(/\s+/g, ' '), atLineStart(out));
      continue;
    }
    if (!isElement(node)) continue;
    switch (node.name) {
      case 'br':
        out += HARD_BREAK;
        break;
      case 'input':
        break;
      case 'strong':
      case 'b':
        out += wrap(renderInline(node.children, depth + 1), '**');
        break;
      case 'em':
      case 'i':
        out += wrap(renderInline(node.children, depth + 1), '*');
        break;
      case 'a': {
        const text = renderInline(node.children, depth + 1).trim();
        const href = (node.attribs.href ?? '').trim();
        if (!isSafeMeetingNoteLink(href)) {
          out += text;
        } else {
          out += `[${text || escapeMarkdownText(href, false)}](${escapeMarkdownLinkDestination(href)})`;
        }
        break;
      }
      default:
        out += renderInline(node.children, depth + 1);
    }
  }
  return out;
}

/**
 * A paragraph's inline Markdown without leading/trailing spaces or trailing
 * hard breaks, with every line's start checked again: inline runs are escaped
 * fragment by fragment, so a marker split across fragments is caught here.
 */
function finishParagraph(inline: string): string {
  return escapeAssembledLineStarts(inline.replace(/(?:\s|\\\n)+$/, '').replace(/^\s+/, ''));
}

function isTaskItem(node: DomNode): boolean {
  return isElement(node) && (node.attribs['data-type'] === 'taskItem' || node.attribs['data-checked'] !== undefined);
}

/** Every line after the first gets `indent`. */
function indentRest(text: string, indent: string): string {
  return text.replace(/\n/g, `\n${indent}`);
}

function renderList(node: DomNode, depth: number, headingOffset: number): string {
  if (!isElement(node)) return '';
  const ordered = node.name === 'ol';
  const start = Number(node.attribs.start);
  let number = ordered && Number.isSafeInteger(start) && start >= 0 ? start : 1;
  const lines: string[] = [];
  for (const child of node.children) {
    if (isText(child) && child.data.trim() === '') continue;
    const marker = ordered ? `${number}. ` : '- ';
    number += 1;
    const task = isTaskItem(child) && isElement(child) ? (child.attribs['data-checked'] === 'true' ? '[x] ' : '[ ] ') : '';
    // A task item's checkbox lives in its <label>; its text in the following block(s).
    const children = isElement(child)
      ? child.children.filter((grandchild) => !(task && isElement(grandchild) && grandchild.name === 'label'))
      : [child];
    const body = renderBlocks(children, depth + 1, headingOffset).join('\n');
    lines.push(`${marker}${task}${indentRest(body, ' '.repeat(marker.length))}`.trimEnd());
  }
  return lines.join('\n');
}

/** Block-level Markdown strings for a list of nodes. */
function renderBlocks(nodes: readonly DomNode[], depth: number, headingOffset: number): string[] {
  if (depth > MAX_DEPTH) {
    const text = finishParagraph(escapeMarkdownText(textOf(nodes).replace(/\s+/g, ' '), true));
    return text ? [text] : [];
  }
  const blocks: string[] = [];
  let pendingInline: DomNode[] = [];
  const flushInline = () => {
    const paragraph = finishParagraph(renderInline(pendingInline, depth));
    if (paragraph) blocks.push(paragraph);
    pendingInline = [];
  };

  for (const node of nodes) {
    if (isText(node) || (isElement(node) && INLINE_TAGS.has(node.name))) {
      pendingInline.push(node);
      continue;
    }
    if (!isElement(node)) continue;
    flushInline();
    const heading = HEADING.exec(node.name);
    if (heading) {
      const text = finishParagraph(renderInline(node.children, depth + 1).split(HARD_BREAK).join(' '));
      if (text) blocks.push(`${'#'.repeat(Math.min(6, Number(heading[1]) + headingOffset))} ${escapeAtxHeadingText(text)}`);
    } else if (node.name === 'p') {
      const paragraph = finishParagraph(renderInline(node.children, depth + 1));
      if (paragraph) blocks.push(paragraph);
    } else if (node.name === 'ul' || node.name === 'ol') {
      const list = renderList(node, depth + 1, headingOffset);
      if (list) blocks.push(list);
    } else {
      // div, a stray li, or anything outside the schema: its content as blocks.
      blocks.push(...renderBlocks(node.children, depth + 1, headingOffset));
    }
  }
  flushInline();
  return blocks;
}

/**
 * Stored note HTML → Markdown ('' when the note has no text). `headingOffset`
 * demotes the note's headings (h1 + 2 = ###) so they nest under the export's
 * own sections; the deepest level is 6.
 */
export function meetingNoteHtmlToMarkdown(html: string, headingOffset = 0): string {
  const document = parseDocument(sanitizeMeetingNoteHtml(html));
  return renderBlocks(document.children, 0, Math.max(0, headingOffset)).join('\n\n');
}
