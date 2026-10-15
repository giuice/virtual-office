// src/components/meeting-notes/MeetingNoteAiSettingsSection.tsx
// Company page → admin "Settings" tab → "AI" section (Phase 6 T8, FR-024).
// Admins choose the provider, model, and reasoning level from the curated
// server matrix, set the daily limit, and enter or replace the API key. The
// key is write-only: the input is cleared after each save and the page only
// ever shows its last four characters, as returned by the server. The key is
// never kept in TanStack state (useSaveMeetingNoteAiSettings), and the form's
// state is reset whenever the signed-in user or company changes. A save is
// checked against the revision the admin started editing from, not whatever
// a background refetch shows at submit time.
'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaveMeetingNoteAiSettings } from '@/hooks/mutations/useMeetingNoteAiSettingsMutations';
import { useMeetingNoteAiSettings } from '@/hooks/queries/useMeetingNoteAiSettings';
import { useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { useNotification } from '@/hooks/useNotification';
import { MeetingNoteAiSettingsConflictError } from '@/lib/meeting-notes/ai/settings-client-api';
import {
  isPlausibleAiApiKey,
  MEETING_NOTE_AI_MAX_DAILY_LIMIT,
  MEETING_NOTE_AI_MIN_DAILY_LIMIT,
} from '@/lib/meeting-notes/ai/settings-limits';
import { MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import { AI_SETTINGS_SECTION_ID } from '@/lib/meeting-notes/ui-paths';
import type {
  MeetingNoteAiModelOption,
  MeetingNoteAiProvider,
  MeetingNoteAiProviderOption,
  MeetingNoteAiSettingsView,
} from '@/types/meeting-notes';

interface Drafts {
  provider: MeetingNoteAiProvider | null;
  model: string | null;
  reasoningLevel: string | null;
  dailyLimit: string | null;
}

const NO_DRAFTS: Drafts = { provider: null, model: null, reasoningLevel: null, dailyLimit: null };

function formatUpdatedAt(value: string | number | Date | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function describe(settings: MeetingNoteAiSettingsView, providers: MeetingNoteAiProviderOption[]): string {
  const provider = providers.find((p) => p.id === settings.provider);
  const model = provider?.models.find((m) => m.id === settings.model);
  return [provider?.label ?? settings.provider, model?.label ?? settings.model, settings.reasoningLevel]
    .filter(Boolean)
    .join(' · ');
}

export function MeetingNoteAiSettingsSection() {
  const scope = useMeetingNotesScope();
  // A new user or company starts from a fresh form (no key, drafts, or errors).
  return <AiSettingsForm key={scope ? `${scope.userId}:${scope.companyId}` : 'no-scope'} />;
}

function AiSettingsForm() {
  const query = useMeetingNoteAiSettings();
  const save = useSaveMeetingNoteAiSettings();
  const { showSuccess } = useNotification();
  const baseId = useId();

  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  // The key lives only in this input's state and is cleared after every save.
  const [apiKey, setApiKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<MeetingNoteAiSettingsView | null>(null);
  // The revision the admin's edits are based on; captured at the first edit.
  const [baseRevision, setBaseRevision] = useState<number | null | undefined>(undefined);

  const data = query.data;
  const settings = data?.settings;
  const providers = useMemo(() => data?.providers ?? [], [data?.providers]);

  const providerId = drafts.provider ?? settings?.provider ?? null;
  const provider = providers.find((p) => p.id === providerId) ?? null;
  const modelId = drafts.model ?? (drafts.provider ? null : settings?.model ?? null);
  const model: MeetingNoteAiModelOption | null =
    provider?.models.find((m) => m.id === modelId) ?? (drafts.provider ? provider?.models[0] ?? null : null);
  const reasoningCandidate = drafts.reasoningLevel ?? (drafts.provider || drafts.model ? null : settings?.reasoningLevel ?? null);
  const reasoningLevel =
    model?.reasoningLevels.find((level) => level.id === reasoningCandidate)?.id ?? model?.defaultReasoningLevel ?? null;
  const dailyLimit = drafts.dailyLimit ?? String(settings?.dailyLimit ?? '');

  if (query.isLoading) {
    return (
      <Card id={AI_SETTINGS_SECTION_ID} data-testid="ai-settings-section" aria-busy="true">
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>Loading AI settings…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (query.isError || !data || !settings) {
    return (
      <Card id={AI_SETTINGS_SECTION_ID} data-testid="ai-settings-section">
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription role="alert">The AI settings could not be loaded. Reload the page to try again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Members never get this section (the Settings tab is admin-only, and the
  // route reports whether the caller may save).
  if (!data.canManage) return null;

  const updatedAt = formatUpdatedAt(settings.updatedAt);
  const ids = {
    provider: `${baseId}-provider`,
    model: `${baseId}-model`,
    reasoning: `${baseId}-reasoning`,
    key: `${baseId}-key`,
    keyHelp: `${baseId}-key-help`,
    limit: `${baseId}-limit`,
    limitHelp: `${baseId}-limit-help`,
  };

  /** The first edit fixes the revision this save is checked against. */
  const beginEdit = () => {
    if (baseRevision === undefined) setBaseRevision(settings.revision);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    if (!provider || !model || !reasoningLevel) {
      setFormError('Choose a provider, a model, and a reasoning level.');
      return;
    }
    const limit = Number(dailyLimit);
    if (!Number.isInteger(limit) || limit < MEETING_NOTE_AI_MIN_DAILY_LIMIT || limit > MEETING_NOTE_AI_MAX_DAILY_LIMIT) {
      setFormError(
        `The daily limit must be a whole number from ${MEETING_NOTE_AI_MIN_DAILY_LIMIT} to ${MEETING_NOTE_AI_MAX_DAILY_LIMIT}.`
      );
      return;
    }
    const key = apiKey.trim();
    if (!settings.configured && key.length === 0) {
      setFormError('Enter the API key for the first save.');
      return;
    }
    if (key.length > 0 && !isPlausibleAiApiKey(key)) {
      setFormError('The API key format is invalid.');
      return;
    }

    save.save(
      {
        expectedRevision: baseRevision === undefined ? settings.revision : baseRevision,
        provider: provider.id,
        model: model.id,
        reasoningLevel,
        dailyLimit: limit,
        apiKey: key.length > 0 ? key : null,
      },
      {
        onSuccess: () => {
          setApiKey('');
          setDrafts(NO_DRAFTS);
          setConflict(null);
          setBaseRevision(undefined);
          showSuccess({ title: 'AI settings saved', description: 'New AI requests use these settings.' });
        },
        onError: (error) => {
          if (error instanceof MeetingNoteAiSettingsConflictError) {
            // Keep the admin's choices; the next save applies them on top of
            // the newer settings shown here, on purpose.
            setConflict(error.settings);
            setBaseRevision(error.settings.revision);
            return;
          }
          setFormError(
            error instanceof MeetingNotesApiError ? error.message : 'The AI settings could not be saved. Try again.'
          );
        },
      }
    );
  };

  const discardChanges = () => {
    setDrafts(NO_DRAFTS);
    setApiKey('');
    setBaseRevision(undefined);
    save.clear();
    setConflict(null);
    setFormError(null);
  };

  return (
    <Card id={AI_SETTINGS_SECTION_ID} data-testid="ai-settings-section" className="scroll-mt-24">
      <form onSubmit={onSubmit} noValidate aria-labelledby={`${baseId}-title`}>
        <CardHeader>
          <CardTitle id={`${baseId}-title`} className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            AI
          </CardTitle>
          <CardDescription>
            Meeting-note summaries use your company&apos;s own AI provider key. Transcript text is sent to the provider
            chosen here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground" data-testid="ai-settings-status">
            {settings.configured ? `Configured: ${describe(settings, providers)}` : 'AI is not configured yet.'}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={ids.provider}>Provider</Label>
              <Select
                value={provider?.id ?? ''}
                onValueChange={(value) => {
                  beginEdit();
                  setDrafts((d) => ({ ...d, provider: value as MeetingNoteAiProvider, model: null, reasoningLevel: null }));
                }}
              >
                <SelectTrigger id={ids.provider} data-testid="ai-provider-select" aria-label="Provider">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={ids.model}>Model</Label>
              <Select
                value={model?.id ?? ''}
                disabled={!provider}
                onValueChange={(value) => {
                  beginEdit();
                  setDrafts((d) => ({ ...d, provider: provider?.id ?? null, model: value, reasoningLevel: null }));
                }}
              >
                <SelectTrigger id={ids.model} data-testid="ai-model-select" aria-label="Model">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {(provider?.models ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={ids.reasoning}>Reasoning level</Label>
              <Select
                value={reasoningLevel ?? ''}
                disabled={!model}
                onValueChange={(value) => {
                  beginEdit();
                  setDrafts((d) => ({ ...d, provider: provider?.id ?? null, model: model?.id ?? null, reasoningLevel: value }));
                }}
              >
                <SelectTrigger id={ids.reasoning} data-testid="ai-reasoning-select" aria-label="Reasoning level">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {(model?.reasoningLevels ?? []).map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.key}>API key</Label>
              <Input
                id={ids.key}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => {
                  beginEdit();
                  setApiKey(event.target.value);
                }}
                placeholder={settings.configured ? 'Leave blank to keep the current key' : 'Paste the API key'}
                aria-describedby={ids.keyHelp}
                data-testid="ai-key-input"
              />
              <p id={ids.keyHelp} className="text-xs text-muted-foreground">
                {settings.keyLastFour ? (
                  <span data-testid="ai-key-last-four">Key ending in ····{settings.keyLastFour}</span>
                ) : (
                  'The key is stored encrypted and can never be read back.'
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={ids.limit}>Daily limit (AI requests per day)</Label>
              <Input
                id={ids.limit}
                type="number"
                inputMode="numeric"
                min={MEETING_NOTE_AI_MIN_DAILY_LIMIT}
                max={MEETING_NOTE_AI_MAX_DAILY_LIMIT}
                step={1}
                value={dailyLimit}
                onChange={(event) => {
                  beginEdit();
                  setDrafts((d) => ({ ...d, dailyLimit: event.target.value }));
                }}
                aria-describedby={ids.limitHelp}
                data-testid="ai-daily-limit-input"
              />
              <p id={ids.limitHelp} className="text-xs text-muted-foreground">
                From {MEETING_NOTE_AI_MIN_DAILY_LIMIT} to {MEETING_NOTE_AI_MAX_DAILY_LIMIT}. Resets at midnight
                (São Paulo time).
              </p>
            </div>
          </div>

          {settings.updatedBy && updatedAt ? (
            <p className="text-xs text-muted-foreground" data-testid="ai-updated-by">
              Last updated by {settings.updatedBy.name} on {updatedAt}
            </p>
          ) : null}

          {conflict ? (
            <div
              role="alert"
              className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
              data-testid="ai-settings-conflict"
            >
              <p>Another admin changed the AI settings. They are now: {describe(conflict, providers)}, limit {conflict.dailyLimit}.</p>
              <p className="mt-1">Save again to apply your choices on top of them, or discard your changes.</p>
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="text-sm text-destructive" data-testid="ai-settings-error">
              {formError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {conflict ? (
            <Button type="button" variant="outline" onClick={discardChanges}>
              Discard my changes
            </Button>
          ) : null}
          <Button type="submit" disabled={save.isPending} data-testid="ai-save-button">
            {save.isPending ? 'Saving…' : 'Save AI settings'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
