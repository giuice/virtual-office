// __tests__/api/messages-api.test.ts
import { NextRequest } from 'next/server';
import { POST as uploadHandler } from '@/app/api/messages/upload/route';
import { GET as getAttachmentsHandler } from '@/app/api/messages/attachments/route';
import { PATCH as updateStatusHandler } from '@/app/api/messages/status/route';
import { validateUserSession } from '@/lib/auth/session';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
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
      single: vi.fn().mockResolvedValue({ data: { participants: ['user-123'] }, error: null }),
      update: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
    }),
  },
  createClient: vi.fn(),
}));

// Mock the dependencies
vi.mock('@/lib/auth/session');
vi.mock('@/repositories/getSupabaseRepositories');
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn().mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { participants: ['user-123'] }, error: null }),
      update: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
    }),
  }),
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mocked-uuid'),
}));

// Helper to create a mock NextRequest
function createMockRequest(method: string, body?: any, searchParams?: Record<string, string>): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  
  // Create a proper FormData object for file uploads
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

describe('Messages API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful user session validation
    (validateUserSession as any).mockResolvedValue({
      userId: 'user-123',
      userDbId: 'user-db-456',
      error: null,
    });
    
    // Mock repository factory with more detailed implementation
    (getSupabaseRepositories as any).mockResolvedValue({
      messageRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'message-123',
          conversationId: 'conversation-123',
          senderId: 'user-123',
          content: 'Test message',
          attachments: [],
          reactions: [],
        }),
        addAttachment: vi.fn().mockResolvedValue({
          id: 'attachment-123',
          name: 'test.jpg',
          type: 'image/jpeg',
          size: 1024,
          url: 'https://example.com/test.jpg',
          thumbnailUrl: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(true),
        getAttachments: vi.fn().mockResolvedValue([
          {
            id: 'attachment-123',
            name: 'test.jpg',
            type: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/test.jpg',
            thumbnailUrl: null,
          }
        ]),
      },
      conversationRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'conversation-123',
          participants: ['user-123', 'user-456'],
          lastMessage: 'Test message',
          createdAt: new Date().toISOString(),
        }),
        isParticipant: vi.fn().mockResolvedValue(true),
      },
    });
  });
  
  describe('File Upload Route', () => {
    test('should upload file and return attachment data', async () => {
      const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      const mockRequest = createMockRequest('POST', {
        file: mockFile,
        conversationId: 'conversation-123',
        messageId: 'message-123',
      });
      
      // Mock the arrayBuffer method on the File object
      mockFile.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(10));
      
      const response = await uploadHandler(mockRequest as NextRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('attachment');
    });
    
    test('should return 401 when user is not authenticated', async () => {
      // Mock failed session validation
      (validateUserSession as any).mockResolvedValueOnce({
        error: 'Unauthorized',
      });
      
      const mockRequest = createMockRequest('POST', {
        file: new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
        conversationId: 'conversation-123',
      });
      
      const response = await uploadHandler(mockRequest as NextRequest);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });
  
  describe('Message Attachments Route', () => {
    test('should return attachments for a message', async () => {
      const mockRequest = createMockRequest('GET', null, {
        messageId: 'message-123',
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
  
  describe('Message Status Route', () => {
    test('should update message status', async () => {
      const mockRequest = createMockRequest('PATCH', {
        messageId: 'message-123',
        status: 'read',
      });
      
      const response = await updateStatusHandler(mockRequest as NextRequest);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
    });
    
    test('should return 401 when user is not authenticated', async () => {
      // Mock failed session validation
      (validateUserSession as any).mockResolvedValueOnce({
        error: 'Unauthorized',
      });
      
      const mockRequest = createMockRequest('PATCH', {
        messageId: 'message-123',
        status: 'read',
      });
      
      const response = await updateStatusHandler(mockRequest as NextRequest);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data).toHaveProperty('error', 'Unauthorized');
    });
  });
});
