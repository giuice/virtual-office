// __tests__/messaging/client-conversations.test.ts
import { messagingApi } from '@/lib/messaging-api';
import { expect, describe, test, beforeEach, vi } from 'vitest';

// Mock fetch for all tests
global.fetch = vi.fn();

// Helper to set up fetch mock response
function mockFetchResponse(status: number, responseData: any) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseData),
  });
}

// Reset mocks before each test
beforeEach(() => {
  vi.resetAllMocks();
});

describe('Messaging API Client - Conversations', () => {
  // Conversation Preferences Tests
  describe('Conversation Preferences', () => {
    test('getConversationPreferences should return user preferences', async () => {
      const mockPreferences = {
        isPinned: true,
        pinnedOrder: 1,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
      };

      const mockResponse = {
        preferences: mockPreferences
      };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.getConversationPreferences('conversation-id');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/preferences?conversationId=conversation-id',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toEqual(mockPreferences);
    });

    test('updateConversationPreferences should update and return preferences', async () => {
      const updatedPreferences = {
        isPinned: true,
        pinnedOrder: 2,
        isStarred: true,
        isArchived: false,
        notificationsEnabled: false,
      };

      const mockResponse = {
        success: true,
        preferences: updatedPreferences
      };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.updateConversationPreferences('conversation-id', {
        isPinned: true,
        pinnedOrder: 2,
        isStarred: true,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/preferences',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            conversationId: 'conversation-id',
            isPinned: true,
            pinnedOrder: 2,
            isStarred: true,
          }),
        })
      );

      expect(result).toEqual(updatedPreferences);
    });

    test('updateConversationPreferences should handle validation errors', async () => {
      const errorMessage = 'At least one preference field must be provided';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(400, mockResponse)
      );

      await expect(
        messagingApi.updateConversationPreferences('conversation-id', {})
      ).rejects.toThrow(errorMessage);
    });

    test('getConversationPreferences should handle errors', async () => {
      const errorMessage = 'Conversation not found';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(404, mockResponse)
      );

      await expect(
        messagingApi.getConversationPreferences('invalid-id')
      ).rejects.toThrow(errorMessage);
    });
  });

  // getGroupedConversations / getUnreadSummary were deleted (audit B-08):
  // their response shapes never matched the route and nothing consumed them.

  // Pinned Conversations Tests
  describe('Pinned Conversations', () => {
    test('getPinnedConversations should return pinned conversations', async () => {
      const mockPinned = {
        conversations: [
          { id: 'conv-1', type: 'direct', participants: ['user-1', 'user-2'], isPinned: true },
          { id: 'conv-3', type: 'room', roomId: 'room-1', participants: ['user-1', 'user-2', 'user-3'], isPinned: true },
        ],
      };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockPinned)
      );

      const result = await messagingApi.getPinnedConversations();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/get?pinned=true'
      );

      expect(result).toEqual(mockPinned.conversations);
    });

    test('getPinnedConversations should return empty array when no pinned conversations', async () => {
      const mockResponse = { conversations: [] };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.getPinnedConversations();

      expect(result).toEqual([]);
    });
  });

  // Conversation Archive Tests
  describe('Conversation Archive', () => {
    test('setConversationArchiveStatus should archive conversation', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.setConversationArchiveStatus('conversation-id', 'user-id', true);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/archive',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            conversationId: 'conversation-id',
            userId: 'user-id',
            isArchived: true
          }),
        })
      );
    });

    test('setConversationArchiveStatus should unarchive conversation', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.setConversationArchiveStatus('conversation-id', 'user-id', false);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/archive',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            conversationId: 'conversation-id',
            userId: 'user-id',
            isArchived: false
          }),
        })
      );
    });
  });

  // Conversation Read Status Tests
  describe('Conversation Read Status', () => {
    test('markConversationAsRead should mark conversation as read', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.markConversationAsRead('conversation-id', 'user-id');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/conversations/read',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            conversationId: 'conversation-id',
            userId: 'user-id'
          }),
        })
      );
    });

    test('markConversationAsRead should handle errors', async () => {
      const errorMessage = 'Conversation not found';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(404, mockResponse)
      );

      await expect(
        messagingApi.markConversationAsRead('invalid-id', 'user-id')
      ).rejects.toThrow(errorMessage);
    });
  });
});
