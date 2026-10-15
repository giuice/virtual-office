// src/repositories/interfaces/IMeetingNoteRepository.ts
import type { ActionItem, MeetingNote } from '@/types/database';
import type { PaginationOptions, PaginatedResult } from '@/types/common';
import type {
  AttachMeetingNoteTranscriptInput,
  CreateMeetingNoteActionItemInput,
  CreateMeetingNoteFromTranscriptInput,
  CreateMeetingNoteInput,
  MeetingNoteAiApplyItemInput,
  MeetingNoteAiApplyResult,
  MeetingNoteListItem,
  MeetingNoteMutationResult,
  MeetingNoteSearchInput,
  MeetingNoteSearchResult,
  MeetingNoteTranscriptMutationResult,
  MeetingNoteVersion,
  MeetingNoteVersionParticipant,
  MeetingNoteVersionSummary,
  UpdateMeetingNoteActionItemInput,
  UpdateMeetingNoteInput,
} from '@/types/meeting-notes';

/**
 * Meeting notes (Phase 6). Construct it with the USER's server client
 * (createSupabaseServerClient()): reads run under RLS (members of the note's
 * company) and writes go through RPCs that authorize the caller from
 * auth.uid(). Never construct it with the service-role client.
 *
 * Write methods throw MeetingNoteDbError (src/lib/meeting-notes/errors.ts)
 * for database refusals (stale revision, forbidden, not found, limits).
 */
export interface IMeetingNoteRepository {
  /** The note (without transcript text), or null when missing or not visible. */
  findById(id: string): Promise<MeetingNote | null>;

  /** Notes of a space, newest meeting date first (no content, no transcript). */
  findByRoom(roomId: string, options?: PaginationOptions): Promise<PaginatedResult<MeetingNoteListItem>>;

  /**
   * Full-text search over the caller's company's notes (public.search_meeting_notes,
   * which resolves the caller from auth.uid()): title, content text, summary, and action-item
   * descriptions; relevance desc, meeting date desc, id desc; `nextCursor` is
   * the next offset. An empty query lists every note within the filters,
   * newest meeting first. Throws MeetingNoteDbError (MEETING_NOTE_SEARCH_INVALID).
   */
  searchNotes(input: MeetingNoteSearchInput): Promise<PaginatedResult<MeetingNoteSearchResult>>;

  /** The note's current participants (snapshots) in their order. */
  findParticipants(noteId: string): Promise<MeetingNoteVersionParticipant[]>;

  /** The note's action items, oldest first. */
  findActionItems(noteId: string): Promise<ActionItem[]>;

  /** One action item, or null when missing or not visible. */
  findActionItemById(itemId: string): Promise<ActionItem | null>;

  /** The stored transcript text, or null when none is stored or the note is not visible. */
  findTranscript(noteId: string): Promise<string | null>;

  /** Name of a space visible to the caller, or null. */
  findSpaceName(roomId: string): Promise<string | null>;

  /** The subset of `userIds` that are current members of `companyId`. */
  findCurrentMemberIds(companyId: string, userIds: readonly string[]): Promise<Set<string>>;

  /** Every current member of `companyId` visible to the caller (id + display name), for local name matching. */
  listCurrentMembers(companyId: string): Promise<Array<{ userId: string; displayName: string }>>;

  /** The note's versions, newest first. */
  listVersions(noteId: string): Promise<MeetingNoteVersionSummary[]>;

  /** One version of the note, or null. */
  findVersion(noteId: string, versionId: string): Promise<MeetingNoteVersion | null>;

  createNote(input: CreateMeetingNoteInput): Promise<MeetingNoteMutationResult>;
  updateNote(input: UpdateMeetingNoteInput): Promise<MeetingNoteMutationResult>;
  restoreVersion(noteId: string, expectedRevision: number, versionId: string): Promise<MeetingNoteMutationResult>;
  deleteNote(noteId: string, expectedRevision: number): Promise<void>;

  /** public.create_meeting_note_from_transcript: note + transcript + version 1 in one transaction. */
  createNoteFromTranscript(input: CreateMeetingNoteFromTranscriptInput): Promise<MeetingNoteTranscriptMutationResult>;
  /** public.attach_meeting_note_transcript: an editor replaces the transcript (new identity, revision + 1). */
  attachTranscript(input: AttachMeetingNoteTranscriptInput): Promise<MeetingNoteTranscriptMutationResult>;

  createActionItem(input: CreateMeetingNoteActionItemInput): Promise<ActionItem>;
  updateActionItem(input: UpdateMeetingNoteActionItemInput): Promise<ActionItem>;
  setActionItemCompleted(itemId: string, expectedRevision: number, completed: boolean): Promise<ActionItem>;
  deleteActionItem(itemId: string, expectedRevision: number): Promise<void>;

  /**
   * public.apply_meeting_note_ai_draft: at the draft's source revision, writes
   * `summary` (plain text, null = none), appends `items` in order, and creates
   * one version — all or nothing (FR-018).
   */
  applyAiDraft(input: {
    noteId: string;
    expectedRevision: number;
    summary: string | null;
    items: readonly MeetingNoteAiApplyItemInput[];
  }): Promise<MeetingNoteAiApplyResult>;
}
