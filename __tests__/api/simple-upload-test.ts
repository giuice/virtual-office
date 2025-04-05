// __tests__/api/simple-upload-test.ts
import { NextRequest } from 'next/server';
import { POST as uploadHandler } from '@/app/api/messages/upload/route';
import { validateUserSession } from '@/lib/auth/session';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';

// Mock the dependencies
jest.mock('@/lib/auth/session');
jest.mock('@/repositories/getSupabaseRepositories');
jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: jest.fn().mockReturnValue({
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { participants: ['user-db-456'] } }),
    }),
  }),
}));

// Simple helper to create a mock NextRequest with better error handling
function createMockRequest(method: string, formData?: FormData): NextRequest {
  try {
    // Create a more straightforward request object
    const request = {
      method,
      formData: jest.fn().mockResolvedValue(formData || new FormData()),
      nextUrl: { searchParams: new URLSearchParams() },
    };
    
    return request as unknown as NextRequest;
  } catch (error) {
    console.error('Error creating mock request:', error);
    throw error;
  }
}

describe('Upload API Test', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock successful user session
    (validateUserSession as jest.Mock).mockResolvedValue({
      userId: 'user-123', // Firebase UID
      userDbId: 'user-db-456', // Database UUID
      error: null,
    });
    
    // Mock repositories
    (getSupabaseRepositories as jest.Mock).mockResolvedValue({
      messageRepository: {
        findById: jest.fn().mockResolvedValue({
          id: 'message-123',
          conversationId: 'conversation-123',
          senderId: 'user-db-456',
          content: 'Test message',
        }),
        addAttachment: jest.fn().mockResolvedValue({
          id: 'attachment-123',
          name: 'test.jpg',
          type: 'image/jpeg',
          size: 1024,
          url: 'https://example.com/test.jpg',
        }),
      },
    });
  });
  
  test('should upload file successfully', async () => {
    try {
      // Create test FormData
      const formData = new FormData();
      const mockFile = new Blob(['test content'], { type: 'image/jpeg' });
      formData.append('file', mockFile, 'test.jpg');
      formData.append('conversationId', 'conversation-123');
      formData.append('messageId', 'message-123');
      
      const request = createMockRequest('POST', formData);
      
      // Call the handler
      const response = await uploadHandler(request);
      const data = await response.json();
      
      // Assertions
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('attachment');
    } catch (error) {
      console.error('Test failure:', error);
      throw error;
    }
  });
});
