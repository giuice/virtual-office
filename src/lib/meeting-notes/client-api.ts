// src/lib/meeting-notes/client-api.ts
// Browser-side calls to the meeting-note routes (T3 notes, versions, and
// action items, T4 search, T7 Markdown export, T10 transcript uploads, T13 AI
// ticket / processing / Apply). The session cookie identifies the caller; the routes resolve the
// company and authorize every change, so nothing here is trusted for that.
// Every call takes an AbortSignal: reads get TanStack's, writes and the export
// get the scope fence's (useMeetingNotesScopedMutation), so a retired
// account's requests are aborted and their responses never applied.
import type { PaginatedResult } from '@/types/common';
import type {
  MeetingNoteActionItemFieldsInput,
  MeetingNoteActionItemView,
  MeetingNoteAiApplyInput,
  MeetingNoteAiApplyResult,
  MeetingNoteAiProcessResponse,
  MeetingNoteAiTicketResponse,
  MeetingNoteDetail,
  MeetingNoteListItem,
  MeetingNoteSearchResult,
  MeetingNoteVersionSummary,
  MeetingNoteVersionView,
} from '@/types/meeting-notes';

/** Notes per page in a space's Notes tab (the route allows 1..100). */
export const SPACE_NOTES_PAGE_SIZE = 20;
/** Results per page on the Meetings page (the route allows 1..50). */
export const MEETING_SEARCH_PAGE_SIZE = 20;

/**
 * A failed meeting-note request: HTTP status (0 = network), the route's error
 * code, and the non-sensitive hints the route sent next to them (e.g. the AI
 * routes' `limit`/`resetAt`, `settings`, `retryable`, `canConfigure`).
 */
export class MeetingNotesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(status: number, code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'MeetingNotesApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 409 MEETING_NOTE_STALE_REVISION: another change landed first. Carries the
 * note's current state as the route read it, so the UI can show it (FR-007).
 */
export class MeetingNoteConflictError extends MeetingNotesApiError {
  readonly currentRevision: number;
  readonly note: MeetingNoteDetail;

  constructor(message: string, currentRevision: number, note: MeetingNoteDetail) {
    super(409, 'MEETING_NOTE_STALE_REVISION', message);
    this.name = 'MeetingNoteConflictError';
    this.currentRevision = currentRevision;
    this.note = note;
  }
}

/**
 * 409 MEETING_NOTE_ITEM_STALE_REVISION: the action item changed first. Carries
 * the item's current state so the UI can show it and retry on it.
 */
export class MeetingNoteItemConflictError extends MeetingNotesApiError {
  readonly currentRevision: number;
  readonly item: MeetingNoteActionItemView;

  constructor(message: string, currentRevision: number, item: MeetingNoteActionItemView) {
    super(409, 'MEETING_NOTE_ITEM_STALE_REVISION', message);
    this.name = 'MeetingNoteItemConflictError';
    this.currentRevision = currentRevision;
    this.item = item;
  }
}

/** Retry only failures a retry can fix: network errors and 5xx (never 4xx/429). */
export function shouldRetryMeetingNotesRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof MeetingNotesApiError)) return false;
  return error.status === 0 || error.status >= 500;
}

export interface MeetingNotesPage<T> {
  items: T[];
  /** Offset of the next page; null when there is none. */
  nextCursor: number | null;
  hasMore: boolean;
  totalCount: number | null;
}

/** The search route's filters, already resolved to the route's parameters. */
export interface MeetingNoteSearchParams {
  /** Trimmed query; '' = list mode (newest meeting first). */
  q: string;
  /** Only this space; null = every space. Never set together with `spaceRemoved`. */
  spaceId: string | null;
  /** Only notes whose space was deleted. */
  spaceRemoved: boolean;
  /** ISO date-time with offset, inclusive. */
  from: string | null;
  /** ISO date-time with offset, exclusive. */
  to: string | null;
}

/** The editable fields of a note (content is sanitized again by the route). */
export interface MeetingNoteFieldsPayload {
  title: string;
  /** ISO 8601 date-time with offset. */
  meetingDate: string;
  content: string;
  participantIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function invalidResponse(status = 200): MeetingNotesApiError {
  return new MeetingNotesApiError(status, 'INVALID_RESPONSE', 'Unexpected response from the server.');
}

function isNoteDetail(value: unknown): value is MeetingNoteDetail {
  const note = asRecord(value);
  return (
    typeof note.id === 'string' &&
    typeof note.revision === 'number' &&
    typeof note.title === 'string' &&
    typeof note.content === 'string' &&
    Array.isArray(note.participants) &&
    typeof note.rights === 'object' &&
    note.rights !== null
  );
}

function isItemView(value: unknown): value is MeetingNoteActionItemView {
  const item = asRecord(value);
  return (
    typeof item.id === 'string' &&
    typeof item.noteId === 'string' &&
    typeof item.description === 'string' &&
    typeof item.revision === 'number' &&
    typeof item.completed === 'boolean'
  );
}

/** The error a failed response stands for; a stale-revision 409 with its note or item becomes a conflict. */
async function toApiError(response: Response): Promise<MeetingNotesApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await response.json());
  } catch {
    // Non-JSON error body.
  }
  const code = typeof body.code === 'string' ? body.code : `HTTP_${response.status}`;
  const message = typeof body.error === 'string' ? body.error : `Request failed (${response.status})`;
  if (response.status === 409 && code === 'MEETING_NOTE_STALE_REVISION' && isNoteDetail(body.note)) {
    const currentRevision = typeof body.currentRevision === 'number' ? body.currentRevision : body.note.revision;
    return new MeetingNoteConflictError(message, currentRevision, body.note);
  }
  if (response.status === 409 && code === 'MEETING_NOTE_ITEM_STALE_REVISION' && isItemView(body.item)) {
    const currentRevision = typeof body.currentRevision === 'number' ? body.currentRevision : body.item.revision;
    return new MeetingNoteItemConflictError(message, currentRevision, body.item);
  }
  // The hints only: never the note or item a body may carry.
  const { error: _error, code: _code, correlationId: _correlationId, note: _note, item: _item, ...details } = body;
  void [_error, _code, _correlationId, _note, _item];
  return new MeetingNotesApiError(response.status, code, message, details);
}

/** One JSON request to a meeting-note route; any failure becomes a MeetingNotesApiError. */
async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      // JSON bodies are strings; a FormData body gets its multipart boundary from fetch.
      headers: typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new MeetingNotesApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }
  if (!response.ok) throw await toApiError(response);
  try {
    return await response.json();
  } catch {
    throw invalidResponse(response.status);
  }
}

function toPage<T>(body: PaginatedResult<T>): MeetingNotesPage<T> {
  if (!body || !Array.isArray(body.items)) throw invalidResponse();
  const cursor = typeof body.nextCursor === 'number' ? body.nextCursor : Number(body.nextCursor);
  const hasMore = body.hasMore === true && Number.isInteger(cursor) && cursor >= 0;
  return {
    items: body.items,
    nextCursor: hasMore ? cursor : null,
    hasMore,
    totalCount: typeof body.totalCount === 'number' ? body.totalCount : null,
  };
}

async function getPage<T>(url: string, signal?: AbortSignal): Promise<MeetingNotesPage<T>> {
  const body = await requestJson(url, { method: 'GET', signal });
  return toPage(body as PaginatedResult<T>);
}

function readNote(body: unknown): MeetingNoteDetail {
  const note = asRecord(body).note;
  if (!isNoteDetail(note)) throw invalidResponse();
  return note;
}

function notePath(noteId: string): string {
  return `/api/meeting-notes/${encodeURIComponent(noteId)}`;
}

/** GET /api/meeting-notes — one space's notes, newest meeting date first. */
export function fetchSpaceMeetingNotes(
  spaceId: string,
  cursor: number,
  signal?: AbortSignal
): Promise<MeetingNotesPage<MeetingNoteListItem>> {
  const params = new URLSearchParams({
    spaceId,
    limit: String(SPACE_NOTES_PAGE_SIZE),
    cursor: String(cursor),
  });
  return getPage<MeetingNoteListItem>(`/api/meeting-notes?${params.toString()}`, signal);
}

/** GET /api/meeting-notes/search — company notes, ranked (or by date when `q` is empty). */
export function fetchMeetingNoteSearch(
  search: MeetingNoteSearchParams,
  cursor: number,
  signal?: AbortSignal
): Promise<MeetingNotesPage<MeetingNoteSearchResult>> {
  const params = new URLSearchParams({
    limit: String(MEETING_SEARCH_PAGE_SIZE),
    cursor: String(cursor),
  });
  if (search.q) params.set('q', search.q);
  if (search.spaceRemoved) params.set('removed', 'true');
  else if (search.spaceId) params.set('spaceId', search.spaceId);
  if (search.from) params.set('from', search.from);
  if (search.to) params.set('to', search.to);
  return getPage<MeetingNoteSearchResult>(`/api/meeting-notes/search?${params.toString()}`, signal);
}

/** GET /api/meeting-notes/[id] — the note view; with `includeTranscript`, also the stored transcript text. */
export async function fetchMeetingNoteDetail(
  noteId: string,
  options: { includeTranscript?: boolean } = {},
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  const query = options.includeTranscript ? '?include=transcript' : '';
  return readNote(await requestJson(`${notePath(noteId)}${query}`, { method: 'GET', signal }));
}

/** POST /api/meeting-notes — creates a note in a space of the caller's company. */
export async function createMeetingNote(
  spaceId: string,
  fields: MeetingNoteFieldsPayload,
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  return readNote(
    await requestJson('/api/meeting-notes', { method: 'POST', body: JSON.stringify({ spaceId, ...fields }), signal })
  );
}

/** PATCH /api/meeting-notes/[id] — full replacement against `expectedRevision` (409 → MeetingNoteConflictError). */
export async function updateMeetingNote(
  noteId: string,
  expectedRevision: number,
  fields: MeetingNoteFieldsPayload,
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  return readNote(
    await requestJson(notePath(noteId), {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision, ...fields }),
      signal,
    })
  );
}

/** POST /api/meeting-notes/[id]/restore — restores a version as a new version (409 → MeetingNoteConflictError). */
export async function restoreMeetingNoteVersion(
  noteId: string,
  expectedRevision: number,
  versionId: string,
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  return readNote(
    await requestJson(`${notePath(noteId)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision, versionId }),
      signal,
    })
  );
}

/** One transcript file (.txt/.vtt/.srt, at most 1 MB) as multipart form data with the given fields. */
function transcriptForm(file: File, fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set('file', file, file.name);
  return form;
}

/** POST /api/meeting-notes/transcript — "New note from transcript" in a space of the caller's company. */
export async function createMeetingNoteFromTranscript(
  spaceId: string,
  file: File,
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  return readNote(
    await requestJson('/api/meeting-notes/transcript', {
      method: 'POST',
      body: transcriptForm(file, { spaceId }),
      signal,
    })
  );
}

/** PUT /api/meeting-notes/[id]/transcript — replaces the stored transcript (409 → MeetingNoteConflictError). */
export async function attachMeetingNoteTranscript(
  noteId: string,
  expectedRevision: number,
  file: File,
  signal?: AbortSignal
): Promise<MeetingNoteDetail> {
  return readNote(
    await requestJson(`${notePath(noteId)}/transcript`, {
      method: 'PUT',
      body: transcriptForm(file, { expectedRevision: String(expectedRevision) }),
      signal,
    })
  );
}

/** DELETE /api/meeting-notes/[id]?expectedRevision=N (409 → MeetingNoteConflictError). */
export async function deleteMeetingNote(noteId: string, expectedRevision: number, signal?: AbortSignal): Promise<void> {
  const params = new URLSearchParams({ expectedRevision: String(expectedRevision) });
  await requestJson(`${notePath(noteId)}?${params.toString()}`, { method: 'DELETE', signal });
}

/** GET /api/meeting-notes/[id]/versions — the history, newest first. */
export async function fetchMeetingNoteVersions(
  noteId: string,
  signal?: AbortSignal
): Promise<{ revision: number; versions: MeetingNoteVersionSummary[] }> {
  const body = asRecord(await requestJson(`${notePath(noteId)}/versions`, { method: 'GET', signal }));
  if (!Array.isArray(body.versions) || typeof body.revision !== 'number') throw invalidResponse();
  return { revision: body.revision, versions: body.versions as MeetingNoteVersionSummary[] };
}

/** GET /api/meeting-notes/[id]/versions/[versionId] — one immutable version. */
export async function fetchMeetingNoteVersion(
  noteId: string,
  versionId: string,
  signal?: AbortSignal
): Promise<MeetingNoteVersionView> {
  const body = asRecord(
    await requestJson(`${notePath(noteId)}/versions/${encodeURIComponent(versionId)}`, { method: 'GET', signal })
  );
  const version = asRecord(body.version);
  if (typeof version.id !== 'string' || typeof version.content !== 'string' || !Array.isArray(version.participants)) {
    throw invalidResponse();
  }
  return body.version as MeetingNoteVersionView;
}

function itemPath(noteId: string, itemId?: string): string {
  const base = `${notePath(noteId)}/items`;
  return itemId === undefined ? base : `${base}/${encodeURIComponent(itemId)}`;
}

function readItem(body: unknown): MeetingNoteActionItemView {
  const item = asRecord(body).item;
  if (!isItemView(item)) throw invalidResponse();
  return item;
}

/** POST /api/meeting-notes/[id]/items — an editor adds an item (400 MEETING_NOTE_ITEM_LIMIT_REACHED at 100). */
export async function createMeetingNoteActionItem(
  noteId: string,
  fields: MeetingNoteActionItemFieldsInput,
  signal?: AbortSignal
): Promise<MeetingNoteActionItemView> {
  return readItem(await requestJson(itemPath(noteId), { method: 'POST', body: JSON.stringify(fields), signal }));
}

/** PATCH /api/meeting-notes/[id]/items/[itemId] — full replacement (409 → MeetingNoteItemConflictError). */
export async function updateMeetingNoteActionItem(
  noteId: string,
  itemId: string,
  expectedRevision: number,
  fields: MeetingNoteActionItemFieldsInput,
  signal?: AbortSignal
): Promise<MeetingNoteActionItemView> {
  return readItem(
    await requestJson(itemPath(noteId, itemId), {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision, ...fields }),
      signal,
    })
  );
}

/** DELETE /api/meeting-notes/[id]/items/[itemId]?expectedRevision=N (409 → MeetingNoteItemConflictError). */
export async function deleteMeetingNoteActionItem(
  noteId: string,
  itemId: string,
  expectedRevision: number,
  signal?: AbortSignal
): Promise<void> {
  const params = new URLSearchParams({ expectedRevision: String(expectedRevision) });
  await requestJson(`${itemPath(noteId, itemId)}?${params.toString()}`, { method: 'DELETE', signal });
}

/** PUT /api/meeting-notes/[id]/items/[itemId]/completion — editors and the current assignee. */
export async function setMeetingNoteActionItemCompleted(
  noteId: string,
  itemId: string,
  expectedRevision: number,
  completed: boolean,
  signal?: AbortSignal
): Promise<MeetingNoteActionItemView> {
  return readItem(
    await requestJson(`${itemPath(noteId, itemId)}/completion`, {
      method: 'PUT',
      body: JSON.stringify({ expectedRevision, completed }),
      signal,
    })
  );
}

export interface MeetingNoteMarkdownFile {
  blob: Blob;
  filename: string;
}

/** The download name the route chose (`filename*` first), or a fallback. */
function filenameFrom(disposition: string | null): string {
  const fallback = 'meeting-note.md';
  if (!disposition) return fallback;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim()) || fallback;
    } catch {
      // Malformed encoding: use the plain name.
    }
  }
  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain?.[1] || fallback;
}

/**
 * GET /api/meeting-notes/[id]/export — the note as a .md file (FR-027). The
 * meeting date is written as a calendar day in `timeZone` (the viewer's).
 */
export async function fetchMeetingNoteMarkdown(
  noteId: string,
  options: { includeTranscript: boolean; timeZone: string },
  signal?: AbortSignal
): Promise<MeetingNoteMarkdownFile> {
  const params = new URLSearchParams({
    includeTranscript: options.includeTranscript ? 'true' : 'false',
    timeZone: options.timeZone,
  });
  let response: Response;
  try {
    response = await fetch(`${notePath(noteId)}/export?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new MeetingNotesApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }
  if (!response.ok) throw await toApiError(response);
  return { blob: await response.blob(), filename: filenameFrom(response.headers.get('content-disposition')) };
}

// ---------------------------------------------------------------------------
// AI processing (T13 UI over the T9/T12 routes; FR-015, FR-018, FR-021, FR-031).
// The ticket carries the provider notice; one ticket starts one operation
// ("Try again" asks for a new ticket). AI text is data: render it as text only.
// ---------------------------------------------------------------------------

function isAiTicket(value: unknown): value is MeetingNoteAiTicketResponse {
  const body = asRecord(value);
  const usage = asRecord(body.usage);
  return (
    typeof body.ticket === 'string' &&
    typeof body.expiresAt === 'string' &&
    typeof body.provider === 'string' &&
    typeof body.model === 'string' &&
    typeof body.settingsRevision === 'number' &&
    typeof body.noteRevision === 'number' &&
    typeof usage.limit === 'number' &&
    typeof usage.used === 'number' &&
    typeof usage.resetAt === 'string'
  );
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isReviewDraft(value: unknown): boolean {
  const draft = asRecord(value);
  const summary = asRecord(draft.summary);
  return (
    isStringList(summary.keyPoints) &&
    isStringList(summary.decisions) &&
    isStringList(summary.nextSteps) &&
    Array.isArray(draft.items) &&
    draft.items.every((item) => typeof asRecord(item).description === 'string')
  );
}

function isAiProcessResponse(value: unknown): value is MeetingNoteAiProcessResponse {
  const body = asRecord(value);
  return (
    typeof body.operationId === 'string' &&
    typeof body.status === 'string' &&
    typeof body.replay === 'boolean' &&
    typeof body.sourceRevision === 'number' &&
    typeof body.transcriptId === 'string' &&
    (body.draft === null || isReviewDraft(body.draft))
  );
}

/** POST /api/meeting-notes/[id]/ai/ticket — the provider notice, today's usage, and a signed ticket. */
export async function fetchMeetingNoteAiTicket(noteId: string, signal?: AbortSignal): Promise<MeetingNoteAiTicketResponse> {
  const body = await requestJson(`${notePath(noteId)}/ai/ticket`, { method: 'POST', signal });
  if (!isAiTicket(body)) throw invalidResponse();
  return body;
}

/**
 * POST /api/meeting-notes/[id]/ai/process — starts the ticket's operation and
 * waits for its draft (several minutes at most for a long transcript: the
 * server's provider deadline is 180 s by default, up to 300 s). Aborting `signal` cancels the
 * request; the server then aborts the provider call and discards the draft.
 */
export async function processMeetingNoteAiDraft(
  noteId: string,
  ticket: string,
  signal?: AbortSignal
): Promise<MeetingNoteAiProcessResponse> {
  const body = await requestJson(`${notePath(noteId)}/ai/process`, {
    method: 'POST',
    body: JSON.stringify({ ticket }),
    signal,
  });
  if (!isAiProcessResponse(body)) throw invalidResponse();
  return body;
}

export interface MeetingNoteAiApplyResponse {
  note: MeetingNoteDetail;
  /** The route returns the result without the note id (it is the path's). */
  applied: Omit<MeetingNoteAiApplyResult, 'noteId'>;
}

/** POST /api/meeting-notes/[id]/ai/apply — at the draft's source revision (409 → MeetingNoteConflictError). */
export async function applyMeetingNoteAiDraft(
  noteId: string,
  input: MeetingNoteAiApplyInput,
  signal?: AbortSignal
): Promise<MeetingNoteAiApplyResponse> {
  const body = await requestJson(`${notePath(noteId)}/ai/apply`, {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });
  const applied = asRecord(asRecord(body).applied);
  if (typeof applied.versionId !== 'string' || !Array.isArray(applied.itemIds)) throw invalidResponse();
  return { note: readNote(body), applied: applied as unknown as MeetingNoteAiApplyResponse['applied'] };
}
