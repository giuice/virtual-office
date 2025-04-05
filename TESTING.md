# Testing Guide for Virtual Office

This document outlines the testing approach for the Virtual Office application, which uses Vitest for unit testing and Playwright for API and E2E testing.

## Testing Structure

Our testing strategy is divided into two main categories:

1. **Unit Tests (Vitest)**: For testing individual functions, components, and logic in isolation
2. **API/Integration Tests (Playwright)**: For testing API endpoints and full integration scenarios

## Test Locations

- Unit Tests: `__tests__/*.test.ts`
- API Tests: `__tests__/api/*.test.ts`
- Playwright API Tests: `__tests__/api/playwright/*.spec.ts`

## Running Tests

We have several npm scripts set up to run different types of tests:

```bash
# Run all unit tests (excluding Playwright tests)
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with UI
npm run test:ui

# Run Playwright API tests
npm run test:api

# Run Playwright tests with debugging
npm run test:api:debug

# Run Playwright tests with UI
npm run test:api:ui

# Run all tests (unit and API) in sequence
npm run test:all
```

## Writing Unit Tests with Vitest

Vitest is a Vite-native test runner that's compatible with the Jest API. Here's how to write a basic test:

```typescript
import { describe, test, expect, vi } from 'vitest';

describe('Feature name', () => {
  test('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = someFunction(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

### Mocking with Vitest

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('@/lib/some-module', () => ({
  someFunction: vi.fn().mockReturnValue('mocked value'),
}));

// Mock a function
const mockFn = vi.fn().mockImplementation(() => 'mocked result');

// Spy on a method
const spy = vi.spyOn(object, 'method');
```

## Writing API Tests with Playwright

Playwright tests are located in `__tests__/api/playwright/*.spec.ts` and are used to test API endpoints:

```typescript
import { test, expect } from '@playwright/test';

test('API endpoint should return expected data', async ({ request }) => {
  const response = await request.get('/api/endpoint');
  
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toHaveProperty('expectedProperty');
});
```

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on the state from other tests
2. **Mock External Dependencies**: Use mocks for external services, APIs, and databases
3. **Test Coverage**: Aim for high test coverage, especially for critical business logic
4. **Descriptive Test Names**: Use clear, descriptive names that explain what the test is checking
5. **Arrange-Act-Assert**: Structure tests with clear arrangement, action, and assertion phases

## Debugging Tests

### Debugging Vitest Tests

```bash
# Run tests with UI for better debugging
npm run test:ui

# Or use the watch mode
npm run test:watch
```

### Debugging Playwright Tests

```bash
# Run with debug flag to open browser and see execution
npm run test:api:debug

# Or use the UI mode
npm run test:api:ui
```

## Known Issues and Workarounds

1. **API Test Mocking**: When testing API routes, ensure all dependencies are properly mocked, especially Supabase clients and repositories.

2. **Playwright Test Structure**: Playwright tests should be run with the Playwright test runner, not Vitest. Make sure to use the correct command (`npm run test:api`).

3. **Environment Variables**: Tests may require environment variables to be set. Check the `.env.test` file for required variables.

## Continuous Integration

Tests are automatically run in the CI pipeline on every pull request. The pipeline will fail if any tests fail, ensuring code quality before merging.
