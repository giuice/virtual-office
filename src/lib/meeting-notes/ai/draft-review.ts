// src/lib/meeting-notes/ai/draft-review.ts
// Turns a provider draft into the reviewable draft of the start route and an
// edited summary into the stored text of Apply (Phase 6 T12; SPEC FR-016,
// FR-017, FR-018, BR-006). Pure functions: no I/O, nothing logged.
//
// Name resolution (FR-017) is LOCAL: the provider never receives the member
// roster (FR-016); it returns names as written in the transcript, and they are
// matched here against the company's CURRENT members only:
//   1. exact full display name (case- and accent-insensitive, trimmed, inner
//      whitespace collapsed) — exactly one member → that member; two or more
//      members with that same name → unassigned;
//   2. otherwise the whole suggested name equal to the FIRST name (first
//      token of the display name) of exactly one current member → that member;
//   3. otherwise (several first-name matches, none, a former member) →
//      unassigned.
// "Already exists" (FR-018): a suggestion whose normalized description equals
// an existing item's is marked with that item's id (the UI shows it
// unchecked). Same key as SQL private.meeting_note_ai_normalize_description
// (trim, collapse whitespace, strip accents, lower case); characters that
// unaccent and Unicode decomposition treat differently (e.g. ß, æ) can differ
// between the two, which only affects the informational mark.
import 'server-only';

import type {
  MeetingNoteAiDraft,
  MeetingNoteAiDraftSummary,
  MeetingNoteAiReviewDraft,
} from '@/types/meeting-notes';

export interface MeetingNoteAiMember {
  userId: string;
  displayName: string;
}

/** Comparison key: NFD, combining marks removed, lower case, trimmed, single spaces. */
export function meetingNoteAiComparisonKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ');
}

function firstName(key: string): string {
  const space = key.indexOf(' ');
  return space === -1 ? key : key.slice(0, space);
}

/** The single current member a suggested name designates, else null (FR-017). */
export function resolveMeetingNoteAiAssignee(
  suggestedName: string | null,
  members: readonly MeetingNoteAiMember[]
): MeetingNoteAiMember | null {
  if (suggestedName === null) return null;
  const wanted = meetingNoteAiComparisonKey(suggestedName);
  if (wanted === '') return null;

  const keyed = members
    .map((member) => ({ member, key: meetingNoteAiComparisonKey(member.displayName) }))
    .filter((entry) => entry.key !== '');

  const exact = keyed.filter((entry) => entry.key === wanted);
  if (exact.length === 1) return exact[0].member;
  if (exact.length > 1) return null;

  const byFirstName = keyed.filter((entry) => firstName(entry.key) === wanted);
  return byFirstName.length === 1 ? byFirstName[0].member : null;
}

/** The reviewable draft: assignees resolved locally, duplicates of existing items marked. */
export function buildMeetingNoteAiReviewDraft(
  draft: MeetingNoteAiDraft,
  members: readonly MeetingNoteAiMember[],
  existingItems: ReadonlyArray<{ id: string; description: string }>
): MeetingNoteAiReviewDraft {
  const existing = new Map<string, string>();
  for (const item of existingItems) {
    const key = meetingNoteAiComparisonKey(item.description);
    if (!existing.has(key)) existing.set(key, item.id);
  }
  return {
    summary: {
      keyPoints: [...draft.summary.keyPoints],
      decisions: [...draft.summary.decisions],
      nextSteps: [...draft.summary.nextSteps],
    },
    items: draft.actionItems.map((item) => {
      const resolved = resolveMeetingNoteAiAssignee(item.assigneeName, members);
      return {
        description: item.description,
        suggestedAssigneeName: item.assigneeName,
        resolvedAssignee: resolved ? { userId: resolved.userId, displayName: resolved.displayName } : null,
        duplicateOfItemId: existing.get(meetingNoteAiComparisonKey(item.description)) ?? null,
      };
    }),
  };
}

const SECTION_TITLES: ReadonlyArray<[keyof MeetingNoteAiDraftSummary, string]> = [
  ['keyPoints', 'Key points'],
  ['decisions', 'Decisions'],
  ['nextSteps', 'Next steps'],
];

/**
 * Stored summary format (plain text; the note view renders it as text with
 * pre-wrapped lines, the export escapes it). Each non-empty section is a
 * heading line followed by one "- " line per entry; sections are separated by
 * a blank line; line breaks inside an entry become spaces. All sections empty
 * → null (Apply then keeps the note's current summary). Example:
 *   Key points
 *   - Launch stays on Friday.
 *
 *   Next steps
 *   - Bruno updates the changelog.
 */
export function formatMeetingNoteAiSummary(summary: MeetingNoteAiDraftSummary): string | null {
  const blocks: string[] = [];
  for (const [key, title] of SECTION_TITLES) {
    const entries = summary[key].map((entry) => entry.replace(/\s+/gu, ' ').trim()).filter((entry) => entry !== '');
    if (entries.length > 0) blocks.push([title, ...entries.map((entry) => `- ${entry}`)].join('\n'));
  }
  return blocks.length > 0 ? blocks.join('\n\n') : null;
}
