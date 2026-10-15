// src/lib/meeting-notes/note-detail.ts
// Phase 6 FR-005 / BR-003: composes a note view from repository reads made
// with the caller's session (RLS: members of the note's company) and derives
// the caller's rights on the state that was read. The database re-checks every
// right on write; these flags only drive the UI.
import type { IMeetingNoteRepository } from '@/repositories/interfaces/IMeetingNoteRepository';
import type { ActionItem, MeetingNote, User } from '@/types/database';
import type {
  MeetingNoteActionItemView,
  MeetingNoteDetail,
  MeetingNoteRights,
  MeetingNoteVersion,
  MeetingNoteVersionParticipant,
  MeetingNoteVersionView,
} from '@/types/meeting-notes';

export interface MeetingNoteDetailOptions {
  /** Include the stored transcript text (up to 1 MB). */
  includeTranscript?: boolean;
}

/** BR-003 on a read state: author, current participant, or admin, each while a member. */
export function computeMeetingNoteRights(
  viewer: Pick<User, 'id' | 'companyId' | 'role'>,
  note: Pick<MeetingNote, 'companyId' | 'authorUserId'>,
  participantIds: readonly string[]
): MeetingNoteRights {
  if (!viewer.companyId || viewer.companyId !== note.companyId) {
    return { canEdit: false, canDelete: false };
  }
  const isAdmin = viewer.role === 'admin';
  const isAuthor = note.authorUserId === viewer.id;
  return {
    canEdit: isAdmin || isAuthor || participantIds.includes(viewer.id),
    canDelete: isAdmin || isAuthor,
  };
}

export function toActionItemViews(
  items: readonly ActionItem[],
  currentMemberIds: ReadonlySet<string>
): MeetingNoteActionItemView[] {
  return items.map((item) => ({
    ...item,
    assigneeIsCurrentMember: item.assigneeId === null ? null : currentMemberIds.has(item.assigneeId),
  }));
}

/** Action items with their assignee-membership flag. */
export async function loadActionItemViews(
  repository: IMeetingNoteRepository,
  companyId: string | null,
  items: readonly ActionItem[]
): Promise<MeetingNoteActionItemView[]> {
  const assigneeIds = items.flatMap((item) => (item.assigneeId ? [item.assigneeId] : []));
  const members = companyId ? await repository.findCurrentMemberIds(companyId, assigneeIds) : new Set<string>();
  return toActionItemViews(items, members);
}

/** The note view, or null when the note is missing or not visible to the caller. */
export async function loadMeetingNoteDetail(
  repository: IMeetingNoteRepository,
  viewer: Pick<User, 'id' | 'companyId' | 'role'>,
  noteId: string,
  options: MeetingNoteDetailOptions = {}
): Promise<MeetingNoteDetail | null> {
  const note = await repository.findById(noteId);
  if (!note) return null;

  const [participants, items, spaceName, transcript] = await Promise.all([
    repository.findParticipants(note.id),
    repository.findActionItems(note.id),
    note.roomId ? repository.findSpaceName(note.roomId) : Promise.resolve(null),
    options.includeTranscript && note.transcriptId ? repository.findTranscript(note.id) : Promise.resolve(null),
  ]);

  const participantIds = participants.map((participant) => participant.userId);
  const assigneeIds = items.flatMap((item) => (item.assigneeId ? [item.assigneeId] : []));
  const members = await repository.findCurrentMemberIds(note.companyId, [...participantIds, ...assigneeIds]);

  const detail: MeetingNoteDetail = {
    ...note,
    spaceName,
    participants: participants.map((participant: MeetingNoteVersionParticipant) => ({
      ...participant,
      isCurrentMember: members.has(participant.userId),
    })),
    actionItems: toActionItemViews(items, members),
    hasTranscript: note.transcriptId !== null,
    rights: computeMeetingNoteRights(viewer, note, participantIds),
  };
  if (options.includeTranscript) {
    detail.transcript = transcript;
  }
  return detail;
}

/**
 * A version with each participant snapshot flagged as a current member of
 * `companyId` or not (FR-030: "Former member" in versions too). Names stay the
 * snapshot the version recorded.
 */
export async function loadMeetingNoteVersionView(
  repository: IMeetingNoteRepository,
  companyId: string,
  version: MeetingNoteVersion
): Promise<MeetingNoteVersionView> {
  const members = await repository.findCurrentMemberIds(
    companyId,
    version.participants.map((participant) => participant.userId)
  );
  return {
    ...version,
    participants: version.participants.map((participant) => ({
      ...participant,
      isCurrentMember: members.has(participant.userId),
    })),
  };
}
