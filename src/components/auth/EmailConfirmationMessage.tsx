import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail, RefreshCw } from 'lucide-react';
import { useNotification } from '@/hooks/useNotification';

interface EmailConfirmationMessageProps {
  email: string;
  onResend: () => Promise<void>;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailConfirmationMessage({ email, onResend }: EmailConfirmationMessageProps) {
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    if (resendMessage) {
      alertRef.current?.focus();
    }
  }, [resendMessage]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const startCooldown = () => setCooldownSeconds(RESEND_COOLDOWN_SECONDS);

  const handleResend = async () => {
    if (cooldownSeconds > 0) return;
    setIsResending(true);
    setResendMessage(null);
    try {
      await onResend();
      showSuccess({ description: 'Email reenviado com sucesso!' });
      startCooldown();
    } catch (error) {
      const isRateLimit =
        typeof error === 'object' &&
        error !== null &&
        // @ts-expect-error -- supabase error shape is not strict here
        ((error.status && Number(error.status) === 429) ||
          // @ts-expect-error -- string message fallback
          String(error?.message ?? '').toLowerCase().includes('rate'));

      const message = isRateLimit
        ? 'Limite de reenvio atingido. Aguarde 60 segundos para tentar novamente.'
        : 'Erro ao reenviar. Tente novamente.';

      setResendMessage(message);
      showError({ description: message });

      if (isRateLimit) {
        startCooldown();
      }
    } finally {
      setIsResending(false);
    }
  };

  const isDisabled = isResending || cooldownSeconds > 0;
  const resendLabel =
    cooldownSeconds > 0 ? `Reenviar em ${cooldownSeconds}s` : 'Não recebeu? Reenviar email';

  return (
    <div
      className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      ref={alertRef}
    >
      <div className="mb-4 flex items-center gap-3">
        <CheckCircle className="h-6 w-6 text-green-500" />
        <h2 className="text-lg font-semibold">Conta criada com sucesso!</h2>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enviamos um email de confirmação para <strong>{email}</strong>
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>Abra seu email (verifique spam também)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <span>Clique no link de confirmação</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <span>Você será redirecionado para continuar o cadastro</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={handleResend}
            disabled={isDisabled}
            className="w-full"
          >
            {isResending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Reenviando...
              </>
            ) : (
              resendLabel
            )}
          </Button>
          {cooldownSeconds > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Aguarde o cooldown antes de reenviar.
            </p>
          )}
          {resendMessage && (
            <p className="text-center text-xs text-muted-foreground">{resendMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
