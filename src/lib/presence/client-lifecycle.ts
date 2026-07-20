let presenceClientEpoch = 0;

export interface PresenceClientInvalidation {
  readonly epoch: number;
  readonly reason:
    | 'logout'
    | 'auth-session-revoked'
    | 'membership-scope-invalidated'
    | 'reset';
  readonly companyId?: string;
  readonly userId?: string;
}

type PresenceClientInvalidationListener = (
  invalidation: PresenceClientInvalidation,
) => void;

const invalidationListeners = new Set<PresenceClientInvalidationListener>();

export function getPresenceClientEpoch(): number {
  return presenceClientEpoch;
}

export function invalidatePresenceClientLifecycle(
  options: Omit<PresenceClientInvalidation, 'epoch'> = { reason: 'reset' },
): void {
  presenceClientEpoch += 1;
  const invalidation = { epoch: presenceClientEpoch, ...options };
  for (const listener of invalidationListeners) listener(invalidation);
}

export function subscribeToPresenceClientInvalidation(
  listener: PresenceClientInvalidationListener,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}
