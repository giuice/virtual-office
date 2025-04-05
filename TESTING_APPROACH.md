# Testing Approach: Vitest and Playwright

## Overview

This document outlines our testing strategy for the Virtual Office application, focusing on the transition from Jest to Vitest and Playwright for a more effective testing approach.

## Testing Frameworks

### Vitest
- **Purpose**: Unit and integration testing for application logic
- **Benefits**:
  - Faster execution than Jest
  - Better ESM support
  - Compatible with Vite for frontend testing
  - Lower setup overhead
  - Compatible with existing Jest syntax (easy migration)

### Playwright
- **Purpose**: End-to-end and API testing
- **Benefits**:
  - Powerful browser automation
  - Native support for testing Next.js API routes
  - More reliable than other E2E testing solutions
  - Cross-browser testing capabilities
  - Headless or headed test execution

## Directory Structure

```
__tests__/
├── unit/             # Vitest unit tests
├── integration/      # Vitest integration tests
└── api/
    └── playwright/   # Playwright API tests
```

## Testing Strategy

### Testing Next.js API Routes

Testing API routes in Next.js App Router presents unique challenges due to:
- The coupling of routes to the Next.js framework
- Limited access to route handlers outside the Next.js context
- Complications with middleware, auth, and other Next.js features

Our approach involves:

1. **Core Logic Testing** (Vitest):
   - Extract business logic into separate functions/modules
   - Test these functions independently using Vitest
   - Focus on data transformation, validation, and business rules

2. **API Integration Testing** (Playwright):
   - Test the actual API endpoints with Playwright
   - Run a development server during tests
   - Make real HTTP requests to endpoints
   - Assert on response status, headers, and body
   - Test error conditions and edge cases

### Mocking Strategy

- **Database**: Use mock repositories that implement the same interface as real repositories
- **Authentication**: Mock auth services to return predefined user data
- **External Services**: Use MSW (Mock Service Worker) or similar for third-party API mocks

## Running Tests

```bash
# Run Vitest tests
npm run test

# Run Vitest tests with coverage
npm run test:coverage

# Run Playwright API tests
npm run test:api

# Run specific test file
npm run test -- messaging-api.test.ts
```

## Test Examples

### Vitest Unit Test Example

```typescript
import { describe, test, expect, vi } from 'vitest';
import { messagingApi } from '@/lib/messaging-api';

describe('Messaging API Client', () => {
  test('uploadMessageAttachment should upload file', async () => {
    // Arrange
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    }));
    
    // Act
    const result = await messagingApi.uploadMessageAttachment(
      new File(['test'], 'test.txt'), 
      'conversation-id', 
      'message-id'
    );
    
    // Assert
    expect(global.fetch).toHaveBeenCalledWith('/api/messages/upload', expect.any(Object));
  });
});
```

### Playwright API Test Example

```typescript
import { test, expect } from '@playwright/test';

test('API route should return message attachments', async ({ request }) => {
  // Act
  const response = await request.get('/api/messages/attachments?messageId=message-123');
  
  // Assert
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

## Migration from Jest

The migration from Jest to Vitest involves:

1. Replacing Jest with Vitest in package.json
2. Updating test files to use Vitest imports
3. Converting Jest-specific syntax to Vitest equivalents
4. Setting up Playwright for API and E2E tests

Vitest provides good compatibility with Jest's API, making the transition relatively seamless.

## CI/CD Integration

Tests are run in the CI/CD pipeline to ensure code quality before deployment:

1. Unit and integration tests run on every PR
2. API tests run on main branch builds
3. Test coverage reports are generated and published

## Best Practices

1. **Test Independence**: Each test should be independent and not rely on other tests
2. **Focus on Behavior**: Test what code does, not how it's implemented
3. **Test Real Use Cases**: Prioritize testing real user scenarios
4. **Keep Tests Simple**: Simple tests are easier to maintain
5. **Mock Judiciously**: Only mock what's necessary to isolate the code under test
