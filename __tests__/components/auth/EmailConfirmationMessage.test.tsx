import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailConfirmationMessage } from '@/components/auth/EmailConfirmationMessage';

const showSuccess = vi.fn();
const showError = vi.fn();

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess,
    showError,
  }),
}));

describe('EmailConfirmationMessage', () => {
  const mockOnResend = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnResend.mockReset();
    showSuccess.mockReset();
    showError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly with email and instructions in Portuguese', () => {
    render(<EmailConfirmationMessage email="test@example.com" onResend={mockOnResend} />);

    expect(screen.getByText('Conta criada com sucesso!')).toBeInTheDocument();
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    expect(screen.getByText('Abra seu email (verifique spam também)')).toBeInTheDocument();
    expect(screen.getByText('Clique no link de confirmação')).toBeInTheDocument();
    expect(screen.getByText('Você será redirecionado para continuar o cadastro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não recebeu? Reenviar email' })).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<EmailConfirmationMessage email="test@example.com" onResend={mockOnResend} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });

  it('calls onResend, shows cooldown and disables button during cooldown', async () => {
    mockOnResend.mockResolvedValueOnce(undefined);

    render(<EmailConfirmationMessage email="test@example.com" onResend={mockOnResend} />);

    const button = screen.getByRole('button', { name: 'Não recebeu? Reenviar email' });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(showSuccess).toHaveBeenCalledWith({ description: 'Email reenviado com sucesso!' });
    expect(mockOnResend).toHaveBeenCalledWith();
    expect(button).toHaveTextContent(/Reenviar em 60s/);
    expect(button).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Não recebeu? Reenviar email');
  });

  it('shows error message on resend failure', async () => {
    mockOnResend.mockRejectedValueOnce(new Error('Rate limit'));

    render(<EmailConfirmationMessage email="test@example.com" onResend={mockOnResend} />);

    const button = screen.getByRole('button', { name: 'Não recebeu? Reenviar email' });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      screen.getByText('Limite de reenvio atingido. Aguarde 60 segundos para tentar novamente.')
    ).toBeInTheDocument();
    expect(showError).toHaveBeenCalled();
  });
});
