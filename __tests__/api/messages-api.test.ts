import { NextRequest } from 'next/server';
import { POST as uploadHandler } from '@/app/api/messages/upload/route';
import { GET as getAttachmentsHandler } from '@/app/api/messages/attachments/route';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import type { IMessageRepository } from '@/repositories/interfaces';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { jsonError } from '@/lib/auth/authorize';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'conversation-123';
const MESSAGE_ID = 'message-123';

const mockRequireConversationParticipant = vi.fn();
const mockRequireMessageParticipant = vi.fn();

vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/authorize')>();
  return {
    ...actual,
    requireConversationParticipant: (conversationId: string) =>
      mockRequireConversationParticipant(conversationId),
    requireMessageParticipant: (messageId: string) => mockRequireMessageParticipant(messageId),
  };
});

vi.mock('@/repositories/getSupabaseRepositories');

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mocked-uuid'),
}));

function createMockRequest(method: string, body?: any, searchParams?: Record<string, string>): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });

  let formData: FormData | undefined;
  if (body && body.file) {
    formData = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (key === 'file') {
        formData!.append(key, value as Blob, (value as File).name);
      } else {
        formData!.append(key, value as string);
      }
    });
  }

  const request = {
    method,
    headers,
    json: vi.fn().mockResolvedValue(body),
    formData: vi.fn().mockResolvedValue(formData || new FormData()),
    nextUrl: {
      searchParams: new URLSearchParams(searchParams),
    },
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
  };

  return request as unknown as NextRequest;
}

const mockAuthorizedCtx = {
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { participants: ['user-db-456'] }, error: null }),
      delete: vi.fn().mockReturnThis(),
      remove: vi.fn().mockResolvedValue({}),
    }),
  },
  serviceClient: {},
  dbUser: { id: APP_USER_ID, companyId: 'company-1', role: 'member' },
  conversation: {
    id: CONVERSATION_ID,
    type: 'direct',
    roomId: null,
  },
};

const mockMessageCtx = {
  ...mockAuthorizedCtx,
  message: {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: APP_USER_ID,
  },
};

describe('Messages API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireConversationParticipant.mockResolvedValue(mockAuthorizedCtx);
    mockRequireMessageParticipant.mockResolvedValue(mockMessageCtx);
    
    vi.mocked(getSupabaseRepositories).mockResolvedValue({
      messageRepository: {
        findById: vi.fn().mockResolvedValue({
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          senderId: 'user-123',
          content: 'Test message',
          attachments: [],
          reactions: [],
        }),
        update: vi.fn().mockResolvedValue({
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          senderId: 'user-123',
          content: 'Test message',
          attachments: [],
          reactions: [],
          status: 'read',
        }),
        addAttachment: vi.fn().mockResolvedValue({
          id: 'attachment-123',
          name: 'test.jpg',
          type: 'image/jpeg',
          size: 1024,
          url: 'https://example.com/test.jpg',
          thumbnailUrl: null,
        }),
      } as unknown as IMessageRepository,
    } as unknown as Awaited<ReturnType<typeof getSupabaseRepositories>>);
  });

  describe('File Upload Route', () => {
    test('should upload file and return attachment data', async () => {
      const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      mockFile.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(10));
      const mockRequest = createMockRequest('POST', {
        file: mockFile,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      });

      const response = await uploadHandler(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('attachment');
    });

    test('should return 401 when user is not authenticated', async () => {
      mockRequireConversationParticipant.mockResolvedValueOnce(
        { errorResponse: jsonError(401, 'UNAUTHORIZED', 'Authentication required') }
      );

      const mockRequest = createMockRequest('POST', {
        file: new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
        conversationId: CONVERSATION_ID,
      });

      const response = await uploadHandler(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('Message Attachments Route', () => {
    test('should return attachments for a message', async () => {
      const mockRequest = createMockRequest('GET', null, {
        messageId: MESSAGE_ID,
      });

      const response = await getAttachmentsHandler(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('attachments');
    });

    test('should return 400 when messageId is missing', async () => {
      const mockRequest = createMockRequest('GET');

      const response = await getAttachmentsHandler(mockRequest as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Message ID is required');
    });
  });
});
