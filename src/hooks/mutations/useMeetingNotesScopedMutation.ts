// src/hooks/mutations/useMeetingNotesScopedMutation.ts
// The one mutation shape of the meeting-notes client layer (Phase 6 FR-021
// browser clause; block B review B-2). Each call records the scope (users.id
// + company id) it started in as its onMutate result and mutationKey prefix,
// and runs its request with an AbortSignal registered under that scope. When
// the scope retires (useMeetingNotesScopeLifecycle) the request is aborted,
// the mutation leaves the MutationCache, and every callback of the call — the
// hook's and the caller's — is skipped, so a late response never downloads a
// file, writes the cache, or shows a toast in another account's session.
// Mutations always run (networkMode 'always'): offline, the request fails at
// once with a network error the UI shows, instead of waiting paused.
'use client';

import { useMutation, type MutateOptions, type UseMutationResult } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { meetingNoteQueryKeys, useMeetingNotesScope } from '@/hooks/queries/useMeetingNotes';
import { MeetingNotesApiError } from '@/lib/meeting-notes/client-api';
import {
  isCurrentMeetingNotesOrigin,
  isCurrentMeetingNotesScope,
  openMeetingNotesRequest,
  releaseMeetingNotesRequest,
  type MeetingNotesMutationOrigin,
  type MeetingNotesScope,
} from '@/lib/meeting-notes/scope-fence';

export interface MeetingNotesRequestContext {
  scope: MeetingNotesScope;
  /** Aborted when the scope retires (and on unmount with `abortOnUnmount`). */
  signal: AbortSignal;
}

export interface MeetingNotesScopedMutationOptions<TData, TVariables> {
  /** Names the mutation inside its scope's mutationKey. */
  name: string;
  mutationFn: (variables: TVariables, request: MeetingNotesRequestContext) => Promise<TData>;
  /** Runs only while the call's scope is still the signed-in one. */
  onSuccess?: (data: TData, variables: TVariables, scope: MeetingNotesScope) => void;
  /** Runs only while the call's scope is still the signed-in one. */
  onError?: (error: Error, variables: TVariables, scope: MeetingNotesScope) => void;
  /** Abort the request when the calling component unmounts (e.g. a download). */
  abortOnUnmount?: boolean;
  /** How long a settled call stays in the MutationCache once unobserved. */
  gcTime?: number;
}

export type MeetingNotesMutateOptions<TData, TVariables> = MutateOptions<
  TData,
  Error,
  TVariables,
  MeetingNotesMutationOrigin
>;

export type MeetingNotesScopedMutationResult<TData, TVariables> = Omit<
  UseMutationResult<TData, Error, TVariables, MeetingNotesMutationOrigin>,
  'mutate' | 'mutateAsync'
> & {
  mutate: (variables: TVariables, options?: MeetingNotesMutateOptions<TData, TVariables>) => void;
};

function noSession(): MeetingNotesApiError {
  return new MeetingNotesApiError(401, 'NO_SESSION', 'Your session is not ready. Reload the page and try again.');
}

/** The caller's callbacks, each skipped once the call's scope is no longer current. */
function fenceCallbacks<TData, TVariables>(
  options: MeetingNotesMutateOptions<TData, TVariables> | undefined
): MeetingNotesMutateOptions<TData, TVariables> | undefined {
  if (!options) return undefined;
  const { onSuccess, onError, onSettled } = options;
  return {
    onSuccess: onSuccess
      ? (data, variables, origin, context) => {
          if (isCurrentMeetingNotesOrigin(origin)) onSuccess(data, variables, origin, context);
        }
      : undefined,
    onError: onError
      ? (error, variables, origin, context) => {
          if (isCurrentMeetingNotesOrigin(origin)) onError(error, variables, origin, context);
        }
      : undefined,
    onSettled: onSettled
      ? (data, error, variables, origin, context) => {
          if (isCurrentMeetingNotesOrigin(origin)) onSettled(data, error, variables, origin, context);
        }
      : undefined,
  };
}

export function useMeetingNotesScopedMutation<TData, TVariables>(
  options: MeetingNotesScopedMutationOptions<TData, TVariables>
): MeetingNotesScopedMutationResult<TData, TVariables> {
  const scope = useMeetingNotesScope();
  const { abortOnUnmount = false } = options;
  const owned = useRef(new Set<AbortController>());

  useEffect(() => {
    const controllers = owned.current;
    return () => {
      if (abortOnUnmount) controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, [abortOnUnmount]);

  const mutation = useMutation<TData, Error, TVariables, MeetingNotesMutationOrigin>({
    mutationKey: scope
      ? [...meetingNoteQueryKeys.scope(scope.userId, scope.companyId), 'mutation', options.name]
      : ['meeting-notes', 'no-scope', 'mutation', options.name],
    networkMode: 'always',
    retry: 0,
    gcTime: options.gcTime,
    onMutate: () => {
      if (!scope) throw noSession();
      return { scope };
    },
    mutationFn: async (variables) => {
      if (!scope || !isCurrentMeetingNotesScope(scope)) throw noSession();
      const controller = openMeetingNotesRequest(scope);
      owned.current.add(controller);
      try {
        return await options.mutationFn(variables, { scope, signal: controller.signal });
      } finally {
        owned.current.delete(controller);
        releaseMeetingNotesRequest(scope, controller);
      }
    },
    onSuccess: (data, variables, origin) => {
      if (origin && isCurrentMeetingNotesOrigin(origin)) options.onSuccess?.(data, variables, origin.scope);
    },
    onError: (error, variables, origin) => {
      if (origin && isCurrentMeetingNotesOrigin(origin)) options.onError?.(error, variables, origin.scope);
    },
  });

  const { mutate: rawMutate, mutateAsync: _unfenced, ...rest } = mutation;
  void _unfenced;
  const mutate = useCallback(
    (variables: TVariables, callbacks?: MeetingNotesMutateOptions<TData, TVariables>) => {
      rawMutate(variables, fenceCallbacks(callbacks));
    },
    [rawMutate]
  );

  return { ...rest, mutate };
}
