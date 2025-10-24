// test-users.ts
// Test user credentials and login helpers for E2E tests

export const TEST_USERS = {
  sender: {
    email: 'testuser1@example.com',
    password: 'testpassword123',
    displayName: 'Test User 1'
  },
  recipient: {
    email: 'testuser2@example.com',
    password: 'testpassword123',
    displayName: 'Test User 2'
  }
};

// API login helper (if needed for setup, not for E2E UI tests)
export async function loginViaAPI(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  return response.json();
}

// Note: For E2E tests, use UI login flow instead of API login