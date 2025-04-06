import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest';
import { supabase } from '@/lib/supabase/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cleanup } from '@testing-library/react';

describe('Realtime Presence Updates', () => {
  const TEST_COMPANY_ID = 'test-company-id';
  const TEST_USER_ID = 'test-user-id';
  const TEST_SPACE_ID = 'test-space-id';
  
  // Use a different client to simulate another user
  const testClient: SupabaseClient = createClient(
    'http://localhost:54321',  // Test Supabase URL
    'test-anon-key'           // Test anon key
  );

  beforeAll(async () => {
    // Ensure we're authenticated - this will use our mocked getSession
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) {
      throw new Error('Must be authenticated to run these tests');
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up any subscriptions
    const channels = testClient.getChannels();
    channels.forEach(channel => channel.unsubscribe());
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

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update user location
    await supabase
      .from('users')
      .update({ current_space_id: TEST_SPACE_ID })
      .eq('id', TEST_USER_ID)
      .select()
      .single();

    // Wait for realtime event
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(updateSpy).toHaveBeenCalled();
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.new.current_space_id).toBe(TEST_SPACE_ID);

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

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update user location
    await supabase
      .from('users')
      .update({ current_space_id: null })
      .eq('id', TEST_USER_ID)
      .select()
      .single();

    // Wait for realtime event
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(updateSpy).toHaveBeenCalled();
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.new.company_id).toBe(TEST_COMPANY_ID);

    await channel.unsubscribe();
  });
});