// src/components/meeting-notes/MeetingNoteAiPanel.tsx
// The AI controls of a note view, for editors only (Phase 6 J5/J6, FR-015,
// FR-018, FR-019, FR-021, FR-023, FR-025; viewers see the stored summary
// only). Without a configured provider the controls are disabled with "An
// admin needs to configure AI" and admins get a link to the settings. With a
// stored transcript: "Generate summary" (or "Reprocess transcript" once the
// note has a summary) → provider notice → "Process" → progress with "Cancel"
// → review and "Apply"; failures show what happened and "Try again" (a new
// operation). The flow's state lives in the note view (useMeetingNoteAiFlow),
// so it survives switching to the edit form and dies with the page.
'use client';

import Link from 'next/link';
import { Loader2, Settings, Sparkles, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useCompany } from '@/contexts/CompanyContext';
import { useMeetingNoteAiSettings } from '@/hooks/queries/useMeetingNoteAiSettings';
import type { MeetingNoteAiFlow } from '@/hooks/ui/useMeetingNoteAiFlow';
import { describeMeetingNoteAiFlowError } from '@/lib/meeting-notes/ai/client-flow-errors';
import { AI_SETTINGS_PATH } from '@/lib/meeting-notes/ui-paths';
import type { MeetingNoteAiProviderOption, MeetingNoteAiTicketResponse, MeetingNoteDetail } from '@/types/meeting-notes';
import { MeetingNoteAiNotice, MeetingNoteAiNoticeLoading } from './MeetingNoteAiNotice';
import { MeetingNoteAiReview } from './MeetingNoteAiReview';

export interface MeetingNoteAiPanelProps {
  note: MeetingNoteDetail;
  flow: MeetingNoteAiFlow;
}

function labelsFor(ticket: MeetingNoteAiTicketResponse, providers: readonly MeetingNoteAiProviderOption[]) {
  const provider = providers.find((option) => option.id === ticket.provider);
  const model = provider?.models.find((option) => option.id === ticket.model);
  return { providerLabel: provider?.label ?? ticket.provider, modelLabel: model?.label ?? ticket.model };
}

function NotConfigured({ canConfigure }: { canConfigure: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-testid="meeting-note-ai-not-configured">
      <div>
        <Button type="button" size="sm" className="gap-1.5" disabled data-testid="meeting-note-ai-start">
          <Sparkles className="size-4" aria-hidden="true" />
          Generate summary
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        An admin needs to configure AI.
      </p>
      {canConfigure ? (
        <Button asChild size="sm" variant="outline" className="w-fit gap-1.5">
          <Link href={AI_SETTINGS_PATH} data-testid="meeting-note-ai-settings-link">
            <Settings className="size-4" aria-hidden="true" />
            Open AI settings
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Processing({ providerLabel, onCancel }: { providerLabel: string; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--vo-line-soft)] p-4" data-testid="meeting-note-ai-progress">
      <p className="flex min-w-0 flex-1 items-center gap-2 text-sm" role="status" aria-live="polite">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        Processing the transcript with {providerLabel}… This can take a few minutes for long transcripts. Leaving this page cancels it.
      </p>
      <Button
        ref={cancelRef}
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={onCancel}
        data-testid="meeting-note-ai-cancel"
      >
        <X className="size-4" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}

function FlowError({
  message,
  canRetry,
  onRetry,
  onClose,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alertRef.current?.focus();
  }, []);
  return (
    <div
      ref={alertRef}
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm outline-none"
      role="alert"
      data-testid="meeting-note-ai-error"
    >
      <p className="text-destructive">{message}</p>
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <Button type="button" size="sm" onClick={onRetry} data-testid="meeting-note-ai-try-again">
            Try again
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onClose} data-testid="meeting-note-ai-error-close">
          Close
        </Button>
      </div>
    </div>
  );
}

export function MeetingNoteAiPanel({ note, flow }: MeetingNoteAiPanelProps) {
  const settings = useMeetingNoteAiSettings();
  const { companyUsers } = useCompany();
  const { state } = flow;
  const providers = settings.data?.providers ?? [];

  if (!note.rights.canEdit) return null;

  // FR-025: unconfigured (as last read, or as a route just answered).
  // A route's answer counts until the refreshed settings say AI is configured again.
  const notConfiguredByRoute =
    state.phase === 'error' && state.error.kind === 'not_configured' && settings.data?.settings.configured !== true
      ? state.error
      : null;
  // A draft under review stays reviewable: Apply needs no provider.
  if ((state.phase === 'idle' && settings.data?.settings.configured === false) || notConfiguredByRoute) {
    return (
      <NotConfigured canConfigure={settings.data?.canManage === true || notConfiguredByRoute?.canConfigure === true} />
    );
  }

  if (state.phase === 'preparing') return <MeetingNoteAiNoticeLoading />;

  if (state.phase === 'notice') {
    const labels = labelsFor(state.ticket, providers);
    return (
      <MeetingNoteAiNotice
        ticket={state.ticket}
        providerLabel={labels.providerLabel}
        modelLabel={labels.modelLabel}
        banner={state.banner}
        onProcess={flow.confirm}
        onCancel={flow.close}
      />
    );
  }

  if (state.phase === 'processing') {
    return <Processing providerLabel={labelsFor(state.ticket, providers).providerLabel} onCancel={flow.cancel} />;
  }

  if (state.phase === 'error') {
    return (
      <FlowError
        message={describeMeetingNoteAiFlowError(state.error)}
        canRetry={state.error.kind !== 'limit_reached' && state.error.kind !== 'access_lost' && note.hasTranscript}
        onRetry={flow.start}
        onClose={flow.close}
      />
    );
  }

  if (state.phase === 'review') {
    return (
      <MeetingNoteAiReview
        draft={state.draft}
        noteRevision={note.revision}
        existingItemCount={note.actionItems.length}
        members={companyUsers}
        applying={state.applying}
        applyError={state.applyError}
        conflict={state.conflict}
        onChange={flow.updateDraft}
        onApply={flow.apply}
        onDiscard={flow.discard}
        onReprocess={flow.start}
      />
    );
  }

  // Idle.
  const hasSummary = note.summary !== null && note.summary.trim() !== '';
  return (
    <div className="flex flex-col gap-2" data-testid="meeting-note-ai-idle">
      <div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!note.hasTranscript || settings.isPending}
          onClick={flow.start}
          data-testid="meeting-note-ai-start"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {hasSummary ? 'Reprocess transcript' : 'Generate summary'}
        </Button>
      </div>
      {!note.hasTranscript ? (
        <p className="text-sm text-muted-foreground">Attach a transcript to generate a summary and action items.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Drafts a summary and action items from the stored transcript. You review the draft before anything is saved.
        </p>
      )}
      {state.message ? (
        <p className="text-sm text-muted-foreground" role="status" data-testid="meeting-note-ai-message">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
