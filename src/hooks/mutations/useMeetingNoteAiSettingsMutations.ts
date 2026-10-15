// src/hooks/mutations/useMeetingNoteAiSettingsMutations.ts
// Admin save of the company AI settings (Phase 6 T8, FR-024). The API key is
// write-only and never enters TanStack state (block B review B-1): the
// mutation's variables hold only the non-secret choices plus an opaque
// one-use token; the key waits in this hook's ref under that token and is
// taken out (deleted) when the request body is built. The cache keeps only the
// masked settings the route returned. Runs through
// useMeetingNotesScopedMutation, so a retired scope's save is aborted and its
// late result never reaches another account's cache.
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import {
  useMeetingNotesScopedMutation,
  type MeetingNotesMutateOptions,
} from '@/hooks/mutations/useMeetingNotesScopedMutation';
import { meetingNoteAiSettingsQueryKey } from '@/hooks/queries/useMeetingNoteAiSettings';
import {
  MeetingNoteAiSettingsConflictError,
  saveMeetingNoteAiSettings,
} from '@/lib/meeting-notes/ai/settings-client-api';
import type { MeetingNotesScope } from '@/lib/meeting-notes/scope-fence';
import type {
  MeetingNoteAiSettingsResponse,
  MeetingNoteAiSettingsView,
  SaveMeetingNoteAiSettingsInput,
} from '@/types/meeting-notes';

/** What the mutation keeps: the admin's choices and a token for the key, never the key. */
export interface SaveMeetingNoteAiSettingsVariables extends Omit<SaveMeetingNoteAiSettingsInput, 'apiKey'> {
  /** Opaque one-use reference to a key held outside TanStack; null = keep the stored key. */
  keyToken: number | null;
}

export type SaveMeetingNoteAiSettingsCallbacks = MeetingNotesMutateOptions<
  MeetingNoteAiSettingsView,
  SaveMeetingNoteAiSettingsVariables
>;

export function useSaveMeetingNoteAiSettings() {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<number, string>());
  const nextToken = useRef(1);

  // Unmount (and with it every identity change that leaves the page) drops held keys.
  useEffect(() => {
    const held = keys.current;
    return () => held.clear();
  }, []);

  const store = useCallback(
    (scope: MeetingNotesScope, settings: MeetingNoteAiSettingsView) => {
      queryClient.setQueryData<MeetingNoteAiSettingsResponse>(
        meetingNoteAiSettingsQueryKey(scope.userId, scope.companyId),
        (current) => (current ? { ...current, settings } : current)
      );
    },
    [queryClient]
  );

  const mutation = useMeetingNotesScopedMutation<MeetingNoteAiSettingsView, SaveMeetingNoteAiSettingsVariables>({
    name: 'save-ai-settings',
    // A settled save leaves the MutationCache as soon as nothing observes it.
    gcTime: 0,
    mutationFn: ({ keyToken, ...choices }, { signal }) => {
      let apiKey: string | null = null;
      if (keyToken !== null) {
        apiKey = keys.current.get(keyToken) ?? null;
        keys.current.delete(keyToken);
        if (apiKey === null) {
          // The key was dropped (unmount) before the request started: never
          // save as "keep the current key" by accident.
          return Promise.reject(new Error('The API key is no longer available. Enter it again.'));
        }
      }
      return saveMeetingNoteAiSettings({ ...choices, apiKey }, signal);
    },
    onSuccess: (settings, _variables, scope) => store(scope, settings),
    onError: (error, _variables, scope) => {
      if (error instanceof MeetingNoteAiSettingsConflictError) store(scope, error.settings);
    },
  });

  const { mutate, reset } = mutation;
  const save = useCallback(
    (input: SaveMeetingNoteAiSettingsInput, callbacks?: SaveMeetingNoteAiSettingsCallbacks) => {
      const { apiKey, ...choices } = input;
      let keyToken: number | null = null;
      if (apiKey !== null) {
        keyToken = nextToken.current;
        nextToken.current += 1;
        keys.current.set(keyToken, apiKey);
      }
      mutate({ ...choices, keyToken }, callbacks);
    },
    [mutate]
  );

  /** Forgets every key still waiting and the last save's state. */
  const clear = useCallback(() => {
    keys.current.clear();
    reset();
  }, [reset]);

  return { save, clear, isPending: mutation.isPending };
}
