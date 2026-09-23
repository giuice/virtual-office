import type { PropsWithChildren, ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const channels: Array<{
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    teardown: ReturnType<typeof vi.fn>;
    emitStatus: (status: string) => void;
  }> = [];

  const client = {
    channel: vi.fn((_topic: string) => {
      let statusHandler: ((status: string) => void) | null = null;
      const channel = {
        on: vi.fn(),
        subscribe: vi.fn((handler: (status: string) => void) => {
          statusHandler = handler;
          return channel;
        }),
        unsubscribe: vi.fn().mockResolvedValue('ok'),
        teardown: vi.fn(),
        emitStatus: (status: string) => statusHandler?.(status),
      };
      channel.on.mockReturnValue(channel);
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  };

  return { channels, client };
});

vi.mock('@/lib/supabase/client', () => ({ supabase: mocks.client }));
vi.mock('@/utils/debug-logger', () => ({
  debugLogger: {
    messaging: {
      enabled: () => false,
      trace: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import { useMessageSubscription } from '@/hooks/realtime/useMessageSubscription';
import type { Message } from '@/types/messaging';

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function useTestSubscription(options?: {
  isActive?: boolean;
  currentUserId?: string;
  onInsert?: (message: Message) => void;
}) {
  return useMessageSubscription({
    companyId: COMPANY_ID,
    currentUserId: USER_ID,
    ...options,
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren): ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useMessageSubscription retry ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.channels.splice(0);
    mocks.client.removeChannel.mockResolvedValue('ok');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces repeated failure statuses into one retry', async () => {
    const queryClient = new QueryClient();
    renderHook(() => useTestSubscription(), { wrapper: createWrapper(queryClient) });

    expect(mocks.channels).toHaveLength(1);
    act(() => {
      mocks.channels[0].emitStatus('SUBSCRIBED');
      mocks.channels[0].emitStatus('CLOSED');
      mocks.channels[0].emitStatus('CLOSED');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(mocks.channels).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.channels).toHaveLength(2);
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channels[0]);
  });

  it('ignores late CLOSED events from a retired channel', async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useTestSubscription(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      mocks.channels[0].emitStatus('SUBSCRIBED');
      mocks.channels[0].emitStatus('CHANNEL_ERROR');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.channels).toHaveLength(2);

    act(() => {
      mocks.channels[1].emitStatus('SUBSCRIBED');
      mocks.channels[0].emitStatus('CLOSED');
    });
    expect(result.current.status).toBe('SUBSCRIBED');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.channels).toHaveLength(2);
  });

  it('backs off when a channel repeatedly subscribes and closes before it is stable', async () => {
    const queryClient = new QueryClient();
    renderHook(() => useTestSubscription(), { wrapper: createWrapper(queryClient) });

    act(() => {
      mocks.channels[0].emitStatus('SUBSCRIBED');
      mocks.channels[0].emitStatus('CLOSED');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.channels).toHaveLength(2);

    act(() => {
      mocks.channels[1].emitStatus('SUBSCRIBED');
      mocks.channels[1].emitStatus('CLOSED');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(mocks.channels).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.channels).toHaveLength(3);
  });

  it('retires a channel once and does not retry after unmount', async () => {
    const queryClient = new QueryClient();
    const { unmount } = renderHook(() => useTestSubscription(), {
      wrapper: createWrapper(queryClient),
    });
    const channel = mocks.channels[0];

    act(() => channel.emitStatus('SUBSCRIBED'));
    unmount();
    act(() => channel.emitStatus('CLOSED'));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel);
    expect(channel.unsubscribe).not.toHaveBeenCalled();
    expect(mocks.channels).toHaveLength(1);
  });

  it('uses a new topic when the effect is replaced before removal settles', async () => {
    let resolveRemoval!: (status: string) => void;
    mocks.client.removeChannel.mockReturnValueOnce(new Promise((resolve) => {
      resolveRemoval = resolve;
    }));
    const queryClient = new QueryClient();
    const { rerender } = renderHook(
      ({ isActive }: { isActive: boolean }) => useTestSubscription({ isActive }),
      {
        initialProps: { isActive: true },
        wrapper: createWrapper(queryClient),
      },
    );
    const firstTopic = mocks.client.channel.mock.calls[0]?.[0];

    rerender({ isActive: false });
    rerender({ isActive: true });

    expect(mocks.client.channel).toHaveBeenCalledTimes(2);
    expect(mocks.client.channel.mock.calls[1]?.[0]).not.toBe(firstTopic);

    await act(async () => {
      resolveRemoval('ok');
    });
  });

  it('ignores database events from the old account after an identity switch', async () => {
    let resolveRemoval!: (status: string) => void;
    mocks.client.removeChannel.mockReturnValueOnce(new Promise((resolve) => {
      resolveRemoval = resolve;
    }));
    const queryClient = new QueryClient();
    const cacheWrite = vi.spyOn(queryClient, 'setQueryData');
    const onInsert = vi.fn();
    const { rerender, result } = renderHook(
      ({ currentUserId }: { currentUserId: string }) => useTestSubscription({
        currentUserId,
        onInsert,
      }),
      {
        initialProps: { currentUserId: USER_ID },
        wrapper: createWrapper(queryClient),
      },
    );
    const oldMessageHandler = mocks.channels[0].on.mock.calls[0]?.[2] as
      | ((payload: unknown) => void)
      | undefined;

    act(() => mocks.channels[0].emitStatus('SUBSCRIBED'));
    expect(result.current.status).toBe('SUBSCRIBED');

    rerender({ currentUserId: OTHER_USER_ID });
    expect(result.current.status).toBeNull();
    act(() => {
      oldMessageHandler?.({
        eventType: 'INSERT',
        new: {
          id: 'message-1',
          conversation_id: 'conversation-1',
          sender_id: 'sender-1',
          content: 'late message',
          message_type: 'text',
          created_at: '2026-08-04T12:00:00.000Z',
          updated_at: '2026-08-04T12:00:00.000Z',
        },
        old: {},
        schema: 'public',
        table: 'messages',
        commit_timestamp: '2026-08-04T12:00:00.000Z',
      });
    });

    expect(mocks.channels).toHaveLength(2);
    expect(cacheWrite).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();

    await act(async () => {
      resolveRemoval('ok');
    });
  });

  it('forces local teardown when channel removal does not complete cleanly', async () => {
    mocks.client.removeChannel.mockResolvedValueOnce('timed out');
    const queryClient = new QueryClient();
    const { unmount } = renderHook(() => useTestSubscription(), {
      wrapper: createWrapper(queryClient),
    });
    const channel = mocks.channels[0];

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(channel.teardown).toHaveBeenCalledTimes(1);
  });

  it('does not create a channel without company and user scope', () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useMessageSubscription({ isActive: true }), {
      wrapper: createWrapper(queryClient),
    });

    expect(mocks.client.channel).not.toHaveBeenCalled();
    expect(result.current.status).toBeNull();
  });
});
