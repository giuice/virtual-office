import { describe, it, vi } from 'vitest';
import type { Company, Space, User } from '@/types/database';

vi.mock('@/hooks/useLastSpace', () => ({
  useLastSpace: () => ({
    lastSpaceId: null,
    saveLastSpace: vi.fn(),
    clearLastSpace: vi.fn(),
    isRejoinInProgress: false,
    rejoinAttempts: 0,
  }),
}));

interface CompanyWithSpaceSettings extends Company {
  settings: Company['settings'] & {
    defaultSpaceId?: string;
    homeSpaces?: Record<string, string>;
  };
}

const mockCompany: CompanyWithSpaceSettings = {
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

const mockSpaces: Space[] = [];
const mockUser = {} as User;

void mockCompany;
void mockSpaces;
void mockUser;

describe('getReconnectionContext', () => {
  it.todo('returns first-time placement to company default space for new users');
  it.todo('returns first-time placement to first workspace when no default set');
  it.todo('returns home-space for returning user with assigned home space');
  it.todo('returns default-space for returning user with no home space');
  it.todo('returns fallback to first workspace when no home or default');
  it.todo('returns null spaceId when no active spaces available');
  it.todo('skips inactive/maintenance spaces in all tiers');
});
