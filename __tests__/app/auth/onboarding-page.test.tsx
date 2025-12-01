import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingPage from '@/app/onboarding/page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
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
