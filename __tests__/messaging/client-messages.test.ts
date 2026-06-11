// __tests__/messaging/client-messages.test.ts
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

  // Typing indicators are broadcast-only (useConversationPresence) — no API
  // surface to test here (audit B-02).

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
