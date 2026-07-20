'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Company, Space, UserPresenceData } from '@/types/database';
import type { PresenceSnapshot } from '@/lib/presence/contracts';
import type {
  LocationTransitionInput,
  LocationTransitionOutcome,
  PresenceLocationSnapshot,
} from '@/lib/presence/location-transition-coordinator';
import {
  createPlacementSessionState,
  placementSessionKey,
} from '@/lib/presence/placement-session-state';
import { presenceStorageKeys } from '@/lib/presence/storage-keys';

export interface ReconnectionContext {
  type: 'home-space' | 'default-space' | 'fallback' | 'first-time';
  spaceId: string | null;
  spaceName?: string;
  reason: string;
}

interface LastSpaceUser {
  id: string;
  currentSpaceId: string | null;
  locationVersion?: number;
  dbStatus?: UserPresenceData['dbStatus'];
}

interface UseLastSpaceOptions {
  sessionId: string | null;
  snapshot: PresenceSnapshot | undefined;
  transitionLocation: (input: LocationTransitionInput) => Promise<LocationTransitionOutcome>;
  isSessionRecoveryInProgress?: boolean;
  confirmedSessionId?: string | null;
  isTransitionPending?: boolean;
}

interface HydratedHint {
  key: string | null;
  value: string | null;
}

interface PlacementCandidate {
  spaceId: string;
  spaceName: string;
  reason: Extract<LocationTransitionInput['reason'], 'auto-first-placement' | 'auto-rejoin' | 'auto-fallback'>;
  type: 'first-time' | 'rejoin' | 'fallback';
}

const JOINABLE_STATUSES = new Set(['active', 'available']);
const FALLBACK_CODES = new Set([
  'SPACE_FULL',
  'SPACE_UNAVAILABLE',
  'SPACE_NOT_FOUND',
  'SPACE_ACCESS_DENIED',
]);

function getJoinableSpace(spaces: Space[], spaceId: string | null | undefined): Space | undefined {
  return spaceId
    ? spaces.find((space) => space.id === spaceId && JOINABLE_STATUSES.has(space.status))
    : undefined;
}

function firstJoinableWorkspace(spaces: Space[], excludedIds: Set<string> = new Set()): Space | undefined {
  return spaces.find((space) =>
    !excludedIds.has(space.id) &&
    space.type === 'workspace' &&
    JOINABLE_STATUSES.has(space.status)
  );
}

function readHint(key: string | null): HydratedHint {
  return {
    key,
    value: typeof window !== 'undefined' && key ? window.localStorage.getItem(key) : null,
  };
}

export function getReconnectionContext(
  currentUser: Pick<LastSpaceUser, 'id'>,
  spaces: Space[],
  company: Company | null,
  _lastSpaceId: string | null,
  isFirstPlacement = false
): ReconnectionContext {
  const homeSpace = isFirstPlacement
    ? undefined
    : getJoinableSpace(spaces, company?.settings?.homeSpaces?.[currentUser.id]);
  const defaultSpace = getJoinableSpace(spaces, company?.settings?.defaultSpaceId);
  const target = homeSpace ?? defaultSpace ?? firstJoinableWorkspace(spaces);

  if (!target) return { type: 'fallback', spaceId: null, reason: 'No joinable spaces available' };
  if (isFirstPlacement) {
    return {
      type: 'first-time',
      spaceId: target.id,
      spaceName: target.name,
      reason: defaultSpace?.id === target.id
        ? 'Server marker is empty; using company default space'
        : 'Server marker is empty; using first available workspace',
    };
  }
  if (homeSpace?.id === target.id) {
    return {
      type: 'home-space',
      spaceId: target.id,
      spaceName: target.name,
      reason: 'Using assigned home space',
    };
  }
  if (defaultSpace?.id === target.id) {
    return {
      type: 'default-space',
      spaceId: target.id,
      spaceName: target.name,
      reason: 'Using company default space',
    };
  }
  return {
    type: 'fallback',
    spaceId: target.id,
    spaceName: target.name,
    reason: 'Using first available workspace',
  };
}

function buildPlacementCandidates(
  currentUser: Pick<LastSpaceUser, 'id'>,
  snapshotSpaceId: string | null,
  spaces: Space[],
  company: Company | null,
  isFirstPlacement: boolean
): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];
  const seen = new Set<string>();
  const add = (space: Space | undefined, reason: PlacementCandidate['reason'], type: PlacementCandidate['type']) => {
    if (!space || seen.has(space.id)) return;
    seen.add(space.id);
    candidates.push({ spaceId: space.id, spaceName: space.name, reason, type });
  };

  if (snapshotSpaceId) {
    const snapshotSpace = spaces.find((space) => space.id === snapshotSpaceId);
    seen.add(snapshotSpaceId);
    candidates.push({
      spaceId: snapshotSpaceId,
      spaceName: snapshotSpace?.name ?? 'your previous space',
      reason: 'auto-rejoin',
      type: 'rejoin',
    });
  }

  if (isFirstPlacement) {
    add(getJoinableSpace(spaces, company?.settings?.defaultSpaceId), 'auto-first-placement', 'first-time');
    add(firstJoinableWorkspace(spaces, seen), 'auto-first-placement', 'first-time');
  } else {
    add(
      getJoinableSpace(spaces, company?.settings?.homeSpaces?.[currentUser.id]),
      'auto-fallback',
      'fallback'
    );
    add(getJoinableSpace(spaces, company?.settings?.defaultSpaceId), 'auto-fallback', 'fallback');
    add(firstJoinableWorkspace(spaces, seen), 'auto-fallback', 'fallback');
  }

  return candidates;
}

export function useLastSpace(
  currentUser: LastSpaceUser | null,
  spaces: Space[],
  company: Company | null,
  options?: UseLastSpaceOptions
) {
  const companyId = company?.id ?? null;
  const userId = currentUser?.id ?? null;
  const storageKey = companyId && userId
    ? presenceStorageKeys.lastSpace(companyId, userId)
    : null;
  const sessionId = options?.sessionId ?? null;
  const snapshot = options?.snapshot;
  const transitionLocation = options?.transitionLocation;
  const isSessionRecoveryInProgress = options?.isSessionRecoveryInProgress ?? false;
  const confirmedSessionId = options?.confirmedSessionId ?? null;
  const isTransitionPending = options?.isTransitionPending ?? false;

  const placementStateRef = useRef(createPlacementSessionState());
  const activeIdentityRef = useRef<string | null>(null);
  const committedIdentityRef = useRef<string | null>(null);
  const [isRejoinInProgress, setIsRejoinInProgress] = useState(false);
  const [rejoinAttempts, setRejoinAttempts] = useState(0);
  const [hydratedHint, setHydratedHint] = useState<HydratedHint>(() => readHint(storageKey));
  const identityKey = companyId && userId ? `${companyId}:${userId}` : null;

  useEffect(() => {
    if (committedIdentityRef.current !== identityKey) {
      placementStateRef.current = createPlacementSessionState();
      committedIdentityRef.current = identityKey;
    }
    activeIdentityRef.current = identityKey;
    setIsRejoinInProgress(false);
    setRejoinAttempts(0);
    return () => {
      if (activeIdentityRef.current === identityKey) activeIdentityRef.current = null;
    };
  }, [identityKey]);

  useEffect(() => {
    setHydratedHint(readHint(storageKey));
  }, [storageKey]);

  const lastSpaceId = hydratedHint.key === storageKey ? hydratedHint.value : null;

  const saveLastSpace = useCallback((spaceId: string) => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, spaceId);
    setHydratedHint({ key: storageKey, value: spaceId });
  }, [storageKey]);

  const clearLastSpace = useCallback(() => {
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
    setHydratedHint({ key: storageKey, value: null });
  }, [storageKey]);

  const suppressAutoPlacement = useCallback(() => {
    if (!companyId || !userId) return;
    placementStateRef.current.suppressIdentity(companyId, userId);
    clearLastSpace();
  }, [clearLastSpace, companyId, userId]);

  const resumeAutoPlacement = useCallback(() => {
    if (!companyId || !userId) return;
    placementStateRef.current.resumeIdentity(companyId, userId);
  }, [companyId, userId]);

  const snapshotUser = useMemo(
    () => snapshot?.users.find((user) => user.id === userId) ?? null,
    [snapshot, userId]
  );

  useEffect(() => {
    if (!companyId || !userId || !confirmedSessionId) return;
    placementStateRef.current.markInitialized(
      placementSessionKey(companyId, userId, confirmedSessionId)
    );
  }, [companyId, confirmedSessionId, userId]);

  useEffect(() => {
    if (
      !companyId ||
      !userId ||
      !sessionId ||
      !snapshot ||
      !snapshotUser ||
      !transitionLocation ||
      spaces.length === 0 ||
      hydratedHint.key !== storageKey ||
      isSessionRecoveryInProgress ||
      isRejoinInProgress ||
      isTransitionPending
    ) return;

    const sessionKey = placementSessionKey(companyId, userId, sessionId);
    if (placementStateRef.current.isIdentitySuppressed(companyId, userId)) {
      placementStateRef.current.markInitialized(sessionKey);
      return;
    }
    if (confirmedSessionId === sessionId) {
      placementStateRef.current.markInitialized(sessionKey);
      return;
    }
    const invocationIdentity = identityKey;
    const candidates = buildPlacementCandidates(
      { id: userId },
      snapshotUser.currentSpaceId,
      spaces,
      company,
      snapshot.currentUser.initialPlacementCompletedAt === null
    );
    if (candidates.length === 0) return;
    if (!placementStateRef.current.claim(sessionKey)) return;

    void (async () => {
      setIsRejoinInProgress(true);
      let observed: PresenceLocationSnapshot = {
        currentSpaceId: snapshotUser.currentSpaceId,
        locationVersion: snapshotUser.locationVersion,
      };
      let finalOutcome: LocationTransitionOutcome | null = null;
      let successfulCandidate: PlacementCandidate | null = null;

      for (const [index, candidate] of candidates.entries()) {
        setRejoinAttempts(index + 1);
        const outcome = await transitionLocation({
          spaceId: candidate.spaceId,
          reason: candidate.reason,
          expectedLocationVersion: observed.locationVersion,
        });
        finalOutcome = outcome;
        if (outcome.ok) {
          successfulCandidate = candidate;
          break;
        }
        if (outcome.skipped || !FALLBACK_CODES.has(outcome.code)) break;
        if (
          !outcome.snapshot ||
          outcome.snapshot.locationVersion !== observed.locationVersion ||
          outcome.snapshot.currentSpaceId !== observed.currentSpaceId
        ) break;
        observed = outcome.snapshot;
      }

      if (activeIdentityRef.current !== invocationIdentity) return;
      if (successfulCandidate) {
        saveLastSpace(successfulCandidate.spaceId);
        if (successfulCandidate.type === 'first-time') {
          toast(`Welcome! You've been placed in ${successfulCandidate.spaceName}`);
        } else if (successfulCandidate.type === 'rejoin') {
          toast(`Reconnected to ${successfulCandidate.spaceName}`);
        }
      } else if (finalOutcome?.ok === false && !finalOutcome.skipped) {
        toast.error('Automatic placement failed', { description: finalOutcome.message });
      }
      setIsRejoinInProgress(false);
      setRejoinAttempts(0);
    })();
  }, [
    company,
    companyId,
    confirmedSessionId,
    hydratedHint.key,
    identityKey,
    isSessionRecoveryInProgress,
    isRejoinInProgress,
    isTransitionPending,
    saveLastSpace,
    sessionId,
    snapshot,
    snapshotUser,
    spaces,
    storageKey,
    transitionLocation,
    userId,
  ]);

  return {
    lastSpaceId,
    saveLastSpace,
    clearLastSpace,
    suppressAutoPlacement,
    resumeAutoPlacement,
    isRejoinInProgress,
    rejoinAttempts,
  };
}
