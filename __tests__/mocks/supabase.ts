import { vi } from 'vitest';

const channelMock = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
};

export const createClientMock = vi.fn().mockReturnValue({
  channel: vi.fn().mockReturnValue(channelMock),
  getChannels: vi.fn().mockReturnValue([channelMock]),
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: 'test-user-id' }
        }
      },
      error: null
    })
  },
  from: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'test-user-id',
        current_space_id: 'test-space-id',
        company_id: 'test-company-id'
      },
      error: null
    })
  })
});

export const mockSupabase = {
  createClient: createClientMock
};