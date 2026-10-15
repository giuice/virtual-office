// src/repositories/implementations/supabase/SupabaseMeetingNoteRepository.ts
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import { MeetingNoteDbError } from '@/lib/meeting-notes/errors';
import { parseMeetingNoteExcerpt } from '@/lib/meeting-notes/search-excerpt';
import type { ActionItem, MeetingNote, NoteGenerator } from '@/types/database';
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

interface MeetingNoteRow {
  id: string;
  company_id: string;
  room_id: string | null;
  title: string;
  meeting_date: string;
  content: string;
  summary: string | null;
  transcript_id: string | null;
  generated_by: NoteGenerator;
  author_user_id: string;
  author_name: string;
  edited_by: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

type MeetingNoteListRow = Pick<
  MeetingNoteRow,
  | 'id'
  | 'room_id'
  | 'title'
  | 'meeting_date'
  | 'author_user_id'
  | 'author_name'
  | 'summary'
  | 'transcript_id'
  | 'revision'
  | 'created_at'
  | 'updated_at'
>;

interface ActionItemRow {
  id: string;
  note_id: string;
  description: string;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  completed: boolean;
  revision: number;
  creator_user_id: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
}

interface VersionSummaryRow {
  id: string;
  note_id: string;
  revision: number;
  title: string;
  meeting_date: string;
  editor_user_id: string;
  editor_name: string;
  created_at: string;
}

interface VersionRow extends VersionSummaryRow {
  participants: unknown;
  content: string;
  summary: string | null;
}

interface SearchRow {
  note_id: string;
  room_id: string | null;
  title: string;
  meeting_date: string;
  author_user_id: string;
  author_name: string;
  has_summary: boolean;
  has_transcript: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  relevance: number | null;
  excerpt_field: string | null;
  excerpt: string | null;
  total_count: number;
}

interface MutationRow {
  note_id: string;
  revision: number;
  version_id: string;
}

interface TranscriptMutationRow extends MutationRow {
  transcript_id: string;
}

// Never the transcript: it can be up to 1 MB (findTranscript reads it).
const NOTE_COLUMNS =
  'id, company_id, room_id, title, meeting_date, content, summary, transcript_id, generated_by, author_user_id, author_name, edited_by, revision, created_at, updated_at';
const LIST_COLUMNS =
  'id, room_id, title, meeting_date, author_user_id, author_name, summary, transcript_id, revision, created_at, updated_at';
const ITEM_COLUMNS =
  'id, note_id, description, assignee_id, assignee_name, due_date, completed, revision, creator_user_id, creator_name, created_at, updated_at';
const VERSION_SUMMARY_COLUMNS = 'id, note_id, revision, title, meeting_date, editor_user_id, editor_name, created_at';

const DEFAULT_PAGE_SIZE = 20;

function toDbError(error: PostgrestError): MeetingNoteDbError {
  return new MeetingNoteDbError(error.code, error.message, error.details);
}

function mapNote(row: MeetingNoteRow): MeetingNote {
  return {
    id: row.id,
    companyId: row.company_id,
    roomId: row.room_id,
    title: row.title,
    meetingDate: row.meeting_date,
    content: row.content,
    summary: row.summary,
    transcriptId: row.transcript_id,
    generatedBy: row.generated_by,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    editedBy: row.edited_by,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapListItem(row: MeetingNoteListRow): MeetingNoteListItem {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    meetingDate: row.meeting_date,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    hasSummary: row.summary !== null,
    hasTranscript: row.transcript_id !== null,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSearchRow(row: SearchRow): MeetingNoteSearchResult {
  return {
    id: row.note_id,
    roomId: row.room_id,
    title: row.title,
    meetingDate: row.meeting_date,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    hasSummary: row.has_summary,
    hasTranscript: row.has_transcript,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relevance: row.relevance === null ? null : Number(row.relevance),
    excerpt: parseMeetingNoteExcerpt(row.excerpt_field, row.excerpt),
  };
}

function mapActionItem(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    noteId: row.note_id,
    description: row.description,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    dueDate: row.due_date,
    completed: row.completed,
    revision: Number(row.revision),
    creatorUserId: row.creator_user_id,
    creatorName: row.creator_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionSummary(row: VersionSummaryRow): MeetingNoteVersionSummary {
  return {
    id: row.id,
    noteId: row.note_id,
    revision: Number(row.revision),
    title: row.title,
    meetingDate: row.meeting_date,
    editorUserId: row.editor_user_id,
    editorName: row.editor_name,
    createdAt: row.created_at,
  };
}

function mapVersionParticipants(value: unknown): MeetingNoteVersionParticipant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { user_id: userId, display_name: displayName } = entry as Record<string, unknown>;
    return typeof userId === 'string' && typeof displayName === 'string' ? [{ userId, displayName }] : [];
  });
}

function mapMutation(row: MutationRow): MeetingNoteMutationResult {
  return { noteId: row.note_id, revision: Number(row.revision), versionId: row.version_id };
}

function mapTranscriptMutation(row: TranscriptMutationRow): MeetingNoteTranscriptMutationResult {
  return { ...mapMutation(row), transcriptId: row.transcript_id };
}

export class SupabaseMeetingNoteRepository implements IMeetingNoteRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async findById(id: string): Promise<MeetingNote | null> {
    const { data, error } = await this.client
      .from('meeting_notes')
      .select(NOTE_COLUMNS)
      .eq('id', id)
      .maybeSingle<MeetingNoteRow>();
    if (error) throw toDbError(error);
    return data ? mapNote(data) : null;
  }

  async findByRoom(roomId: string, options?: PaginationOptions): Promise<PaginatedResult<MeetingNoteListItem>> {
    const limit = options?.limit ?? DEFAULT_PAGE_SIZE;
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    const { data, error, count } = await this.client
      .from('meeting_notes')
      .select(LIST_COLUMNS, { count: 'exact' })
      .eq('room_id', roomId)
      .order('meeting_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
      .overrideTypes<MeetingNoteListRow[], { merge: false }>();
    if (error) throw toDbError(error);

    const items = (data ?? []).map(mapListItem);
    const nextCursor = count !== null ? (to + 1 < count ? to + 1 : null) : items.length === limit ? to + 1 : null;
    return { items, nextCursor, hasMore: nextCursor !== null, totalCount: count ?? undefined };
  }

  async searchNotes(input: MeetingNoteSearchInput): Promise<PaginatedResult<MeetingNoteSearchResult>> {
    const { data, error } = await this.client.rpc('search_meeting_notes', {
      p_query: input.query,
      p_room_id: input.spaceId,
      p_space_removed: input.spaceRemoved,
      p_meeting_from: input.meetingFrom,
      p_meeting_to: input.meetingTo,
      p_limit: input.limit,
      p_offset: input.offset,
    });
    if (error) throw toDbError(error);
    if (data !== null && !Array.isArray(data)) {
      throw new MeetingNoteDbError(undefined, 'search_meeting_notes returned no rows array', null);
    }

    // RETURNS TABLE (SearchRow columns); the client is untyped.
    const rows = (data ?? []) as SearchRow[];
    const items = rows.map(mapSearchRow);
    // total_count is the same on every row; an empty page past the end has none.
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : input.offset === 0 ? 0 : undefined;
    const end = input.offset + items.length;
    const nextCursor = totalCount !== undefined && end < totalCount ? end : null;
    return { items, nextCursor, hasMore: nextCursor !== null, totalCount };
  }

  async findParticipants(noteId: string): Promise<MeetingNoteVersionParticipant[]> {
    const { data, error } = await this.client
      .from('meeting_note_participants')
      .select('user_id, display_name')
      .eq('note_id', noteId)
      .order('sort_order', { ascending: true })
      .overrideTypes<{ user_id: string; display_name: string }[], { merge: false }>();
    if (error) throw toDbError(error);
    return (data ?? []).map((row) => ({ userId: row.user_id, displayName: row.display_name }));
  }

  async findActionItems(noteId: string): Promise<ActionItem[]> {
    const { data, error } = await this.client
      .from('meeting_note_action_items')
      .select(ITEM_COLUMNS)
      .eq('note_id', noteId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .overrideTypes<ActionItemRow[], { merge: false }>();
    if (error) throw toDbError(error);
    return (data ?? []).map(mapActionItem);
  }

  async findActionItemById(itemId: string): Promise<ActionItem | null> {
    const { data, error } = await this.client
      .from('meeting_note_action_items')
      .select(ITEM_COLUMNS)
      .eq('id', itemId)
      .maybeSingle<ActionItemRow>();
    if (error) throw toDbError(error);
    return data ? mapActionItem(data) : null;
  }

  async findTranscript(noteId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('meeting_notes')
      .select('transcript')
      .eq('id', noteId)
      .maybeSingle<{ transcript: string | null }>();
    if (error) throw toDbError(error);
    return data?.transcript ?? null;
  }

  async findSpaceName(roomId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('spaces')
      .select('name')
      .eq('id', roomId)
      .maybeSingle<{ name: string }>();
    if (error) throw toDbError(error);
    return data?.name ?? null;
  }

  async findCurrentMemberIds(companyId: string, userIds: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Set();
    const { data, error } = await this.client
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .in('id', unique)
      .overrideTypes<{ id: string }[], { merge: false }>();
    if (error) throw toDbError(error);
    return new Set((data ?? []).map((row) => row.id));
  }

  async listCurrentMembers(companyId: string): Promise<Array<{ userId: string; displayName: string }>> {
    const { data, error } = await this.client
      .from('users')
      .select('id, display_name')
      .eq('company_id', companyId)
      .order('id', { ascending: true })
      .overrideTypes<{ id: string; display_name: string | null }[], { merge: false }>();
    if (error) throw toDbError(error);
    return (data ?? []).map((row) => ({ userId: row.id, displayName: row.display_name ?? '' }));
  }

  async listVersions(noteId: string): Promise<MeetingNoteVersionSummary[]> {
    const { data, error } = await this.client
      .from('meeting_note_versions')
      .select(VERSION_SUMMARY_COLUMNS)
      .eq('note_id', noteId)
      .order('revision', { ascending: false })
      .overrideTypes<VersionSummaryRow[], { merge: false }>();
    if (error) throw toDbError(error);
    return (data ?? []).map(mapVersionSummary);
  }

  async findVersion(noteId: string, versionId: string): Promise<MeetingNoteVersion | null> {
    const { data, error } = await this.client
      .from('meeting_note_versions')
      .select(`${VERSION_SUMMARY_COLUMNS}, participants, content, summary`)
      .eq('note_id', noteId)
      .eq('id', versionId)
      .maybeSingle<VersionRow>();
    if (error) throw toDbError(error);
    if (!data) return null;
    return {
      ...mapVersionSummary(data),
      participants: mapVersionParticipants(data.participants),
      content: data.content,
      summary: data.summary,
    };
  }

  async createNote(input: CreateMeetingNoteInput): Promise<MeetingNoteMutationResult> {
    return mapMutation(
      await this.rpc<MutationRow>('create_meeting_note', {
        p_room_id: input.roomId,
        p_title: input.title,
        p_meeting_date: input.meetingDate,
        p_content: input.content,
        p_participant_ids: input.participantIds,
      })
    );
  }

  async updateNote(input: UpdateMeetingNoteInput): Promise<MeetingNoteMutationResult> {
    return mapMutation(
      await this.rpc<MutationRow>('update_meeting_note', {
        p_note_id: input.noteId,
        p_expected_revision: input.expectedRevision,
        p_title: input.title,
        p_meeting_date: input.meetingDate,
        p_content: input.content,
        p_participant_ids: input.participantIds,
      })
    );
  }

  async restoreVersion(noteId: string, expectedRevision: number, versionId: string): Promise<MeetingNoteMutationResult> {
    return mapMutation(
      await this.rpc<MutationRow>('restore_meeting_note_version', {
        p_note_id: noteId,
        p_expected_revision: expectedRevision,
        p_version_id: versionId,
      })
    );
  }

  async deleteNote(noteId: string, expectedRevision: number): Promise<void> {
    await this.rpc<unknown>('delete_meeting_note', { p_note_id: noteId, p_expected_revision: expectedRevision });
  }

  async createNoteFromTranscript(
    input: CreateMeetingNoteFromTranscriptInput
  ): Promise<MeetingNoteTranscriptMutationResult> {
    return mapTranscriptMutation(
      await this.rpc<TranscriptMutationRow>('create_meeting_note_from_transcript', {
        p_room_id: input.roomId,
        p_title: input.title,
        p_transcript: input.transcript,
      })
    );
  }

  async attachTranscript(input: AttachMeetingNoteTranscriptInput): Promise<MeetingNoteTranscriptMutationResult> {
    return mapTranscriptMutation(
      await this.rpc<TranscriptMutationRow>('attach_meeting_note_transcript', {
        p_note_id: input.noteId,
        p_expected_revision: input.expectedRevision,
        p_transcript: input.transcript,
      })
    );
  }

  async createActionItem(input: CreateMeetingNoteActionItemInput): Promise<ActionItem> {
    return mapActionItem(
      await this.rpc<ActionItemRow>('create_meeting_note_action_item', {
        p_note_id: input.noteId,
        p_description: input.description,
        p_assignee_id: input.assigneeId,
        p_due_date: input.dueDate,
      })
    );
  }

  async updateActionItem(input: UpdateMeetingNoteActionItemInput): Promise<ActionItem> {
    return mapActionItem(
      await this.rpc<ActionItemRow>('update_meeting_note_action_item', {
        p_item_id: input.itemId,
        p_expected_revision: input.expectedRevision,
        p_description: input.description,
        p_assignee_id: input.assigneeId,
        p_due_date: input.dueDate,
      })
    );
  }

  async setActionItemCompleted(itemId: string, expectedRevision: number, completed: boolean): Promise<ActionItem> {
    return mapActionItem(
      await this.rpc<ActionItemRow>('set_meeting_note_action_item_completed', {
        p_item_id: itemId,
        p_expected_revision: expectedRevision,
        p_completed: completed,
      })
    );
  }

  async deleteActionItem(itemId: string, expectedRevision: number): Promise<void> {
    await this.rpc<unknown>('delete_meeting_note_action_item', {
      p_item_id: itemId,
      p_expected_revision: expectedRevision,
    });
  }

  async applyAiDraft(input: {
    noteId: string;
    expectedRevision: number;
    summary: string | null;
    items: readonly MeetingNoteAiApplyItemInput[];
  }): Promise<MeetingNoteAiApplyResult> {
    const row = await this.rpc<{
      note_id: string;
      revision: number;
      version_id: string;
      item_ids: string[];
      duplicate_indexes: number[];
    }>('apply_meeting_note_ai_draft', {
      p_note_id: input.noteId,
      p_expected_revision: input.expectedRevision,
      p_summary: input.summary,
      p_items: input.items.map((item) => ({
        description: item.description,
        assignee_id: item.assigneeId,
        due_date: item.dueDate,
      })),
    });
    return {
      noteId: row.note_id,
      revision: Number(row.revision),
      versionId: row.version_id,
      itemIds: row.item_ids ?? [],
      duplicateIndexes: row.duplicate_indexes ?? [],
    };
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw toDbError(error);
    if (data === null || data === undefined) {
      throw new MeetingNoteDbError(undefined, `${fn} returned no result`, null);
    }
    return data as T;
  }
}
