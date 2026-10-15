// src/hooks/ui/useMeetingNoteAiFlow.ts
// State of the note view's AI flow (Phase 6 T13; SPEC J5/J6, FR-015,
// FR-018, FR-019, FR-021, FR-023): idle → provider notice (ticket) →
// processing (cancellable) → review of the transient draft → Apply, with
// errors offering "Try again" (a NEW ticket, i.e. a new operation).
//
// The draft lives only in this hook's React state: never persisted, never
// in a query cache. The hook is used by the note view body, which is keyed by
// the signed-in scope (users.id + company) and the note id, so a scope change
// (sign-out, account switch, removal, company change) or another note mounts
// a fresh flow and the previous draft is gone; the draft also records the
// scope and note it belongs to and is dropped if they ever differ. Requests
// run through the scope fence (late answers of a retired scope run no
// callback), and every callback also checks that it belongs to the flow's
// latest attempt, so a Cancel or Discard is never overridden by a late answer.
// A draft response reaches this hook only after the processing mutation
// re-checked, with the user's session, that they still edit the note in the
// same company (useProcessMeetingNoteAi); lost access arrives as an error.
// Leaving the page aborts pending requests (FR-021).
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useApplyMeetingNoteAiDraft,
  useMeetingNoteAiTicket,
  useProcessMeetingNoteAi,
} from '@/hooks/mutations/useMeetingNoteAiMutations';
import { useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { useNotification } from '@/hooks/useNotification';
import {
  classifyMeetingNoteAiApplyError,
  classifyMeetingNoteAiError,
  type MeetingNoteAiFlowError,
} from '@/lib/meeting-notes/ai/client-flow-errors';
import { meetingNotesScopeKey } from '@/lib/meeting-notes/scope-fence';
import type {
  MeetingNoteAiApplyInput,
  MeetingNoteAiDraftSummary,
  MeetingNoteAiProcessResponse,
  MeetingNoteAiTicketResponse,
  MeetingNoteAiUsage,
} from '@/types/meeting-notes';

/** One suggested action item while it is being reviewed. */
export interface MeetingNoteAiEditableSuggestion {
  /** Stable React key within the draft. */
  key: string;
  description: string;
  /** users.id of a current member, or null (unassigned). */
  assigneeId: string | null;
  /** 'YYYY-MM-DD' or '' (none): a calendar date, never converted through Date. */
  dueDate: string;
  accepted: boolean;
  rejected: boolean;
  suggestedAssigneeName: string | null;
  resolvedAssignee: { userId: string; displayName: string } | null;
  duplicateOfItemId: string | null;
}

/** The transient draft under review (FR-018). */
export interface MeetingNoteAiEditableDraft {
  /** Scope (users.id:company.id) and note it was generated for. */
  scopeKey: string;
  noteId: string;
  operationId: string;
  /** Note revision and transcript identity at generation start: Apply's expectedRevision. */
  sourceRevision: number;
  transcriptId: string;
  summary: MeetingNoteAiDraftSummary;
  items: MeetingNoteAiEditableSuggestion[];
  usage: MeetingNoteAiUsage | null;
}

/** Why the notice is shown again. */
export type MeetingNoteAiNoticeBanner =
  | { kind: 'settings_changed'; providerLabel: string | null }
  | { kind: 'expired' };

export type MeetingNoteAiFlowState =
  | { phase: 'idle'; message: string | null }
  | { phase: 'preparing'; banner: MeetingNoteAiNoticeBanner | null }
  | { phase: 'notice'; ticket: MeetingNoteAiTicketResponse; banner: MeetingNoteAiNoticeBanner | null }
  | { phase: 'processing'; ticket: MeetingNoteAiTicketResponse }
  | { phase: 'error'; error: MeetingNoteAiFlowError }
  | {
      phase: 'review';
      draft: MeetingNoteAiEditableDraft;
      applying: boolean;
      applyError: string | null;
      /** Apply was refused because the note changed since the draft's source (FR-007). */
      conflict: boolean;
    };

export interface MeetingNoteAiFlow {
  state: MeetingNoteAiFlowState;
  /** Fetches a ticket and shows the provider notice ("Generate summary", "Reprocess", "Try again"). */
  start: () => void;
  /** "Process": starts the notice's operation. */
  confirm: () => void;
  /** Cancels a running processing (aborts the request). */
  cancel: () => void;
  /** Closes the notice or an error without processing. */
  close: () => void;
  /** Drops the draft. */
  discard: () => void;
  /** Applies the reviewed draft. */
  apply: () => void;
  updateDraft: (update: (draft: MeetingNoteAiEditableDraft) => MeetingNoteAiEditableDraft) => void;
}

const IDLE: MeetingNoteAiFlowState = { phase: 'idle', message: null };

function toEditableDraft(
  response: MeetingNoteAiProcessResponse,
  scopeKey: string,
  noteId: string
): MeetingNoteAiEditableDraft | null {
  if (!response.draft || response.replay || response.status !== 'succeeded') return null;
  return {
    scopeKey,
    noteId,
    operationId: response.operationId,
    sourceRevision: response.sourceRevision,
    transcriptId: response.transcriptId,
    summary: {
      keyPoints: [...response.draft.summary.keyPoints],
      decisions: [...response.draft.summary.decisions],
      nextSteps: [...response.draft.summary.nextSteps],
    },
    items: response.draft.items.map((item, index) => ({
      key: `${response.operationId}:${index}`,
      description: item.description,
      assigneeId: item.resolvedAssignee?.userId ?? null,
      dueDate: '',
      // FR-018: a suggestion that repeats an existing item arrives unchecked.
      accepted: item.duplicateOfItemId === null,
      rejected: false,
      suggestedAssigneeName: item.suggestedAssigneeName,
      resolvedAssignee: item.resolvedAssignee,
      duplicateOfItemId: item.duplicateOfItemId,
    })),
    usage: response.usage,
  };
}

/** The accepted, non-rejected items and the trimmed summary, as Apply takes them. */
export function meetingNoteAiApplyInput(draft: MeetingNoteAiEditableDraft): MeetingNoteAiApplyInput {
  const clean = (entries: string[]) => entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return {
    expectedRevision: draft.sourceRevision,
    summary: {
      keyPoints: clean(draft.summary.keyPoints),
      decisions: clean(draft.summary.decisions),
      nextSteps: clean(draft.summary.nextSteps),
    },
    items: draft.items
      .filter((item) => item.accepted && !item.rejected)
      .map((item) => ({
        description: item.description.trim(),
        assigneeId: item.assigneeId,
        dueDate: item.dueDate === '' ? null : item.dueDate,
      })),
  };
}

export function useMeetingNoteAiFlow(noteId: string): MeetingNoteAiFlow {
  const scope = useMeetingNotesScope();
  const scopeKey = scope ? meetingNotesScopeKey(scope) : null;
  const { showSuccess } = useNotification();
  const ticketRequest = useMeetingNoteAiTicket();
  const processRequest = useProcessMeetingNoteAi();
  const applyRequest = useApplyMeetingNoteAiDraft();
  const [state, setState] = useState<MeetingNoteAiFlowState>(IDLE);

  // Every request belongs to one attempt; any newer action makes older answers moot.
  const attempt = useRef(0);
  const cancelController = useRef<AbortController | null>(null);

  const abortProcessing = useCallback(() => {
    cancelController.current?.abort();
    cancelController.current = null;
  }, []);

  // Leaving the page cancels the processing request (FR-021).
  useEffect(() => abortProcessing, [abortProcessing]);

  const { mutate: requestTicket, reset: resetTicket } = ticketRequest;
  const { mutate: requestProcess, reset: resetProcess } = processRequest;
  const { mutate: requestApply, reset: resetApply } = applyRequest;

  const fail = useCallback((error: MeetingNoteAiFlowError) => {
    setState(error.kind === 'cancelled' ? { phase: 'idle', message: 'Processing was cancelled.' } : { phase: 'error', error });
  }, []);

  const openNotice = useCallback(
    (banner: MeetingNoteAiNoticeBanner | null) => {
      abortProcessing();
      const mine = ++attempt.current;
      setState({ phase: 'preparing', banner });
      requestTicket(
        { noteId },
        {
          onSuccess: (ticket) => {
            if (attempt.current !== mine) return;
            resetTicket();
            setState({ phase: 'notice', ticket, banner });
          },
          onError: (error) => {
            if (attempt.current !== mine) return;
            fail(classifyMeetingNoteAiError(error));
          },
        }
      );
    },
    [abortProcessing, fail, noteId, requestTicket, resetTicket]
  );

  const start = useCallback(() => openNotice(null), [openNotice]);

  const confirm = useCallback(() => {
    if (state.phase !== 'notice' || !scopeKey) return;
    const { ticket } = state;
    // FR-015/FR-031: a notice older than its ticket's 24 hours is shown again.
    if (Date.parse(ticket.expiresAt) <= Date.now()) {
      openNotice({ kind: 'expired' });
      return;
    }
    abortProcessing();
    const controller = new AbortController();
    cancelController.current = controller;
    const mine = ++attempt.current;
    const draftScope = scopeKey;
    setState({ phase: 'processing', ticket });
    requestProcess(
      { noteId, ticket: ticket.ticket, cancelSignal: controller.signal },
      {
        onSuccess: (response) => {
          if (attempt.current !== mine || controller.signal.aborted) return;
          cancelController.current = null;
          resetProcess();
          const draft = toEditableDraft(response, draftScope, noteId);
          if (!draft) {
            fail({ kind: 'failed', message: 'This processing ended without a draft. Try again.', retryable: true });
            return;
          }
          setState({ phase: 'review', draft, applying: false, applyError: null, conflict: false });
        },
        onError: (error) => {
          if (attempt.current !== mine) return;
          cancelController.current = null;
          const classified = classifyMeetingNoteAiError(error);
          if (classified.kind === 'settings_stale') {
            openNotice({ kind: 'settings_changed', providerLabel: classified.providerLabel });
          } else if (classified.kind === 'ticket_expired') {
            openNotice({ kind: 'expired' });
          } else {
            fail(classified);
          }
        },
      }
    );
  }, [abortProcessing, fail, noteId, openNotice, requestProcess, resetProcess, scopeKey, state]);

  const cancel = useCallback(() => {
    attempt.current += 1;
    abortProcessing();
    resetProcess();
    setState({ phase: 'idle', message: 'Processing was cancelled.' });
  }, [abortProcessing, resetProcess]);

  const close = useCallback(() => {
    attempt.current += 1;
    abortProcessing();
    resetTicket();
    setState(IDLE);
  }, [abortProcessing, resetTicket]);

  const discard = useCallback(() => {
    attempt.current += 1;
    resetProcess();
    resetApply();
    setState(IDLE);
  }, [resetApply, resetProcess]);

  const updateDraft = useCallback((update: (draft: MeetingNoteAiEditableDraft) => MeetingNoteAiEditableDraft) => {
    setState((current) => (current.phase === 'review' ? { ...current, draft: update(current.draft), applyError: null } : current));
  }, []);

  const apply = useCallback(() => {
    if (state.phase !== 'review' || state.applying || state.conflict) return;
    const { draft } = state;
    const mine = ++attempt.current;
    setState({ ...state, applying: true, applyError: null });
    requestApply(
      { noteId, input: meetingNoteAiApplyInput(draft) },
      {
        onSuccess: () => {
          if (attempt.current !== mine) return;
          resetApply();
          resetProcess();
          setState({ phase: 'idle', message: null });
          showSuccess({ description: 'Draft applied to the note.' });
        },
        onError: (error) => {
          if (attempt.current !== mine) return;
          const failure = classifyMeetingNoteAiApplyError(error);
          if (failure.kind === 'access_lost') {
            setState({ phase: 'error', error: { kind: 'access_lost' } });
            return;
          }
          setState((current) =>
            current.phase === 'review'
              ? {
                  ...current,
                  applying: false,
                  conflict: failure.kind === 'conflict',
                  applyError: failure.kind === 'conflict' ? null : failure.message,
                }
              : current
          );
        },
      }
    );
  }, [noteId, requestApply, resetApply, resetProcess, showSuccess, state]);

  // A draft of another scope or note is never shown (defence in depth: the
  // view is keyed by both, so this does not happen in normal use).
  const visible: MeetingNoteAiFlowState =
    state.phase === 'review' && (state.draft.scopeKey !== scopeKey || state.draft.noteId !== noteId) ? IDLE : state;

  return { state: visible, start, confirm, cancel, close, discard, apply, updateDraft };
}
