// __tests__/app/join-page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: vi.fn(),
}));

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock useNotification
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

// Mock EmbeddedAuthForm
vi.mock('@/components/auth/EmbeddedAuthForm', () => ({
  EmbeddedAuthForm: ({ onSuccess, inviteEmail }: { onSuccess: () => void; inviteEmail?: string }) => (
    <div data-testid="embedded-auth-form">
      <span data-testid="invite-email">{inviteEmail}</span>
      <button onClick={onSuccess}>Mock Auth Success</button>
    </div>
  ),
}));

// Mock EmailConfirmationMessage
vi.mock('@/components/auth/EmailConfirmationMessage', () => ({
  EmailConfirmationMessage: ({ email }: { email: string }) => (
    <div data-testid="email-confirmation" data-email={email}>
      Email confirmation for {email}
    </div>
  ),
}));

// Mock browser client
vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { resend: vi.fn() },
  }),
}));

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import JoinPage from '@/app/join/page';
import { cleanup } from '@testing-library/react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a proper fetch response
function createFetchResponse(data: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
  });
}

// Helper to setup fetch mock based on URL patterns
function setupFetchMock(config: {
  validateResponse?: object;
  userResponse?: object;
  acceptResponse?: object;
}) {
  const { validateResponse, userResponse, acceptResponse } = config;
  
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/invitations/validate')) {
      return createFetchResponse(
        validateResponse || { valid: false, error: 'Not configured' }
      );
    }
    if (url.includes('/api/users/get-by-id')) {
      return createFetchResponse(
        userResponse || { error: 'Not found' },
        userResponse ? true : false,
        userResponse ? 200 : 404
      );
    }
    if (url.includes('/api/invitations/accept')) {
      return createFetchResponse(
        acceptResponse || { success: false, error: 'Not configured' },
        acceptResponse ? true : false,
        acceptResponse ? 200 : 500
      );
    }
    return createFetchResponse({ error: 'Unknown endpoint' }, false, 404);
  });
}

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  const setupMocks = (options: {
    token?: string | null;
    user?: { id: string } | null;
    session?: object | null;
    isAuthReady?: boolean;
  }) => {
    const { token = null, user = null, session = null, isAuthReady = true } = options;

    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue({
      get: (key: string) => (key === 'token' ? token : null),
    });

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user,
      session,
      isAuthReady,
      loading: false,
    });
  };

  it('shows loading state initially', () => {
    setupMocks({ token: 'test-token', isAuthReady: false });

    render(<JoinPage />);

    expect(screen.getByText(/validando convite/i)).toBeInTheDocument();
  });

  it('shows invalid-token state when no token provided (AC5)', async () => {
    setupMocks({ token: null });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/convite inválido ou expirado/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /ir para login/i })).toHaveAttribute('href', '/login');
  });

  it('shows invalid-token state when token validation fails (AC5)', async () => {
    setupMocks({ token: 'invalid-token' });

    setupFetchMock({
      validateResponse: {
        valid: false,
        error: 'Convite não encontrado',
        errorCode: 'NOT_FOUND',
      },
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/convite inválido ou expirado/i)).toBeInTheDocument();
    });
  });

  it('shows auth UI when token is valid and user not logged in (AC3)', async () => {
    setupMocks({ token: 'valid-token', user: null, session: null });

    setupFetchMock({
      validateResponse: {
        valid: true,
        email: 'invited@example.com',
        companyName: 'Test Company',
        companyId: 'company-1',
      },
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/você foi convidado para test company/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('embedded-auth-form')).toBeInTheDocument();
    expect(screen.getByTestId('invite-email')).toHaveTextContent('invited@example.com');
  });

  it('shows already-company state when user belongs to another company (AC6)', async () => {
    setupMocks({ 
      token: 'valid-token', 
      user: { id: 'user-123' },
      session: { user: { id: 'user-123' } },
    });

    setupFetchMock({
      validateResponse: {
        valid: true,
        email: 'test@example.com',
        companyName: 'New Company',
        companyId: 'company-new',
      },
      userResponse: {
        user: {
          id: 'db-user-1',
          companyId: 'company-existing',
          companyName: 'Existing Company',
        },
      },
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/você já pertence a uma empresa/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /ir para dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('shows accepting state during invitation acceptance (AC8)', async () => {
    setupMocks({ 
      token: 'valid-token', 
      user: { id: 'user-123' },
      session: { user: { id: 'user-123' } },
    });

    // Use custom implementation to control timing for accept call
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/invitations/validate')) {
        return createFetchResponse({
          valid: true,
          email: 'test@example.com',
          companyName: 'Test Company',
          companyId: 'company-1',
        });
      }
      if (url.includes('/api/users/get-by-id')) {
        return createFetchResponse({
          user: { id: 'db-user-1', companyId: null },
        });
      }
      if (url.includes('/api/invitations/accept')) {
        // Delay to show accepting state
        return new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, redirect: '/dashboard' }),
          }), 100)
        );
      }
      return createFetchResponse({ error: 'Unknown' }, false, 404);
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/entrando na empresa/i)).toBeInTheDocument();
    });
  });

  it('shows success state and redirects after acceptance (AC4)', async () => {
    setupMocks({ 
      token: 'valid-token', 
      user: { id: 'user-123' },
      session: { user: { id: 'user-123' } },
    });

    setupFetchMock({
      validateResponse: {
        valid: true,
        email: 'test@example.com',
        companyName: 'Test Company',
        companyId: 'company-1',
      },
      userResponse: {
        user: { id: 'db-user-1', companyId: null },
      },
      acceptResponse: {
        success: true, 
        redirect: '/dashboard',
      },
    });

    render(<JoinPage />);

    // First we should see accepting state, then success
    await waitFor(() => {
      // Look for success message or the success state
      const element = screen.queryByText(/bem-vindo/i) || screen.queryByText(/Redirecionando/i);
      expect(element).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows error state when accept fails', async () => {
    setupMocks({ 
      token: 'valid-token', 
      user: { id: 'user-123' },
      session: { user: { id: 'user-123' } },
    });

    // Use custom implementation to return error for accept
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/invitations/validate')) {
        return createFetchResponse({
          valid: true,
          email: 'test@example.com',
          companyName: 'Test Company',
          companyId: 'company-1',
        });
      }
      if (url.includes('/api/users/get-by-id')) {
        return createFetchResponse({
          user: { id: 'db-user-1', companyId: null },
        });
      }
      if (url.includes('/api/invitations/accept')) {
        return createFetchResponse({ error: 'Server error' }, false, 500);
      }
      return createFetchResponse({ error: 'Unknown' }, false, 404);
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/^erro$/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir para login/i })).toBeInTheDocument();
  });

  it('has proper aria-live attributes for accessibility (AC5)', async () => {
    setupMocks({ token: null });

    render(<JoinPage />);

    await waitFor(() => {
      // The aria-live attribute should be present on error messages
      // When no token, message is "Link de convite inválido..."
      const statusElement = screen.getByText(/Link de convite inválido/i);
      expect(statusElement).toHaveAttribute('aria-live', 'assertive');
    });
  });

  it('displays PT-BR error messages (AC5)', async () => {
    setupMocks({ token: 'expired-token' });

    setupFetchMock({
      validateResponse: {
        valid: false,
        error: 'Este convite expirou',
        errorCode: 'EXPIRED',
      },
    });

    render(<JoinPage />);

    await waitFor(() => {
      expect(screen.getByText(/convite inválido ou expirado/i)).toBeInTheDocument();
      expect(screen.getByText(/entre em contato com o administrador/i)).toBeInTheDocument();
    });
  });
});
