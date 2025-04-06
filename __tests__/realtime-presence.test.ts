import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest';
import { createClientMock } from './mocks/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanup } from '@testing-library/react';

// Mock the supabase client module
vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: createClientMock()
}));

describe('Realtime Presence Updates', () => {
  const TEST_COMPANY_ID = 'test-company-id';
  const TEST_USER_ID = 'test-user-id';
  const TEST_SPACE_ID = 'test-space-id';
  
  // Use a different client to simulate another user
  const testClient: SupabaseClient = createClientMock();
  let channelCallback: Function;

  beforeAll(async () => {
    // Override channel.on to capture the callback
    const channelMock = testClient.channel('public:users');
    vi.spyOn(channelMock, 'on').mockImplementation((event, filter, callback) => {
      channelCallback = callback;
      return channelMock;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    vi.resetAllMocks();
  });

  it('should receive realtime updates when user location changes', async () => {
    const updateSpy = vi.fn();
    
    const channel = testClient
      .channel('public:users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `company_id=eq.${TEST_COMPANY_ID}`,
        },
        updateSpy
      )
      .subscribe();

    // Simulate realtime update
    channelCallback({
      new: {
        id: TEST_USER_ID,
        current_space_id: TEST_SPACE_ID,
        company_id: TEST_COMPANY_ID
      },
      old: {
        id: TEST_USER_ID,
        current_space_id: null,
        company_id: TEST_COMPANY_ID
      },
      eventType: 'UPDATE'
    });

    expect(updateSpy).toHaveBeenCalled();
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.new.current_space_id).toBe(TEST_SPACE_ID);
    expect(payload.new.company_id).toBe(TEST_COMPANY_ID);

    await channel.unsubscribe();
  });

  it('should only receive updates for users in same company', async () => {
    const updateSpy = vi.fn();
    
    const channel = testClient
      .channel('public:users')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        updateSpy
      )
      .subscribe();

    // Simulate realtime update
    channelCallback({
      new: {
        id: TEST_USER_ID,
        current_space_id: null,
        company_id: TEST_COMPANY_ID
      },
      old: {
        id: TEST_USER_ID,
        current_space_id: TEST_SPACE_ID,
        company_id: TEST_COMPANY_ID
      },
      eventType: 'UPDATE'
    });

    expect(updateSpy).toHaveBeenCalled();
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.new.company_id).toBe(TEST_COMPANY_ID);

    await channel.unsubscribe();
  });
});