import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReconnectionContext } from '@/hooks/useLastSpace';
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

describe('server-authoritative reconnection fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    storage.clear();
    vi.clearAllMocks();
  });

  it('does not recreate placement from a scoped recovery hint', () => {
    const context = getReconnectionContext(currentUser, spaces, company, 'private-space');

    expect(context.type).toBe('home-space');
    expect(context.spaceId).toBe('home-space');
    expect(context.reason).toContain('assigned home space');
  });

  it('falls back to home when the scoped hint is not joinable', () => {
    const unavailableSpaces = spaces.map((space) =>
      space.id === 'private-space' ? { ...space, status: 'maintenance' as const } : space
    );
    const context = getReconnectionContext(currentUser, unavailableSpaces, company, 'private-space');

    expect(context.type).toBe('home-space');
    expect(context.spaceId).toBe('home-space');
  });

  it('uses default when no scoped hint or home assignment exists', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces,
      defaultOnlyCompany,
      null
    );

    expect(context.type).toBe('default-space');
    expect(context.spaceId).toBe('default-space');
  });
});
