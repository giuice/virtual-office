'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCompany } from '@/contexts/CompanyContext';
import { UserRole } from '@/types/database';
import { useNotification } from '@/hooks/useNotification';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Check, AlertTriangle, Mail, Calendar, ExternalLink } from 'lucide-react';

// Portuguese strings for UI (AC1, AC2, AC5)
const messages = {
  successTitle: 'Convite criado com sucesso!',
  linkLabel: 'Link do convite (válido por 7 dias):',
  copyButton: 'Copiar link',
  copySuccess: '✓ Link copiado!',
  hint: '💡 Envie este link para o convidado por email ou mensagem.',
  createAnother: 'Criar outro convite',
  close: 'Fechar',
  limitReached: {
    title: 'Limite atingido (10 usuários)',
    description: 'O plano gratuito permite até 10 usuários.',
    action: 'Para convidar mais pessoas, entre em contato para upgrade.',
    contactButton: 'Entrar em contato',
  },
};

interface InvitationSuccess {
  email: string;
  inviteUrl: string;
  expiresAt: string;
  remaining: number;
}

interface LimitReachedError {
  limit: number;
  current: number;
}

export function InviteUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [isLoading, setIsLoading] = useState(false);
  
  // AC1: Success state
  const [successData, setSuccessData] = useState<InvitationSuccess | null>(null);
  
  // AC5: Limit reached state
  const [limitReached, setLimitReached] = useState<LimitReachedError | null>(null);
  
  // AC2: Copy button state
  const [copied, setCopied] = useState(false);

  const { company } = useCompany();
  const { showSuccess, showError } = useNotification();
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
      showSuccess({ description: 'Link copiado para a área de transferência!' });
      
      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showError({ description: 'Falha ao copiar link. Copie manualmente.' });
    }
  }, [successData, showSuccess, showError]);

  // Reset form state
  const resetForm = useCallback(() => {
    setEmail('');
    setRole('member');
    setSuccessData(null);
    setLimitReached(null);
    setCopied(false);
  }, []);

  // Handle dialog close
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  }, [resetForm]);

  // Create another invite
  const handleCreateAnother = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      showError({ description: 'Por favor, informe um email' });
      return;
    }
    if (!company) {
      showError({ description: 'Contexto da empresa não disponível' });
      return;
    }

    try {
      setIsLoading(true);
      setLimitReached(null);

      const payload = {
        email,
        role,
        companyId: company.id,
      };

      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // AC4/AC5: Handle limit reached
      if (response.status === 403 && data.error === 'USER_LIMIT_REACHED') {
        setLimitReached({
          limit: data.limit,
          current: data.current,
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
      });

      // AC3: Invalidate invitations query so pending list refreshes
      queryClient.invalidateQueries({ queryKey: ['invitations', company?.id] });

    } catch (error) {
      showError({
        description: error instanceof Error ? error.message : 'Falha ao enviar convite'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Format expiration date
  const formatExpirationDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Convidar Usuário</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {/* AC5: Limit reached state */}
        {limitReached ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                {messages.limitReached.title}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="border border-amber-500 bg-amber-50 text-amber-900 rounded-md p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Limite de usuários
                </div>
                <p className="mt-1 text-sm">
                  {messages.limitReached.description}
                  <br />
                  <span className="text-sm">
                    Usuários atuais: {limitReached.current} / {limitReached.limit}
                  </span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {messages.limitReached.action}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  {messages.close}
                </Button>
                <Button asChild>
                  <a href="mailto:contato@virtualoffice.com?subject=Upgrade%20de%20plano">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {messages.limitReached.contactButton}
                  </a>
                </Button>
              </div>
            </div>
          </>
        ) : successData ? (
          /* AC1: Success state with copy link */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                {messages.successTitle}
              </DialogTitle>
              <DialogDescription>
                Convite criado para <strong>{successData.email}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Email info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Email: {successData.email}</span>
              </div>
              
              {/* Expiration info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Expira em: {formatExpirationDate(successData.expiresAt)}</span>
              </div>

              {/* Link display and copy button */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{messages.linkLabel}</label>
                <div className="flex gap-2">
                  <Input
                    value={successData.inviteUrl}
                    readOnly
                    className="font-mono text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    type="button"
                    variant={copied ? 'default' : 'outline'}
                    size="icon"
                    onClick={handleCopyLink}
                    className={copied ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{messages.hint}</p>
              </div>

              {/* Remaining capacity info */}
              {successData.remaining !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Convites restantes: {successData.remaining} / 10
                </p>
              )}

              <Separator />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  {messages.close}
                </Button>
                <Button onClick={handleCreateAnother}>
                  {messages.createAnother}
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Default: Invite form */
          <>
            <DialogHeader>
              <DialogTitle>Convidar Membro da Equipe</DialogTitle>
              <DialogDescription>
                Adicione um novo usuário ao seu escritório virtual
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite o endereço de email"
                  disabled={isLoading}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  O usuário receberá um email de convite neste endereço
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  Função
                </label>
                <div className="flex space-x-4 mb-2">
                  <div
                    className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                      role === 'member' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setRole('member')}
                    style={{ width: '48%' }}
                  >
                    <Badge variant="outline" className="mb-2">Membro</Badge>
                    <p className="text-sm text-center font-medium">Membro Regular</p>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Pode usar o escritório mas não pode gerenciar usuários ou configurações
                    </p>
                  </div>

                  <div
                    className={`flex flex-col items-center p-4 border rounded-md cursor-pointer ${
                      role === 'admin' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setRole('admin')}
                    style={{ width: '48%' }}
                  >
                    <Badge variant="default" className="mb-2">Admin</Badge>
                    <p className="text-sm text-center font-medium">Administrador</p>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Pode gerenciar configurações da empresa, usuários e todos os recursos
                    </p>
                  </div>
                </div>

                <input
                  type="hidden"
                  id="role"
                  value={role}
                />
              </div>

              <Separator className="my-4" />

              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Enviando...' : 'Enviar Convite'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
