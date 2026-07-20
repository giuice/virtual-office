'use client';

export const LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY =
  'vo:presence:legacy-location:client-upgrade-required:v1';

const LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_VALUE = 'reloaded';

interface LegacyLocationErrorPayload {
  code?: unknown;
}

interface LegacyLocationUpgradeEnvironment {
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
}

export class LegacyLocationClientUpgradeRequiredError extends Error {
  constructor() {
    super('Client upgrade required');
    this.name = 'LegacyLocationClientUpgradeRequiredError';
  }
}

function getBrowserEnvironment(): LegacyLocationUpgradeEnvironment | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return {
      sessionStorage: window.sessionStorage,
      reload: () => window.location.reload(),
    };
  } catch (error) {
    console.error(
      '[Presence] Could not access the legacy-client upgrade reload guard; reload suppressed.',
      error
    );
    return null;
  }
}

function isClientUpgradeRequired(status: number, payload: unknown): boolean {
  if (status !== 426 || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  return (payload as LegacyLocationErrorPayload).code === 'CLIENT_UPGRADE_REQUIRED';
}

/**
 * Handles the legacy location route's atomic-cutover response.
 *
 * The session-scoped marker is persisted synchronously before reloading. That
 * ordering makes concurrent 426 responses converge on one reload and prevents
 * a stale/cached bundle from entering a reload loop. If sessionStorage is not
 * writable, the request still fails closed but no unguarded reload is attempted.
 */
export function handleLegacyLocationClientUpgrade(
  response: Pick<Response, 'status'>,
  payload: unknown,
  environment: LegacyLocationUpgradeEnvironment | null = getBrowserEnvironment()
): boolean {
  if (!isClientUpgradeRequired(response.status, payload)) {
    return false;
  }

  if (!environment) {
    return true;
  }

  try {
    if (environment.sessionStorage.getItem(LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY) !== null) {
      return true;
    }

    environment.sessionStorage.setItem(
      LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY,
      LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_VALUE
    );
  } catch (error) {
    console.error(
      '[Presence] Could not persist the legacy-client upgrade reload guard; reload suppressed.',
      error
    );
    return true;
  }

  try {
    environment.reload();
  } catch (error) {
    console.error('[Presence] Legacy-client hard reload failed.', error);
  }

  return true;
}
