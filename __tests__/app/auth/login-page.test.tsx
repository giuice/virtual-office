import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';

const pushMock = vi.fn();
const signInMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: signInMock,
    signInWithGoogle: vi.fn(),
    user: null,
    loading: false,
    isAuthReady: true,
    actionLoading: false,
  }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    signInMock.mockReset();
  });

  it('shows unconfirmed email message and resend button when Supabase returns email_not_confirmed', async () => {
    signInMock.mockRejectedValueOnce({ code: 'email_not_confirmed' });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'password123');
    fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('Email não confirmado')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reenviar confirmação' })).toBeInTheDocument();
  });
});
