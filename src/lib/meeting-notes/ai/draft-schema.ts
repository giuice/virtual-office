// src/lib/meeting-notes/ai/draft-schema.ts
// The ONE draft schema every provider adapter validates against (Phase 6 T11;
// SPEC FR-016, FR-017, FR-021). Two views of the same shape:
//   * MEETING_NOTE_AI_DRAFT_JSON_SCHEMA — sent to providers that take a JSON
//     schema (Anthropic `output_config.format`, OpenAI/Kimi `response_format`
//     json_schema strict). It deliberately carries no length/count keywords:
//     Anthropic structured outputs reject numeric/string/array constraints,
//     so the limits live in the zod schema and the prompt.
//   * meetingNoteAiDraftSchema — zod validation of the model's text after
//     JSON.parse, for every provider (GLM only has json_object mode, so this is
//     its only structural check).
// The JSON Schema stays closed for the providers; the zod schema validates
// every required field, type, and limit but DROPS unknown properties at every
// level (SPEC §11). Output that is not JSON, does not match, exceeds a limit (e.g. more than 100
// action items — the SPEC caps drafts at 100 and is silent on truncation, so
// it is a failure), or is empty is an unusable draft (counted, FR-021/FR-022).
import 'server-only';

import { z } from 'zod';

import type { MeetingNoteAiDraft } from '@/types/meeting-notes';

export const MEETING_NOTE_AI_DRAFT_MAX_ITEMS = 100;
export const MEETING_NOTE_AI_DRAFT_MAX_DESCRIPTION = 1_000;
export const MEETING_NOTE_AI_DRAFT_MAX_ASSIGNEE_NAME = 200;
/** Per summary section. */
export const MEETING_NOTE_AI_DRAFT_MAX_SUMMARY_ENTRIES = 100;
export const MEETING_NOTE_AI_DRAFT_MAX_SUMMARY_ENTRY = 2_000;

const STRING_OR_NULL = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;

/** JSON Schema of the draft (every object closed, every property required). */
export const MEETING_NOTE_AI_DRAFT_JSON_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    summary: {
      type: 'object',
      properties: {
        keyPoints: { type: 'array', items: { type: 'string' } },
        decisions: { type: 'array', items: { type: 'string' } },
        nextSteps: { type: 'array', items: { type: 'string' } },
      },
      required: ['keyPoints', 'decisions', 'nextSteps'],
      additionalProperties: false,
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          assigneeName: STRING_OR_NULL,
        },
        required: ['description', 'assigneeName'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'actionItems'],
  additionalProperties: false,
};

/** Name used for the OpenAI-compatible `response_format.json_schema.name`. */
export const MEETING_NOTE_AI_DRAFT_SCHEMA_NAME = 'meeting_note_draft';

const summarySection = z
  .array(z.string().trim().max(MEETING_NOTE_AI_DRAFT_MAX_SUMMARY_ENTRY))
  .max(MEETING_NOTE_AI_DRAFT_MAX_SUMMARY_ENTRIES)
  // Blank bullets carry nothing; drop them rather than failing the draft.
  .transform((entries) => entries.filter((entry) => entry.length > 0));

const actionItem = z
  .object({
    description: z.string().trim().min(1).max(MEETING_NOTE_AI_DRAFT_MAX_DESCRIPTION),
    assigneeName: z
      .string()
      .trim()
      .max(MEETING_NOTE_AI_DRAFT_MAX_ASSIGNEE_NAME)
      .nullable()
      .transform((name) => (name ? name : null)),
  })
  // Unknown properties are dropped, not rejected (SPEC §11: extra fields are
  // ignored — GLM's json_object mode can add e.g. a `dueDate`).
  .strip();

export const meetingNoteAiDraftSchema = z
  .object({
    summary: z.object({ keyPoints: summarySection, decisions: summarySection, nextSteps: summarySection }).strip(),
    actionItems: z.array(actionItem).max(MEETING_NOTE_AI_DRAFT_MAX_ITEMS),
  })
  .strip();

export type MeetingNoteAiDraftParseResult =
  | { ok: true; draft: MeetingNoteAiDraft }
  | { ok: false; reason: 'empty' | 'malformed' | 'invalid' };

/**
 * Parses and validates the model's complete text output. Only the reason is
 * returned — never the text or zod's issue messages, which can echo input.
 */
export function parseMeetingNoteAiDraft(text: string): MeetingNoteAiDraftParseResult {
  if (text.trim().length === 0) return { ok: false, reason: 'empty' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = meetingNoteAiDraftSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const { summary, actionItems } = parsed.data;
  const hasContent =
    summary.keyPoints.length + summary.decisions.length + summary.nextSteps.length + actionItems.length > 0;
  if (!hasContent) return { ok: false, reason: 'empty' };
  return { ok: true, draft: { summary, actionItems } };
}
