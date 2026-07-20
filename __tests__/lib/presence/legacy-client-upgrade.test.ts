import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleLegacyLocationClientUpgrade,
  LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY,
} from '@/lib/presence/legacy-client-upgrade';

interface TestEnvironment {
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
}

function createEnvironment(initialGuard?: string): {
  environment: TestEnvironment;
  storage: Map<string, string>;
  reload: ReturnType<typeof vi.fn>;
  events: string[];
} {
  const storage = new Map<string, string>();
  const events: string[] = [];

  if (initialGuard !== undefined) {
    storage.set(LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY, initialGuard);
  }

  const reload = vi.fn(() => {
    events.push('reload');
  });

  return {
    storage,
    reload,
    events,
    environment: {
      sessionStorage: {
        getItem: vi.fn((key: string) => {
          events.push('get');
          return storage.get(key) ?? null;
        }),
        setItem: vi.fn((key: string, value: string) => {
          events.push('set');
          storage.set(key, value);
        }),
      },
      reload,
    },
  };
}

describe('handleLegacyLocationClientUpgrade', () => {
  const response426 = { status: 426 };
  const payload = { code: 'CLIENT_UPGRADE_REQUIRED' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [{ status: 409 }, payload],
    [response426, { code: 'SPACE_FULL' }],
    [response426, null],
    [response426, 'CLIENT_UPGRADE_REQUIRED'],
  ])('ignores responses that do not match both status and code', (response, body) => {
    const { environment, reload } = createEnvironment();

    expect(handleLegacyLocationClientUpgrade(response, body, environment)).toBe(false);
    expect(environment.sessionStorage.getItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('persists the scoped session guard before performing a hard reload', () => {
    const { environment, storage, reload, events } = createEnvironment();

    expect(handleLegacyLocationClientUpgrade(response426, payload, environment)).toBe(true);

    expect(LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY).toMatch(
      /^vo:presence:legacy-location:/
    );
    expect(storage.get(LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY)).toBe('reloaded');
    expect(events).toEqual(['get', 'set', 'reload']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('performs exactly one reload when concurrent 426 handlers observe the same session', async () => {
    const { environment, reload } = createEnvironment();

    const handled = await Promise.all(
      Array.from({ length: 12 }, async () =>
        handleLegacyLocationClientUpgrade(response426, payload, environment)
      )
    );

    expect(handled).toEqual(Array.from({ length: 12 }, () => true));
    expect(environment.sessionStorage.setItem).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again when the current tab session already has the guard', () => {
    const { environment, reload } = createEnvironment('reloaded');

    expect(handleLegacyLocationClientUpgrade(response426, payload, environment)).toBe(true);
    expect(environment.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('fails closed without an unguarded reload when sessionStorage cannot be written', () => {
    const { environment, reload } = createEnvironment();
    const storageError = new DOMException('Storage disabled', 'SecurityError');
    vi.mocked(environment.sessionStorage.setItem).mockImplementation(() => {
      throw storageError;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(handleLegacyLocationClientUpgrade(response426, payload, environment)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('reload suppressed'),
      storageError
    );
  });

  it('fails closed without reloading when no browser environment exists', () => {
    expect(handleLegacyLocationClientUpgrade(response426, payload, null)).toBe(true);
  });

  it('keeps the persisted guard when the browser rejects the hard reload', () => {
    const { environment, storage, reload } = createEnvironment();
    const reloadError = new Error('Navigation blocked');
    reload.mockImplementation(() => {
      throw reloadError;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(handleLegacyLocationClientUpgrade(response426, payload, environment)).toBe(true);
    expect(storage.get(LEGACY_LOCATION_UPGRADE_RELOAD_GUARD_KEY)).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[Presence] Legacy-client hard reload failed.',
      reloadError
    );
  });
});
