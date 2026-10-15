// src/types/meeting-notes.ts
// Phase 6 meeting notes: view and input shapes built on MeetingNote/ActionItem
// (src/types/database.ts). Every user id is an application users.id.
import type { ActionItem, MeetingNote, TimeStampType } from '@/types/database';

/** A participant of a note: name snapshot plus whether they are still a member. */
export interface MeetingNoteParticipant {
  userId: string;
  displayName: string;
  /** false = "Former member" (left the company or was deleted). */
  isCurrentMember: boolean;
}

/** An action item as shown in a note view. */
export interface MeetingNoteActionItemView extends ActionItem {
  /** null when unassigned; false = "Former member". */
  assigneeIsCurrentMember: boolean | null;
}

/** The caller's rights on a note, evaluated on the state that was read. */
export interface MeetingNoteRights {
  canEdit: boolean;
  canDelete: boolean;
}

/** Everything a note view needs (FR-005). */
export interface MeetingNoteDetail extends MeetingNote {
  /** Name of the note's space; null when the space was deleted ("Space removed"). */
  spaceName: string | null;
  participants: MeetingNoteParticipant[];
  actionItems: MeetingNoteActionItemView[];
  hasTranscript: boolean;
  /** Stored transcript text; present only when the caller asked for it. */
  transcript?: string | null;
  rights: MeetingNoteRights;
}

/** A row of a note listing (no content, no transcript text). */
export interface MeetingNoteListItem {
  id: string;
  roomId: string | null;
  title: string;
  meetingDate: TimeStampType;
  authorUserId: string;
  authorName: string;
  hasSummary: boolean;
  hasTranscript: boolean;
  revision: number;
  createdAt: TimeStampType;
  updatedAt: TimeStampType;
}

/** The note field a search excerpt was taken from (FR-026). */
export type MeetingNoteSearchField = 'content' | 'summary' | 'action_item' | 'title';

/** A piece of excerpt text; `highlighted` marks a matched word. Render as text, never as HTML. */
export interface MeetingNoteExcerptSegment {
  text: string;
  highlighted: boolean;
}

export interface MeetingNoteSearchExcerpt {
  field: MeetingNoteSearchField;
  segments: MeetingNoteExcerptSegment[];
}

/** A search hit: the listing row plus relevance and excerpt (both null in list mode, i.e. an empty query). */
export interface MeetingNoteSearchResult extends MeetingNoteListItem {
  relevance: number | null;
  excerpt: MeetingNoteSearchExcerpt | null;
}

/** Search request (company of the caller is implied by the session). */
export interface MeetingNoteSearchInput {
  /** Websearch syntax; '' lists every note within the filters, newest meeting first. */
  query: string;
  /** Only notes of this space. Mutually exclusive with `spaceRemoved`. */
  spaceId: string | null;
  /** Only notes whose space was deleted ("Space removed"). */
  spaceRemoved: boolean;
  /** ISO 8601 date-time with offset; inclusive lower bound of the meeting date. */
  meetingFrom: string | null;
  /** ISO 8601 date-time with offset; exclusive upper bound of the meeting date. */
  meetingTo: string | null;
  /** 1..50. */
  limit: number;
  /** 0..10,000. */
  offset: number;
}

/** A version in the history list (who and when). */
export interface MeetingNoteVersionSummary {
  id: string;
  noteId: string;
  revision: number;
  title: string;
  meetingDate: TimeStampType;
  editorUserId: string;
  editorName: string;
  createdAt: TimeStampType;
}

/** A participant as recorded in a version (snapshot). */
export interface MeetingNoteVersionParticipant {
  userId: string;
  displayName: string;
}

/** A full immutable version. */
export interface MeetingNoteVersion extends MeetingNoteVersionSummary {
  participants: MeetingNoteVersionParticipant[];
  content: string;
  summary: string | null;
}

/**
 * A version as the version route returns it: the participant snapshots plus
 * whether each person is still a member of the note's company (FR-030).
 */
export interface MeetingNoteVersionView extends Omit<MeetingNoteVersion, 'participants'> {
  participants: MeetingNoteParticipant[];
}

/** Result of a note create/update/restore. */
export interface MeetingNoteMutationResult {
  noteId: string;
  revision: number;
  versionId: string;
}

/** A transcript write: the mutation plus the new stored-transcript identity. */
export interface MeetingNoteTranscriptMutationResult extends MeetingNoteMutationResult {
  transcriptId: string;
}

/** "New note from transcript" (FR-012): title from the file name; date = now. */
export interface CreateMeetingNoteFromTranscriptInput {
  roomId: string;
  title: string;
  /** Decoded transcript text as uploaded (validated by the route). */
  transcript: string;
}

/** "Attach transcript" (FR-012): replaces the stored transcript at `expectedRevision`. */
export interface AttachMeetingNoteTranscriptInput {
  noteId: string;
  expectedRevision: number;
  transcript: string;
}

/** The note fields an editor sets (content already sanitized). */
export interface MeetingNoteFieldsInput {
  title: string;
  /** ISO 8601 date-time with offset. */
  meetingDate: string;
  content: string;
  participantIds: string[];
}

export interface CreateMeetingNoteInput extends MeetingNoteFieldsInput {
  roomId: string;
}

export interface UpdateMeetingNoteInput extends MeetingNoteFieldsInput {
  noteId: string;
  expectedRevision: number;
}

/** The action-item fields an editor sets. */
export interface MeetingNoteActionItemFieldsInput {
  description: string;
  assigneeId: string | null;
  /** 'YYYY-MM-DD' or null. */
  dueDate: string | null;
}

export interface CreateMeetingNoteActionItemInput extends MeetingNoteActionItemFieldsInput {
  noteId: string;
}

export interface UpdateMeetingNoteActionItemInput extends MeetingNoteActionItemFieldsInput {
  itemId: string;
  expectedRevision: number;
}

// ---------------------------------------------------------------------------
// Company AI settings (Phase 6 T8, FR-024, BR-009). Metadata only: no shape
// here ever carries an API key except the write-only save input.
// ---------------------------------------------------------------------------

export type MeetingNoteAiProvider = 'anthropic' | 'openai' | 'kimi' | 'glm';

/** Who saved the settings last: application users.id (null once deleted) and name snapshot. */
export interface MeetingNoteAiSettingsUpdatedBy {
  userId: string | null;
  name: string;
}

/**
 * The company's AI settings as any member may see them. A company that never
 * saved settings is `configured: false` with the default daily limit.
 */
export interface MeetingNoteAiSettingsView {
  configured: boolean;
  provider: MeetingNoteAiProvider | null;
  model: string | null;
  reasoningLevel: string | null;
  dailyLimit: number;
  /** Settings revision; null until the first save. */
  revision: number | null;
  /** Last four characters of the stored key; null until the first save. */
  keyLastFour: string | null;
  updatedBy: MeetingNoteAiSettingsUpdatedBy | null;
  updatedAt: TimeStampType | null;
}

/** A reasoning level an admin can pick for a model (non-secret matrix data). */
export interface MeetingNoteAiReasoningOption {
  id: string;
  label: string;
}

/** A curated model of a provider (non-secret matrix data). */
export interface MeetingNoteAiModelOption {
  id: string;
  label: string;
  reasoningLevels: MeetingNoteAiReasoningOption[];
  defaultReasoningLevel: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
}

export interface MeetingNoteAiProviderOption {
  id: MeetingNoteAiProvider;
  label: string;
  models: MeetingNoteAiModelOption[];
}

/** GET /api/companies/ai-settings. */
export interface MeetingNoteAiSettingsResponse {
  settings: MeetingNoteAiSettingsView;
  providers: MeetingNoteAiProviderOption[];
  /** Whether the caller may save (current admin of the company). */
  canManage: boolean;
}

/** PUT /api/companies/ai-settings body. `apiKey` is write-only; null keeps the stored key. */
export interface SaveMeetingNoteAiSettingsInput {
  /** The revision the admin edited; null for the first save. */
  expectedRevision: number | null;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  dailyLimit: number;
  apiKey: string | null;
}

// ---------------------------------------------------------------------------
// AI usage, processing operations, and tickets (Phase 6 T9; FR-015, FR-022,
// FR-023, FR-031). No shape here carries an API key or transcript text.
// ---------------------------------------------------------------------------

/**
 * Status of a processing operation. Counted toward the daily limit:
 * admitted, dispatched, succeeded, failed, discarded. Not counted: refunded
 * (listed pre-processing rejection) and released (never sent).
 */
export type MeetingNoteAiOperationStatus =
  | 'admitted'
  | 'dispatched'
  | 'succeeded'
  | 'failed'
  | 'discarded'
  | 'refunded'
  | 'released';

/** Settlement outcomes: `released` from admitted, the others from dispatched. */
export type MeetingNoteAiSettlementOutcome = Exclude<MeetingNoteAiOperationStatus, 'admitted' | 'dispatched'>;

/** A company's AI usage for one day (midnight to midnight, America/Sao_Paulo). */
export interface MeetingNoteAiUsage {
  limit: number;
  used: number;
  /** Usage day, YYYY-MM-DD in America/Sao_Paulo. */
  usageDay: string;
  /** ISO instant of the next 00:00 America/Sao_Paulo, when the count resets. */
  resetAt: TimeStampType;
}

/** POST /api/meeting-notes/[id]/ai/ticket — the provider notice (FR-015) and its signed ticket. */
export interface MeetingNoteAiTicketResponse {
  /** Opaque signed ticket for the start request; valid until `expiresAt`. */
  ticket: string;
  expiresAt: TimeStampType;
  provider: MeetingNoteAiProvider;
  model: string;
  reasoningLevel: string;
  settingsRevision: number;
  /** Note revision and transcript identity the ticket is bound to. */
  noteRevision: number;
  transcriptId: string;
  usage: MeetingNoteAiUsage & { limitReached: boolean };
}

// ---------------------------------------------------------------------------
// AI draft (Phase 6 T11; FR-016, FR-017). What a provider adapter returns
// after validating the model output against the shared draft schema. Names
// are exactly as written in the transcript; T12 resolves them to members.
// ---------------------------------------------------------------------------

/** Draft summary sections (FR-016: key points, decisions, next steps), in the transcript's language. */
export interface MeetingNoteAiDraftSummary {
  keyPoints: string[];
  decisions: string[];
  nextSteps: string[];
}

/** One suggested action item (≤100 per draft). */
export interface MeetingNoteAiDraftActionItem {
  /** 1–1,000 characters, trimmed. */
  description: string;
  /** Assignee as written in the transcript; null when none was named. */
  assigneeName: string | null;
}

export interface MeetingNoteAiDraft {
  summary: MeetingNoteAiDraftSummary;
  actionItems: MeetingNoteAiDraftActionItem[];
}

// ---------------------------------------------------------------------------
// AI processing start and Apply (Phase 6 T12; FR-015–FR-021, FR-031). The
// start route returns a REVIEWABLE draft: suggestions carry the name as
// written plus the locally resolved current member (or null), and the
// existing item they duplicate (or null). Nothing is stored until Apply.
// ---------------------------------------------------------------------------

/** A suggested action item as the review step shows it. */
export interface MeetingNoteAiDraftSuggestion {
  description: string;
  /** The assignee name exactly as the provider wrote it; null when none. */
  suggestedAssigneeName: string | null;
  /** The ONE current member the name resolved to (FR-017), else null (unassigned). */
  resolvedAssignee: { userId: string; displayName: string } | null;
  /** An existing item with the same description (case/accent-insensitive): arrives unchecked, "already exists". */
  duplicateOfItemId: string | null;
}

export interface MeetingNoteAiReviewDraft {
  summary: MeetingNoteAiDraftSummary;
  items: MeetingNoteAiDraftSuggestion[];
}

/** POST /api/meeting-notes/[id]/ai/process — 200 body. */
export interface MeetingNoteAiProcessResponse {
  operationId: string;
  status: MeetingNoteAiOperationStatus;
  /** true when the ticket's operation already existed: its status only, never a draft (FR-031). */
  replay: boolean;
  /** Draft source: the note revision and transcript identity at generation start (FR-018). */
  sourceRevision: number;
  transcriptId: string;
  /** Present only for a new operation that succeeded and passed the return-time recheck. */
  draft: MeetingNoteAiReviewDraft | null;
  /** The caller company's usage after settlement; null when it could not be read. */
  usage: MeetingNoteAiUsage | null;
}

/** One accepted item of an Apply. */
export interface MeetingNoteAiApplyItemInput {
  description: string;
  assigneeId: string | null;
  /** 'YYYY-MM-DD' or null. */
  dueDate: string | null;
}

/** POST /api/meeting-notes/[id]/ai/apply body. */
export interface MeetingNoteAiApplyInput {
  /** The draft's source revision (MeetingNoteAiProcessResponse.sourceRevision). */
  expectedRevision: number;
  /** The edited summary sections; all empty = keep the note's current summary (items-only Apply). */
  summary: MeetingNoteAiDraftSummary;
  items: MeetingNoteAiApplyItemInput[];
}

/** Result of public.apply_meeting_note_ai_draft. */
export interface MeetingNoteAiApplyResult extends MeetingNoteMutationResult {
  itemIds: string[];
  /** 0-based positions of accepted items whose description matched an existing item. */
  duplicateIndexes: number[];
}
