import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISCONNECT_TS_KEY,
  FIRST_LOGIN_KEY,
  GRACE_PERIOD_MS,
  getReconnectionContext,
} from '@/hooks/useLastSpace';
import type { Company, Space, User } from '@/types/database';

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
  clear: vi.fn(() => {
    storage.clear();
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

const currentUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: 'company-1',
  supabase_uid: 'supabase-user-1',
  email: 'user@example.com',
  displayName: 'Grace Hopper',
  status: 'online',
  preferences: {},
  role: 'member',
  lastActive: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  currentSpaceId: null,
};

const spaces: Space[] = [
  {
    id: 'private-space',
    companyId: 'company-1',
    name: 'Focus Room',
    type: 'private_office',
    status: 'active',
    capacity: 2,
    features: [],
    position: { x: 0, y: 0, width: 2, height: 2 },
    accessControl: { isPublic: false },
  },
  {
    id: 'home-space',
    companyId: 'company-1',
    name: 'Engineering Bay',
    type: 'workspace',
    status: 'active',
    capacity: 12,
    features: [],
    position: { x: 2, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'default-space',
    companyId: 'company-1',
    name: 'Main Workspace',
    type: 'workspace',
    status: 'active',
    capacity: 24,
    features: [],
    position: { x: 6, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
];

const company: Company = {
  id: 'company-1',
  name: 'Virtual Office',
  adminIds: [],
  createdAt: new Date().toISOString(),
  settings: {
    defaultSpaceId: 'default-space',
    homeSpaces: {
      '11111111-1111-4111-8111-111111111111': 'home-space',
    },
  },
};

const defaultOnlyCompany: Company = {
  ...company,
  settings: {
    defaultSpaceId: 'default-space',
  },
};

describe('Reconnection Grace Period', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    storage.clear();
    vi.clearAllMocks();
  });

  it('returns grace-rejoin when within 5-minute window and lastSpaceId exists', () => {
    localStorageMock.setItem(DISCONNECT_TS_KEY, String(Date.now() - GRACE_PERIOD_MS + 1_000));
    localStorageMock.setItem(FIRST_LOGIN_KEY, 'true');

    const context = getReconnectionContext(currentUser, spaces, company, 'private-space');

    expect(context.type).toBe('grace-rejoin');
    expect(context.spaceId).toBe('private-space');
    expect(context.reason).toContain('5-minute grace period');
  });

  it('returns home/default when grace period expired', () => {
    localStorageMock.setItem(DISCONNECT_TS_KEY, String(Date.now() - GRACE_PERIOD_MS - 1_000));
    localStorageMock.setItem(FIRST_LOGIN_KEY, 'true');

    const context = getReconnectionContext(currentUser, spaces, company, 'private-space');

    expect(context.type).toBe('home-space');
    expect(context.spaceId).toBe('home-space');
  });

  it('returns home/default when no disconnect timestamp exists', () => {
    localStorageMock.setItem(FIRST_LOGIN_KEY, 'true');

    const context = getReconnectionContext(
      currentUser,
      spaces,
      defaultOnlyCompany,
      'private-space'
    );

    expect(context.type).toBe('default-space');
    expect(context.spaceId).toBe('default-space');
  });
});
