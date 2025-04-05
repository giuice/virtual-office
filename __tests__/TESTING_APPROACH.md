# Testing Approach for Messaging API

## Current Challenges

Testing the Next.js App Router API routes directly using Jest has proven challenging due to several factors:

1. **ES Modules vs CommonJS Conflict**: The `uuid` package and other dependencies use ES Module syntax, causing conflicts in Jest's default CommonJS environment.

2. **Next.js Runtime Dependencies**: App Router routes rely heavily on the Next.js runtime environment which is difficult to mock completely in a Jest environment.

3. **Browser API Dependencies**: Many of the messaging features depend on browser APIs (File, FormData, etc.) which require extensive mocking.

## Recommended Testing Strategy

Instead of directly testing the API route handlers, we recommend the following approach:

### 1. Core Logic Testing

Extract core business logic into separate, standalone utility functions that can be tested independently:

```typescript
// src/lib/messaging/fileUploadService.ts
export async function processFileUpload(file: File, messageId: string, userId: string) {
  // Core logic for file handling without Next.js API specifics
}

// src/lib/messaging/messageStatusService.ts
export async function updateMessageStatus(messageId: string, status: string, userId: string) {
  // Core logic for status updates
}
```

### 2. Repository Layer Testing

Test the repository layer functions directly, mocking the Supabase client:

```typescript
// __tests__/repositories/messageRepository.test.ts
describe('MessageRepository', () => {
  test('addAttachment', async () => {
    // Test repository methods with mocked Supabase
  });
});
```

### 3. Client-side API Function Testing

Test the client-side API functions in `messaging-api.ts` by mocking fetch responses:

```typescript
// __tests__/messaging-api.test.ts
describe('uploadMessageAttachment', () => {
  test('uploads file and returns attachment details', async () => {
    // Mock fetch to return expected response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ 
        success: true, 
        attachment: { /* mock data */ } 
      }),
    });
    
    const result = await uploadMessageAttachment(mockFile, 'msg-123');
    expect(result).toHaveProperty('id');
  });
});
```

### 4. Integration Testing with Actual API

For more complete testing, consider:

1. Using Cypress or Playwright for E2E tests that actually call the API endpoints
2. Creating a simple test harness page in the app for manual testing
3. Using Postman or similar tools to test API endpoints directly

## Manual Testing Checklist

Until automated tests are fully implemented, use this checklist for manual testing:

- [ ] File upload works and generates a proper attachment record
- [ ] File deletion removes both the storage object and attachment record
- [ ] Message status updates are properly saved
- [ ] Typing indicators are broadcast to conversation participants
- [ ] Conversation archive status can be toggled
- [ ] Marking a conversation as read updates the unread count

## Future Improvements

- Extract route handlers' core logic into separate utility functions
- Add more granular error handling in API routes
- Consider implementing a middleware testing approach
- Add integration tests with Cypress or Playwright
