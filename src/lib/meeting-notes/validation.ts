// src/lib/meeting-notes/validation.ts
// Phase 6 request contracts for the meeting-note routes (FR-001, FR-011,
// AC-002, AC-009). Limits mirror SPEC §10 and the database checks, which stay
// the final authority. Each issue's message is a stable error code; lengths
// count Unicode code points, like Postgres char_length.
import { z } from 'zod';

export const MEETING_NOTE_LIMITS = {
  titleMaxChars: 200,
  contentMaxChars: 100_000,
  maxParticipants: 50,
  itemDescriptionMaxChars: 1_000,
  maxItemsPerNote: 100,
} as const;

/** Upper bound of a request body (sanitization runs on at most this much). */
export const MEETING_NOTE_MAX_BODY_BYTES = 1_048_576;

/**
 * Transcript files (FR-012, FR-013): .txt, .vtt, or .srt (case-insensitive),
 * 1..1,048,576 bytes (1 MB) of UTF-8 text. The database checks the stored
 * text against the same byte limit.
 */
export const MEETING_NOTE_TRANSCRIPT_LIMITS = {
  maxBytes: 1_048_576,
  extensions: ['.txt', '.vtt', '.srt'],
  /** Title fallback when the file name has no usable characters. */
  fallbackTitle: 'Transcript',
} as const;

/** Unicode code points (Postgres char_length), not UTF-16 units. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/**
 * Text Postgres can store: no NUL (22P05) and well-formed UTF-16 (a lone
 * surrogate cannot be encoded as UTF-8; PostgREST rejects the JSON body).
 */
export function isStorableText(value: string): boolean {
  return !value.includes('\u0000') && value.isWellFormed();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date 'YYYY-MM-DD' that Postgres accepts (no year 0000: 22008). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const ISO_OFFSET = /([+-])(\d{2}):(\d{2})$/;

/**
 * An ISO date-time (already accepted by z.iso.datetime) that Postgres
 * timestamptz accepts too: zod allows year 0000 (Postgres 22008) and offsets
 * up to ±23:59 (Postgres allows at most ±15:59, else 22009).
 */
function isPostgresDateTime(value: string): boolean {
  if (value.startsWith('0000')) return false;
  const offset = ISO_OFFSET.exec(value);
  return offset === null || Number(offset[2]) <= 15;
}

const revisionSchema = (code: string) =>
  z.number({ error: code }).int({ error: code }).min(1, { error: code }).max(Number.MAX_SAFE_INTEGER, { error: code });

const titleSchema = z
  .string({ error: 'MEETING_NOTE_TITLE_INVALID' })
  .trim()
  .refine((value) => {
    const length = codePointLength(value);
    return length >= 1 && length <= MEETING_NOTE_LIMITS.titleMaxChars && isStorableText(value);
  }, { error: 'MEETING_NOTE_TITLE_INVALID' });

const meetingDateSchema = z.iso
  .datetime({ offset: true, error: 'MEETING_NOTE_DATE_REQUIRED' })
  .refine(isPostgresDateTime, { error: 'MEETING_NOTE_DATE_REQUIRED' });

// Raw content; its 100,000-char limit applies AFTER sanitization (route).
const contentSchema = z.string({ error: 'MEETING_NOTE_CONTENT_REQUIRED' });

const participantIdsSchema = z
  .array(z.guid({ error: 'MEETING_NOTE_PARTICIPANTS_INVALID' }), { error: 'MEETING_NOTE_PARTICIPANTS_INVALID' })
  .max(MEETING_NOTE_LIMITS.maxParticipants, { error: 'MEETING_NOTE_TOO_MANY_PARTICIPANTS' })
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, {
    error: 'MEETING_NOTE_PARTICIPANTS_INVALID',
  });

export const createMeetingNoteBodySchema = z.object({
  spaceId: z.guid({ error: 'MEETING_NOTE_SPACE_INVALID' }),
  title: titleSchema,
  meetingDate: meetingDateSchema,
  content: contentSchema.default(''),
  participantIds: participantIdsSchema.default([]),
});

// Full replacement: every field is required so a missing one never wipes data.
export const updateMeetingNoteBodySchema = z.object({
  expectedRevision: revisionSchema('MEETING_NOTE_REVISION_REQUIRED'),
  title: titleSchema,
  meetingDate: meetingDateSchema,
  content: contentSchema,
  participantIds: participantIdsSchema,
});

export const restoreMeetingNoteBodySchema = z.object({
  expectedRevision: revisionSchema('MEETING_NOTE_REVISION_REQUIRED'),
  versionId: z.guid({ error: 'MEETING_NOTE_VERSION_INVALID' }),
});

const descriptionSchema = z
  .string({ error: 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID' })
  .trim()
  .refine((value) => {
    const length = codePointLength(value);
    return length >= 1 && length <= MEETING_NOTE_LIMITS.itemDescriptionMaxChars && isStorableText(value);
  }, { error: 'MEETING_NOTE_ITEM_DESCRIPTION_INVALID' });

const assigneeSchema = z.guid({ error: 'MEETING_NOTE_ITEM_ASSIGNEE_INVALID' }).nullable();

const dueDateSchema = z
  .string({ error: 'MEETING_NOTE_ITEM_DUE_DATE_INVALID' })
  .refine(isCalendarDate, { error: 'MEETING_NOTE_ITEM_DUE_DATE_INVALID' })
  .nullable();

export const createActionItemBodySchema = z.object({
  description: descriptionSchema,
  assigneeId: assigneeSchema.default(null),
  dueDate: dueDateSchema.default(null),
});

// Full replacement, like the note update.
export const updateActionItemBodySchema = z.object({
  expectedRevision: revisionSchema('MEETING_NOTE_ITEM_REVISION_REQUIRED'),
  description: descriptionSchema,
  assigneeId: assigneeSchema,
  dueDate: dueDateSchema,
});

export const actionItemCompletionBodySchema = z.object({
  expectedRevision: revisionSchema('MEETING_NOTE_ITEM_REVISION_REQUIRED'),
  completed: z.boolean({ error: 'MEETING_NOTE_ITEM_COMPLETED_REQUIRED' }),
});

/** `?expectedRevision=` of DELETE requests. */
export const expectedRevisionParamSchema = (code: string) =>
  z
    .string({ error: code })
    .regex(/^[1-9]\d{0,15}$/, { error: code })
    .transform(Number)
    .pipe(revisionSchema(code));

export const listMeetingNotesQuerySchema = z.object({
  spaceId: z.guid({ error: 'MEETING_NOTE_SPACE_INVALID' }),
  limit: z.coerce.number({ error: 'BAD_REQUEST' }).int({ error: 'BAD_REQUEST' }).min(1, { error: 'BAD_REQUEST' }).max(100, { error: 'BAD_REQUEST' }).default(20),
  cursor: z.coerce.number({ error: 'BAD_REQUEST' }).int({ error: 'BAD_REQUEST' }).min(0, { error: 'BAD_REQUEST' }).max(1_000_000, { error: 'BAD_REQUEST' }).default(0),
});

export const MEETING_NOTE_SEARCH_LIMITS = {
  queryMaxChars: 200,
  maxPageSize: 50,
  defaultPageSize: 20,
  maxOffset: 10_000,
} as const;

const searchPeriodBoundSchema = z.iso
  .datetime({ offset: true, error: 'MEETING_NOTE_SEARCH_PERIOD_INVALID' })
  .refine(isPostgresDateTime, { error: 'MEETING_NOTE_SEARCH_PERIOD_INVALID' })
  .optional();

/**
 * `GET /api/meeting-notes/search` query (FR-026). `q` empty = list mode;
 * `spaceId` and `removed=true` are mutually exclusive; `from` inclusive, `to`
 * exclusive (ISO date-time with offset); `cursor` is an offset.
 */
export const searchMeetingNotesQuerySchema = z
  .object({
    q: z
      .string({ error: 'BAD_REQUEST' })
      .trim()
      .refine((value) => codePointLength(value) <= MEETING_NOTE_SEARCH_LIMITS.queryMaxChars, {
        error: 'MEETING_NOTE_SEARCH_QUERY_TOO_LONG',
      })
      .refine(isStorableText, { error: 'MEETING_NOTE_SEARCH_INVALID' })
      .default(''),
    spaceId: z.guid({ error: 'MEETING_NOTE_SPACE_INVALID' }).optional(),
    removed: z
      .enum(['true', 'false'], { error: 'BAD_REQUEST' })
      .default('false')
      .transform((value) => value === 'true'),
    from: searchPeriodBoundSchema,
    to: searchPeriodBoundSchema,
    limit: z.coerce
      .number({ error: 'BAD_REQUEST' })
      .int({ error: 'BAD_REQUEST' })
      .min(1, { error: 'BAD_REQUEST' })
      .max(MEETING_NOTE_SEARCH_LIMITS.maxPageSize, { error: 'BAD_REQUEST' })
      .default(MEETING_NOTE_SEARCH_LIMITS.defaultPageSize),
    cursor: z.coerce
      .number({ error: 'BAD_REQUEST' })
      .int({ error: 'BAD_REQUEST' })
      .min(0, { error: 'BAD_REQUEST' })
      .max(MEETING_NOTE_SEARCH_LIMITS.maxOffset, { error: 'BAD_REQUEST' })
      .default(0),
  })
  .superRefine((value, context) => {
    if (value.spaceId !== undefined && value.removed) {
      context.addIssue({ code: 'custom', message: 'MEETING_NOTE_SEARCH_FILTER_INVALID', path: ['removed'] });
    }
    if (value.from !== undefined && value.to !== undefined && Date.parse(value.from) > Date.parse(value.to)) {
      context.addIssue({ code: 'custom', message: 'MEETING_NOTE_SEARCH_PERIOD_INVALID', path: ['from'] });
    }
  });

export type SearchMeetingNotesQuery = z.infer<typeof searchMeetingNotesQuerySchema>;

const TIME_ZONE_NAME = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** true for an IANA time zone name this runtime's Intl accepts. */
export function isSupportedTimeZone(timeZone: string): boolean {
  if (!TIME_ZONE_NAME.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * `GET /api/meeting-notes/[id]/export` query (FR-027): `includeTranscript`
 * 'true' | 'false' (default false); `timeZone` the zone the meeting date is
 * written in (default UTC).
 */
export const exportMeetingNoteQuerySchema = z.object({
  includeTranscript: z
    .enum(['true', 'false'], { error: 'BAD_REQUEST' })
    .default('false')
    .transform((value) => value === 'true'),
  timeZone: z.string({ error: 'BAD_REQUEST' }).refine(isSupportedTimeZone, { error: 'BAD_REQUEST' }).default('UTC'),
});

/** Path ids: a malformed id is answered like a missing one. */
export const pathIdSchema = z.guid();

export type CreateMeetingNoteBody = z.infer<typeof createMeetingNoteBodySchema>;
export type UpdateMeetingNoteBody = z.infer<typeof updateMeetingNoteBodySchema>;
export type RestoreMeetingNoteBody = z.infer<typeof restoreMeetingNoteBodySchema>;
/**
 * POST /api/meeting-notes/[id]/ai/process (T12): the signed ticket from the
 * notice, and optionally the key the client believes it carries — which must
 * then equal the ticket's (a client can never choose a key).
 */
export const startMeetingNoteAiProcessingBodySchema = z.object({
  ticket: z.string({ error: 'MEETING_NOTE_AI_TICKET_INVALID' }).min(1, { error: 'MEETING_NOTE_AI_TICKET_INVALID' }).max(4_096, {
    error: 'MEETING_NOTE_AI_TICKET_INVALID',
  }),
  idempotencyKey: z.guid({ error: 'MEETING_NOTE_AI_BINDING_MISMATCH' }).optional(),
});

/** Draft summary limits (mirror the provider draft schema, T11). */
export const MEETING_NOTE_AI_SUMMARY_LIMITS = {
  maxEntriesPerSection: 100,
  maxEntryChars: 2_000,
} as const;

const summaryEntriesSchema = z
  .array(
    z.string({ error: 'MEETING_NOTE_SUMMARY_INVALID' }).refine(
      (value) => codePointLength(value) <= MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntryChars && isStorableText(value),
      { error: 'MEETING_NOTE_SUMMARY_INVALID' }
    ),
    { error: 'MEETING_NOTE_SUMMARY_INVALID' }
  )
  .max(MEETING_NOTE_AI_SUMMARY_LIMITS.maxEntriesPerSection, { error: 'MEETING_NOTE_SUMMARY_INVALID' });

/** POST /api/meeting-notes/[id]/ai/apply (T12): edited summary + accepted items at the draft's source revision. */
export const applyMeetingNoteAiDraftBodySchema = z.object({
  expectedRevision: revisionSchema('MEETING_NOTE_REVISION_REQUIRED'),
  summary: z.object(
    {
      keyPoints: summaryEntriesSchema,
      decisions: summaryEntriesSchema,
      nextSteps: summaryEntriesSchema,
    },
    { error: 'MEETING_NOTE_SUMMARY_INVALID' }
  ),
  items: z
    .array(
      z.object({
        description: descriptionSchema,
        assigneeId: assigneeSchema.default(null),
        dueDate: dueDateSchema.default(null),
      }),
      { error: 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' }
    )
    .max(MEETING_NOTE_LIMITS.maxItemsPerNote, { error: 'MEETING_NOTE_AI_APPLY_ITEMS_INVALID' }),
});

export type CreateActionItemBody = z.infer<typeof createActionItemBodySchema>;
export type UpdateActionItemBody = z.infer<typeof updateActionItemBodySchema>;
export type ActionItemCompletionBody = z.infer<typeof actionItemCompletionBodySchema>;
