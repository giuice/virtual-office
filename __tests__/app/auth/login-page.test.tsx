import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';

const replaceMock = vi.fn();
const signInMock = vi.fn();
const authUser = { id: 'auth-user-1' };
let currentUser: typeof authUser | null = null;
let currentCompany: { id: string } | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: signInMock,
    signInWithGoogle: vi.fn(),
    user: currentUser,
    loading: false,
    isAuthReady: true,
    actionLoading: false,
  }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    isLoading: false,
    company: currentCompany,
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
    replaceMock.mockReset();
    signInMock.mockReset();
    currentUser = null;
    currentCompany = null;
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

  it('replaces the route only once when Strict Mode restores an authenticated company user', async () => {
    currentUser = authUser;
    currentCompany = { id: 'company-1' };

    render(
      <StrictMode>
        <LoginPage />
      </StrictMode>
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/floor-plan'));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Redirecionando...')).toBeInTheDocument();
  });
});
