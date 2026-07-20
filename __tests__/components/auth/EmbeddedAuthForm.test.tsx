// __tests__/components/auth/EmbeddedAuthForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmbeddedAuthForm } from '@/components/auth/EmbeddedAuthForm';

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

// Mock error mapping
vi.mock('@/lib/auth/error-messages', () => ({
  mapSupabaseAuthError: (error: unknown) => 
    error instanceof Error ? error.message : 'Erro desconhecido',
}));

import { useAuth } from '@/contexts/AuthContext';

describe('EmbeddedAuthForm', () => {
  const mockSignIn = vi.fn();
  const mockSignUp = vi.fn();
  const mockSignInWithGoogle = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnEmailConfirmation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      signIn: mockSignIn,
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      session: null,
      isAuthReady: true,
      actionLoading: false,
    });
  });

  it('renders signup tab by default', () => {
    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    expect(screen.getByRole('tab', { name: /criar conta/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/^nome$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar senha/i)).toBeInTheDocument();
  });

  it('switches to login tab when clicked', async () => {
    const user = userEvent.setup();
    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    await user.click(screen.getByRole('tab', { name: /já tenho conta/i }));

    expect(screen.getByRole('tab', { name: /já tenho conta/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText(/^nome$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/confirmar senha/i)).not.toBeInTheDocument();
  });

  it('pre-fills email from invitation', () => {
    render(
      <EmbeddedAuthForm 
        onSuccess={mockOnSuccess} 
        inviteEmail="invite@example.com" 
      />
    );

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveValue('invite@example.com');
    expect(emailInput).toBeDisabled();
  });

  it('shows Google sign-in button', () => {
    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    expect(screen.getByRole('button', { name: /entrar com google/i })).toBeInTheDocument();
  });

  it('calls signUp on signup form submit', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(undefined);

    render(
      <EmbeddedAuthForm 
        onSuccess={mockOnSuccess}
        onEmailConfirmation={mockOnEmailConfirmation}
      />
    );

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^nome$/i), 'Test User');
    await user.type(screen.getByLabelText(/^senha$/i), 'password123');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'password123');

    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password123', 'Test User');
    });
  }, 15_000);

  it('calls onEmailConfirmation after successful signup', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(undefined);

    render(
      <EmbeddedAuthForm 
        onSuccess={mockOnSuccess}
        onEmailConfirmation={mockOnEmailConfirmation}
      />
    );

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^nome$/i), 'Test User');
    await user.type(screen.getByLabelText(/^senha$/i), 'password123');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'password123');

    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      expect(mockOnEmailConfirmation).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^nome$/i), 'Test User');
    await user.type(screen.getByLabelText(/^senha$/i), 'password123');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'differentpassword');

    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/senhas não conferem/i);
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signIn on login form submit', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue(undefined);

    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    // Switch to login tab
    await user.click(screen.getByRole('tab', { name: /já tenho conta/i }));

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'password123');

    await user.click(screen.getByRole('button', { name: /^entrar$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('calls signInWithGoogle when Google button clicked', async () => {
    const user = userEvent.setup();
    mockSignInWithGoogle.mockResolvedValue(undefined);

    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    await user.click(screen.getByRole('button', { name: /entrar com google/i }));

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });
  });

  it('disables form when disabled prop is true', () => {
    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} disabled={true} />);

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^nome$/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /entrar com google/i })).toBeDisabled();
  });

  it('shows error alert with aria-live for accessibility', async () => {
    const user = userEvent.setup();
    mockSignUp.mockRejectedValue(new Error('Email já cadastrado'));

    render(<EmbeddedAuthForm onSuccess={mockOnSuccess} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^nome$/i), 'Test User');
    await user.type(screen.getByLabelText(/^senha$/i), 'password123');
    await user.type(screen.getByLabelText(/confirmar senha/i), 'password123');

    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
      expect(alert).toHaveTextContent(/email já cadastrado/i);
    });
  });
});
