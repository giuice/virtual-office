import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReconnectionContext } from '@/hooks/useLastSpace';
import type { Company, Space, User } from '@/types/database';

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

interface CompanyWithSpaceSettings extends Company {
  settings: Company['settings'] & {
    defaultSpaceId?: string;
    homeSpaces?: Record<string, string>;
  };
}

const currentUser: User = {
  id: 'user-1',
  companyId: 'company-1',
  supabase_uid: 'supabase-user-1',
  email: 'user@example.com',
  displayName: 'Grace Hopper',
  status: 'online',
  preferences: {},
  role: 'member',
  lastActive: '2026-03-19T00:00:00.000Z',
  createdAt: '2026-03-19T00:00:00.000Z',
  currentSpaceId: null,
};

const spaces: Space[] = [
  {
    id: 'space-default',
    companyId: 'company-1',
    name: 'Main Workspace',
    type: 'workspace',
    status: 'active',
    capacity: 12,
    features: [],
    position: { x: 0, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-home',
    companyId: 'company-1',
    name: 'Engineering Home',
    type: 'workspace',
    status: 'available',
    capacity: 8,
    features: [],
    position: { x: 4, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-fallback',
    companyId: 'company-1',
    name: 'Fallback Workspace',
    type: 'workspace',
    status: 'in_use',
    capacity: 6,
    features: [],
    position: { x: 8, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-maintenance',
    companyId: 'company-1',
    name: 'Closed Room',
    type: 'workspace',
    status: 'maintenance',
    capacity: 6,
    features: [],
    position: { x: 12, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
];

const company: CompanyWithSpaceSettings = {
  id: 'company-1',
  name: 'Virtual Office',
  adminIds: ['admin-1'],
  createdAt: '2026-03-19T00:00:00.000Z',
  settings: {
    theme: 'light',
    defaultSpaceId: 'space-default',
    homeSpaces: { 'user-1': 'space-home' },
  },
};

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

describe('getReconnectionContext', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('returns first-time placement to company default space for new users', () => {
    const context = getReconnectionContext(currentUser, spaces, company, null, true);

    expect(context.type).toBe('first-time');
    expect(context.spaceId).toBe('space-default');
    expect(context.spaceName).toBe('Main Workspace');
  });

  it('returns first-time placement to first workspace when no default set', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces,
      { ...company, settings: { theme: 'light' } },
      null,
      true
    );

    expect(context.type).toBe('first-time');
    expect(context.spaceId).toBe('space-default');
  });

  it('returns home-space for returning user with assigned home space', () => {
    const context = getReconnectionContext(currentUser, spaces, company, null);

    expect(context.type).toBe('home-space');
    expect(context.spaceId).toBe('space-home');
  });

  it('returns default-space for returning user with no home space', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces,
      { ...company, settings: { theme: 'light', defaultSpaceId: 'space-default' } },
      null
    );

    expect(context.type).toBe('default-space');
    expect(context.spaceId).toBe('space-default');
  });

  it('returns fallback to first workspace when no home or default', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces,
      { ...company, settings: { theme: 'light' } },
      null
    );

    expect(context.type).toBe('fallback');
    expect(context.spaceId).toBe('space-default');
  });

  it('returns null spaceId when no active spaces available', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces.map((space) => ({ ...space, status: 'maintenance' as const })),
      { ...company, settings: { theme: 'light' } },
      null
    );

    expect(context.type).toBe('fallback');
    expect(context.spaceId).toBeNull();
  });

  it('skips inactive/maintenance spaces in all tiers', () => {
    const context = getReconnectionContext(
      currentUser,
      spaces,
      {
        ...company,
        settings: {
          theme: 'light',
          defaultSpaceId: 'space-maintenance',
          homeSpaces: { 'user-1': 'space-maintenance' },
        },
      },
      'space-maintenance'
    );

    expect(context.type).toBe('fallback');
    expect(context.spaceId).toBe('space-default');
  });
});
