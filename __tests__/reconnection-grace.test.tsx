import { describe, it, vi } from 'vitest';

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal('localStorage', localStorageMock);

vi.mock('@/hooks/useLastSpace', () => ({
  useLastSpace: () => ({
    lastSpaceId: 'space-1',
    saveLastSpace: vi.fn(),
    clearLastSpace: vi.fn(),
    isRejoinInProgress: false,
    rejoinAttempts: 0,
  }),
}));

vi.stubGlobal('location', {
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
});

describe('Reconnection Grace Period', () => {
  it.todo('returns grace-rejoin when within 5-minute window and lastSpaceId exists');
  it.todo('returns home/default when grace period expired');
  it.todo('returns home/default when no disconnect timestamp exists');
  it.todo('clears disconnect timestamp after successful reconnection');
  it.todo('falls back to home space when last space is full on reconnect');
  it.todo('falls back to default space when last space no longer exists');
});
