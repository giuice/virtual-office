// src/lib/meeting-notes/ai/transcript-normalizer.ts
// Phase 6 T10 (FR-014, AC-012): the ONLY source of the transcript text sent
// to an AI provider. The stored transcript stays exactly as uploaded (FR-005);
// the processing flow (T12) applies normalizeTranscriptForProvider to it right
// before dispatch.
//
// WebVTT and SubRip structure is removed: the WEBVTT header block, NOTE /
// STYLE / REGION blocks, cue identifiers (SRT cue numbers included), and
// timing lines (`00:00:01.000 --> 00:00:04.000 align:start` and
// `00:00:01,000 --> 00:00:04,000`, with any cue settings). Spoken text and
// speaker names stay: a WebVTT voice span `<v Ana>Hello` becomes
// `Ana: Hello`, and "Ana: Hello" lines are kept as written. Other inline cue
// markup (<c>, <i>, <b>, <u>, <ruby>, <rt>, <lang>, <font>, <s>, karaoke
// timestamps, SRT `{\an8}` position tags) is stripped and the WebVTT
// character references are decoded. Plain text without timing lines is only
// trimmed, with its line endings normalized.
//
// Every regex repetition inside a tag is bounded: an unclosed "<v" or "<c"
// scans at most a few hundred characters, so a 1 MB single-line transcript
// such as "<v <v <v ..." stays linear instead of rescanning to the end of the
// line from every tag start (T10 review: unbounded classes were quadratic).
import 'server-only';

const BOM = '﻿';
const TIMESTAMP = String.raw`(?:\d{1,4}:)?\d{1,2}:\d{2}[.,]\d{1,3}`;
/** A cue timing line, including any cue settings after the end time. */
const TIMING_LINE = new RegExp(String.raw`^[ \t]*${TIMESTAMP}[ \t]*-->[ \t]*${TIMESTAMP}(?:[ \t].*)?$`);
const VTT_HEADER = /^WEBVTT(?:[ \t].*)?$/;
const VTT_METADATA_BLOCK = /^(?:NOTE|STYLE|REGION)(?:[ \t].*)?$/;
const CUE_NUMBER = /^[ \t]*\d+[ \t]*$/;

// Tag bodies also exclude the next tag opener, so each start scans only up
// to the following "<" (or "{").
const VOICE_OPEN = /<v(?:\.[^\s<>]{0,64})?[ \t]([^<>\n]{1,200})>/gi;
const CUE_MARKUP = /<\/?(?:v|c|i|b|u|s|ruby|rt|lang|font)(?:[.\s][^<>\n]{0,200})?>/gi;
const KARAOKE_TIMESTAMP = new RegExp(String.raw`<${TIMESTAMP}>`, 'g');
const SSA_OVERRIDE = /\{\\[^{}\n]{0,200}\}/g;

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&lrm;': '',
  '&rlm;': '',
};
const ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|lrm|rlm);/g;

function cleanCueText(line: string): string {
  return line
    .replace(VOICE_OPEN, (_match, speaker: string) => (speaker.trim() ? `${speaker.trim()}: ` : ''))
    .replace(CUE_MARKUP, '')
    .replace(KARAOKE_TIMESTAMP, '')
    .replace(SSA_OVERRIDE, '')
    .replace(ENTITY, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Cue-structured text (WebVTT or SubRip, by content) → speaker lines and text. */
function normalizeCues(lines: readonly string[], isVtt: boolean): string {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const output: string[] = [];
  blocks.forEach((block, index) => {
    if (isVtt && index === 0 && VTT_HEADER.test(block[0].trim())) return;
    if (isVtt && VTT_METADATA_BLOCK.test(block[0])) return;

    const timing = block.findIndex((line) => TIMING_LINE.test(line));
    // Lines before the timing line are the cue identifier; a block without a
    // timing line keeps its text unless it is only a cue number.
    const payload = timing >= 0 ? block.slice(timing + 1) : block.filter((line) => !CUE_NUMBER.test(line));
    for (const line of payload) {
      if (TIMING_LINE.test(line)) continue;
      const text = cleanCueText(line);
      if (text) output.push(text);
    }
  });
  return output.join('\n');
}

/**
 * The transcript text a provider receives (FR-014): cue numbers, timestamps,
 * and cue settings removed; speaker names and spoken text kept.
 */
export function normalizeTranscriptForProvider(stored: string): string {
  const text = (stored.startsWith(BOM) ? stored.slice(BOM.length) : stored).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const firstLine = lines.find((line) => line.trim() !== '') ?? '';
  const isVtt = VTT_HEADER.test(firstLine.trim());
  if (!isVtt && !lines.some((line) => TIMING_LINE.test(line))) {
    return text.trim();
  }
  return normalizeCues(lines, isVtt);
}
