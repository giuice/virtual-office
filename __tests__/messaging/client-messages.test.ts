// __tests__/messaging/client-messages.test.ts
import { messagingApi } from '@/lib/messaging-api';
import { MessageStatus } from '@/types/messaging';
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

describe('Messaging API Client - Messages', () => {
  // File Attachment Tests
  describe('File Attachments', () => {
    test('uploadMessageAttachment should upload file and return attachment data', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const mockResponse = {
        success: true,
        attachment: {
          id: 'test-id',
          name: 'test.txt',
          type: 'text/plain',
          size: 12,
          url: 'https://example.com/test.txt',
          thumbnailUrl: null
        }
      };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.uploadMessageAttachment(
        mockFile,
        'conversation-id',
        'message-id'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );

      expect(result).toEqual(mockResponse.attachment);
    });

    test('deleteMessageAttachment should delete attachment and return success', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.deleteMessageAttachment('attachment-id');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/attachment/attachment-id',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toBe(true);
    });

    test('getMessageAttachments should return attachment list', async () => {
      const mockAttachments = [
        {
          id: 'attachment-1',
          name: 'file1.txt',
          type: 'text/plain',
          size: 100,
          url: 'https://example.com/file1.txt',
          thumbnailUrl: null
        },
        {
          id: 'attachment-2',
          name: 'image.jpg',
          type: 'image/jpeg',
          size: 1024,
          url: 'https://example.com/image.jpg',
          thumbnailUrl: 'https://example.com/thumb_image.jpg'
        }
      ];

      const mockResponse = {
        success: true,
        attachments: mockAttachments
      };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      const result = await messagingApi.getMessageAttachments('message-id');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/attachments?messageId=message-id',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toEqual(mockAttachments);
    });

    test('getMessageAttachments should handle errors', async () => {
      const errorMessage = 'Message not found';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(404, mockResponse)
      );

      await expect(
        messagingApi.getMessageAttachments('invalid-id')
      ).rejects.toThrow(errorMessage);
    });
  });

  // Message Status Tests
  describe('Message Status', () => {
    test('updateMessageStatus should update status and return successfully', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.updateMessageStatus('message-id', MessageStatus.READ, 'user-id');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/status',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            messageId: 'message-id',
            status: MessageStatus.READ,
            userId: 'user-id'
          }),
        })
      );
    });

    test('updateMessageStatus should handle errors', async () => {
      const errorMessage = 'Not authorized to update this message';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(403, mockResponse)
      );

      await expect(
        messagingApi.updateMessageStatus('message-id', MessageStatus.READ, 'user-id')
      ).rejects.toThrow(errorMessage);
    });

    test('updateMessageStatus should handle different status types', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementation(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.updateMessageStatus('message-id', MessageStatus.DELIVERED, 'user-id');
      await messagingApi.updateMessageStatus('message-id', MessageStatus.SENT, 'user-id');

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  // Typing Indicator Tests
  describe('Typing Indicators', () => {
    test('sendTypingIndicator should send typing status', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.sendTypingIndicator('conversation-id', 'user-id', true);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/typing',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            conversationId: 'conversation-id',
            userId: 'user-id',
            isTyping: true
          }),
        })
      );
    });

    test('sendTypingIndicator should send stop typing status', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(200, mockResponse)
      );

      await messagingApi.sendTypingIndicator('conversation-id', 'user-id', false);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.isTyping).toBe(false);
    });

    test('sendTypingIndicator should not throw on errors (fail silently)', async () => {
      const mockResponse = { error: 'Server error' };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(500, mockResponse)
      );

      // Should not throw - typing indicators fail silently
      await expect(
        messagingApi.sendTypingIndicator('conversation-id', 'user-id', true)
      ).resolves.not.toThrow();
    });
  });

  // Error Handling Tests
  describe('Error Handling', () => {
    test('API should handle network errors', async () => {
      (global.fetch as any).mockImplementationOnce(() =>
        Promise.reject(new Error('Network error'))
      );

      await expect(
        messagingApi.getMessageAttachments('message-id')
      ).rejects.toThrow('Network error');
    });

    test('API should handle API errors with error messages', async () => {
      const errorResponse = { error: 'Resource not found' };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(404, errorResponse)
      );

      await expect(
        messagingApi.getMessageAttachments('message-id')
      ).rejects.toThrow(errorResponse.error);
    });

    test('deleteMessageAttachment should handle unauthorized errors', async () => {
      const errorMessage = 'Unauthorized';
      const mockResponse = { error: errorMessage };

      (global.fetch as any).mockImplementationOnce(() =>
        mockFetchResponse(401, mockResponse)
      );

      await expect(
        messagingApi.deleteMessageAttachment('attachment-id')
      ).rejects.toThrow(errorMessage);
    });
  });
});
