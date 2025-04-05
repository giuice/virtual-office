import { test, expect, APIRequestContext } from '@playwright/test';

// Upload file and return attachment data
test('Upload file and return attachment data', async ({ request }: { request: APIRequestContext }) => {
  // Create FormData with the file
  const formData = new FormData();
  const blob = new Blob(['test content'], { type: 'image/jpeg' });
  const testFile = new File([blob], 'test.jpg', { type: 'image/jpeg' });
  
  // Upload file to messages API
  const response = await request.post('/api/messages/upload', {
    multipart: {
      file: {
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('test content'),
      },
      conversationId: 'conversation-123',
      messageId: 'message-123',
    }
  });
  
  // Assertions
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.attachment).toBeDefined();
  expect(data.attachment.name).toBe('test.jpg');
});

// Get attachments for a message
test('Get attachments for a message', async ({ request }: { request: APIRequestContext }) => {
  const response = await request.get('/api/messages/attachments?messageId=message-123');
  
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.attachments).toBeDefined();
});

// Update message status
test('Update message status', async ({ request }: { request: APIRequestContext }) => {
  const response = await request.patch('/api/messages/status', {
    data: {
      messageId: 'message-123',
      status: 'read',
    }
  });
  
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
});

// Return 401 when user is not authenticated
test('Return 401 when user is not authenticated', async ({ request }: { request: APIRequestContext }) => {
  // This test relies on the server correctly identifying unauthenticated requests
  const response = await request.post('/api/messages/upload', {
    multipart: {
      file: {
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('test content'),
      },
      conversationId: 'conversation-123',
    },
    headers: {
      // Missing or invalid authentication headers
      'Authorization': 'Invalid',
    }
  });
  
  expect(response.status()).toBe(401);
  const data = await response.json();
  expect(data.error).toBe('Unauthorized');
});
