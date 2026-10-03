import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessages } from '@/hooks/useMessages';
import { messagingApi } from '@/lib/messaging-api';
import { type Message, MessageStatus, MessageType } from '@/types/messaging';

// Keep the real hook, query lifecycle, and cache updates. Only external
// context and API responses are supplied by this isolated scenario.
vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({ currentUserProfile: null }),
}));
vi.mock('@/lib/messaging-api', () => ({
  messagingApi: { getMessages: vi.fn() },
}));
vi.mock('@/utils/debug-logger', () => ({
  debugLogger: { messaging: { enabled: () => false } },
}));

const CONVERSATION_ID = 'conversation-1';
const OLDER_CURSOR = '2023-01-01T12:00:00.000Z|3';

function message(id: string, hour: number): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    senderId: 'sender-1',
    content: `Message ${id}`,
    timestamp: new Date(`2023-01-01T${hour}:00:00.000Z`),
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    attachments: [],
    reactions: [],
    isEdited: false,
  };
}

describe('useMessages paginated history', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    vi.mocked(messagingApi.getMessages).mockImplementation(async (conversationId, options) => {
      if (conversationId !== CONVERSATION_ID) throw new Error('Unexpected conversation');
      if (options?.cursorBefore === undefined) {
        return {
          messages: [message('3', 12), message('4', 13)],
          hasMoreOlder: true,
          nextCursorBefore: OLDER_CURSOR,
        };
      }
      if (options.cursorBefore === OLDER_CURSOR) {
        return { messages: [message('1', 10), message('2', 11)], hasMoreOlder: false };
      }
      throw new Error('Unexpected history cursor');
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.mocked(messagingApi.getMessages).mockReset();
  });

  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  async function openConversation() {
    const hook = renderHook(() => useMessages(CONVERSATION_ID), { wrapper: Wrapper });
    await waitFor(() => expect(hook.result.current.messages.map(({ id }) => id)).toEqual(['3', '4']));
    return hook;
  }

  it('prepends older history in chronological order and reports the end of history', async () => {
    const { result } = await openConversation();
    expect(result.current.hasMoreMessages).toBe(true);

    await act(async () => { await result.current.loadMoreMessages(); });

    await waitFor(() => {
      expect(result.current.messages.map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
      expect(result.current.hasMoreMessages).toBe(false);
    });
  });

  it('keeps a newly received message after the newest message when older history is loaded', async () => {
    const { result } = await openConversation();
    await act(async () => { await result.current.loadMoreMessages(); });
    await waitFor(() => expect(result.current.messages.map(({ id }) => id)).toEqual(['1', '2', '3', '4']));

    act(() => { result.current.addMessage(message('5', 14)); });

    await waitFor(() => expect(result.current.messages.map(({ id }) => id)).toEqual(['1', '2', '3', '4', '5']));
  });
});
