'use client';

import { useReducerState } from '@/hooks/useReducerState';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useCompany } from '@/contexts/CompanyContext';
import { UserRole } from '@/types/database';
import { useNotification } from '@/hooks/useNotification';
import { InviteUserDialogContent, type InvitationSuccess, type LimitReachedError } from './InviteUserDialogContent';
export function InviteUserDialog() {
  const [isOpen, setIsOpen] = useReducerState(false);
  const [email, setEmail] = useReducerState('');
  const [role, setRole] = useReducerState<UserRole>('member');
  const [isLoading, setIsLoading] = useReducerState(false);

  // AC1: Success state
  const [successData, setSuccessData] = useReducerState<InvitationSuccess | null>(null);

  // AC5: Limit reached state
  const [limitReached, setLimitReached] = useReducerState<LimitReachedError | null>(null);

  // AC2: Copy button state
  const [copied, setCopied] = useReducerState(false);
  const {
    company
  } = useCompany();
  const {
    showSuccess,
    showError
  } = useNotification();
  const queryClient = useQueryClient();

  // AC2: Copy to clipboard with feedback
  const handleCopyLink = useCallback(async () => {
    if (!successData?.inviteUrl) return;
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(successData.inviteUrl);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = successData.inviteUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      showSuccess({
        description: 'Link copiado para a área de transferência!'
      });

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showError({
        description: 'Falha ao copiar link. Copie manualmente.'
      });
    }
  }, [successData, showSuccess, showError, setCopied]);

  // Reset form state
  const resetForm = useCallback(() => {
    setEmail('');
    setRole('member');
    setSuccessData(null);
    setLimitReached(null);
    setCopied(false);
  }, [setEmail, setRole, setSuccessData, setLimitReached, setCopied]);

  // Handle dialog close
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  }, [resetForm, setIsOpen]);

  // Create another invite
  const handleCreateAnother = useCallback(() => {
    resetForm();
  }, [resetForm]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      showError({
        description: 'Por favor, informe um email'
      });
      return;
    }
    if (!company) {
      showError({
        description: 'Contexto da empresa não disponível'
      });
      return;
    }
    try {
      setIsLoading(true);
      setLimitReached(null);
      const payload = {
        email,
        role,
        companyId: company.id
      };
      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      // AC4/AC5: Handle limit reached
      if (response.status === 403 && data.error === 'USER_LIMIT_REACHED') {
        setLimitReached({
          limit: data.limit,
          current: data.current
        });
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao enviar convite');
      }

      // AC1: Show success state
      setSuccessData({
        email: data.invitation.email,
        inviteUrl: data.invitation.inviteUrl,
        expiresAt: data.invitation.expiresAt,
        remaining: data.remaining,
        emailSent: data.invitation.emailSent,
        emailSendError: data.invitation.emailSendError
      });

      // AC3: Invalidate invitations query so pending list refreshes
      queryClient.invalidateQueries({
        queryKey: ['invitations', company?.id]
      });
    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Falha ao enviar convite'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Convidar Usuário</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <InviteUserDialogContent
          limitReached={limitReached}
          successData={successData}
          email={email}
          role={role}
          copied={copied}
          loading={isLoading}
          onClose={() => handleOpenChange(false)}
          onCopyLink={handleCopyLink}
          onCreateAnother={handleCreateAnother}
          onSubmit={handleSubmit}
          onEmailChange={setEmail}
          onRoleChange={setRole}
        />
      </DialogContent>
    </Dialog>;
}
