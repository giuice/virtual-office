import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingPage from '@/app/onboarding/page';

const pushMock = vi.fn();
const authUser = { id: 'user-1' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    // Keep the mocked context value referentially stable. The real AuthContext
    // does not manufacture a new user object on every consumer render.
    user: authUser,
    isAuthReady: true,
  }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    company: null,
    isLoading: false,
    currentUserProfile: null,
  }),
}));

describe('OnboardingPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('renders onboarding options when user has no company', async () => {
    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText('Bem-vindo!')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Criar nova empresa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tenho um código de convite' })).toBeInTheDocument();
  });
});
