export function placementSessionKey(companyId: string, userId: string, sessionId: string): string {
  return `${companyId}:${userId}:${sessionId}`;
}

export interface PlacementSessionState {
  claim: (key: string) => boolean;
  markInitialized: (key: string) => void;
  suppressIdentity: (companyId: string, userId: string) => void;
  resumeIdentity: (companyId: string, userId: string) => void;
  isIdentitySuppressed: (companyId: string, userId: string) => boolean;
}

export function createPlacementSessionState(): PlacementSessionState {
  const initializedSessions = new Set<string>();
  const suppressedIdentities = new Set<string>();
  const identityKey = (companyId: string, userId: string): string => `${companyId}:${userId}`;

  return {
    claim: (key) => {
      if (initializedSessions.has(key)) return false;
      initializedSessions.add(key);
      return true;
    },
    markInitialized: (key) => {
      initializedSessions.add(key);
    },
    suppressIdentity: (companyId, userId) => {
      suppressedIdentities.add(identityKey(companyId, userId));
    },
    resumeIdentity: (companyId, userId) => {
      suppressedIdentities.delete(identityKey(companyId, userId));
    },
    isIdentitySuppressed: (companyId, userId) =>
      suppressedIdentities.has(identityKey(companyId, userId)),
  };
}
