# Messaging API Tests

This directory contains tests for the messaging API implementation, covering both client-side API functions and server-side API routes.

## Setup

The tests use Jest as the testing framework. The testing dependencies are:

- Jest
- @testing-library/jest-dom
- @testing-library/react
- jest-environment-jsdom

## Running Tests

To run all tests:

```bash
npm run test
```

To run tests in watch mode (tests will rerun when files change):

```bash
npm run test:watch
```

## Test Structure

### Client API Tests

`messaging-api.test.ts` covers the client-side API functions for:

- File attachments (upload, delete, get)
- Message status updates
- Typing indicators
- Conversation archive status
- Conversation read status
- Error handling

These tests mock the `fetch` API to simulate API responses.

### API Route Tests

`api/messages-api.test.ts` covers the server-side API routes for:

- File uploads
- Message attachments
- Message status updates

These tests mock the necessary dependencies like Supabase, session validation, and repositories.

## Test Coverage

The tests cover the following aspects:

- Successful API calls and responses
- Error handling for invalid requests
- Authentication and authorization checks

## Extending Tests

When adding new functionality to the messaging API, follow these steps:

1. Add tests for the client-side API function in `messaging-api.test.ts`
2. Add tests for the corresponding API route in `api/messages-api.test.ts`
3. Ensure that both successful cases and error cases are covered

## Mocking Strategy

- Client tests: Mock the `fetch` API
- API route tests: Mock the Supabase client, session validation, and repositories
