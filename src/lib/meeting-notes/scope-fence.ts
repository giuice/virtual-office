// src/lib/meeting-notes/scope-fence.ts
// Browser-side scope fence of the meeting-notes client layer (Phase 6
// FR-021 browser clause; block B review B-1/B-2). A scope is the signed-in
// application users.id plus the company id. Every meeting-note request a
// mutation starts registers an AbortController under the scope it started
// in; when that scope retires (sign-out, account switch, company change),
// MeetingNotesScopeBoundary aborts those requests and late callbacks of the
// retired scope are dropped (no download, no cache write, no toast).
//
// The current scope is written only by MeetingNotesScopeBoundary (mounted
// once in the root layout, inside CompanyProvider). Until it has run, no
// scope is current, so nothing a mutation returns is applied.

export interface MeetingNotesScope {
  /** Application users.id (never auth.uid()). */
  userId: string;
  companyId: string;
}

/** What a scoped mutation's onMutate returns: the scope it started in. */
export interface MeetingNotesMutationOrigin {
  scope: MeetingNotesScope;
}

let currentKey: string | null = null;
const inFlight = new Map<string, Set<AbortController>>();

export function meetingNotesScopeKey(scope: MeetingNotesScope): string {
  return `${scope.userId}:${scope.companyId}`;
}

/** Called by MeetingNotesScopeBoundary whenever the signed-in scope changes. */
export function setCurrentMeetingNotesScope(scope: MeetingNotesScope | null): void {
  currentKey = scope ? meetingNotesScopeKey(scope) : null;
}

/** Whether `scope` is still the signed-in user's scope. */
export function isCurrentMeetingNotesScope(scope: MeetingNotesScope | null | undefined): boolean {
  return Boolean(scope) && currentKey !== null && currentKey === meetingNotesScopeKey(scope as MeetingNotesScope);
}

/** Whether a mutation's onMutate result names the current scope. */
export function isCurrentMeetingNotesOrigin(origin: unknown): origin is MeetingNotesMutationOrigin {
  if (!origin || typeof origin !== 'object' || !('scope' in origin)) return false;
  return isCurrentMeetingNotesScope((origin as MeetingNotesMutationOrigin).scope);
}

/**
 * A controller for one request of `scope`; aborted at once when the scope is
 * not current, otherwise when it retires. Release it when the request settles.
 */
export function openMeetingNotesRequest(scope: MeetingNotesScope): AbortController {
  const controller = new AbortController();
  if (!isCurrentMeetingNotesScope(scope)) {
    controller.abort();
    return controller;
  }
  const key = meetingNotesScopeKey(scope);
  const set = inFlight.get(key) ?? new Set<AbortController>();
  set.add(controller);
  inFlight.set(key, set);
  return controller;
}

export function releaseMeetingNotesRequest(scope: MeetingNotesScope, controller: AbortController): void {
  const key = meetingNotesScopeKey(scope);
  const set = inFlight.get(key);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) inFlight.delete(key);
}

/** Aborts every request still in flight for `scope`. */
export function abortMeetingNotesScopeRequests(scope: MeetingNotesScope): void {
  const key = meetingNotesScopeKey(scope);
  const set = inFlight.get(key);
  inFlight.delete(key);
  set?.forEach((controller) => controller.abort());
}
