'use client';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Check, AlertTriangle, Mail, Calendar, ExternalLink } from 'lucide-react';
import type { UserRole } from '@/types/database';

export interface InvitationSuccess {
  email: string;
  inviteUrl: string;
  expiresAt: string;
  remaining: number;
  emailSent?: boolean;
  emailSendError?: string | null;
}

export interface LimitReachedError {
  limit: number;
  current: number;
}

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

const messages = {
  successTitle: 'Convite criado com sucesso!',
  linkLabel: 'Link do convite (válido por 7 dias):',
  copyButton: 'Copiar link',
  copySuccess: 'Link copiado!',
  hint: 'Envie este link para o convidado por email ou mensagem.',
  createAnother: 'Criar outro convite',
  close: 'Fechar',
  limitReached: {
    title: 'Limite atingido (10 usuários)',
    description: 'O plano gratuito permite até 10 usuários.',
    action: 'Para convidar mais pessoas, entre em contato para upgrade.',
    contactButton: 'Entrar em contato',
  },
};

interface InviteUserDialogContentProps {
  limitReached: LimitReachedError | null;
  successData: InvitationSuccess | null;
  email: string;
  role: UserRole;
  copied: boolean;
  loading: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onCreateAnother: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (role: UserRole) => void;
}

export function InviteUserDialogContent({
  limitReached,
  successData,
  email,
  role,
  copied,
  loading,
  onClose,
  onCopyLink,
  onCreateAnother,
  onSubmit,
  onEmailChange,
  onRoleChange,
}: InviteUserDialogContentProps) {
  if (limitReached) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="size-5" />
            {messages.limitReached.title}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 gap-y-4">
          <div className="border border-amber-500 bg-amber-50 text-amber-900 rounded-md p-4">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" />
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
          <p className="text-sm text-muted-foreground">{messages.limitReached.action}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {messages.close}
            </Button>
            <Button asChild>
              <a href="mailto:contato@virtualoffice.com?subject=Upgrade%20de%20plano">
                <ExternalLink className="size-4 mr-2" />
                {messages.limitReached.contactButton}
              </a>
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (successData) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <Check className="size-5" />
            {messages.successTitle}
          </DialogTitle>
          <DialogDescription>
            Convite criado para <strong>{successData.email}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 gap-y-4">
          {successData.emailSent === false && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">Email não enviado automaticamente</p>
              <p className="mt-1 text-xs">
                Compartilhe o link abaixo manualmente. {successData.emailSendError ? `Motivo: ${successData.emailSendError}` : ''}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" />
            <span>Email: {successData.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>Expira em: {formatExpirationDate(successData.expiresAt)}</span>
          </div>
          <div className="gap-y-2">
            <label className="text-sm font-medium">{messages.linkLabel}</label>
            <div className="flex gap-2">
              <Input value={successData.inviteUrl} readOnly className="font-mono text-xs" onClick={e => (e.target as HTMLInputElement).select()} />
              <Button type="button" variant={copied ? 'default' : 'outline'} size="icon" onClick={onCopyLink} className={copied ? 'bg-green-600 hover:bg-green-700' : ''}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{messages.hint}</p>
          </div>
          {successData.remaining !== undefined && (
            <p className="text-xs text-muted-foreground">Convites restantes: {successData.remaining} / 10</p>
          )}
          <Separator />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {messages.close}
            </Button>
            <Button onClick={onCreateAnother}>{messages.createAnother}</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar Membro da Equipe</DialogTitle>
        <DialogDescription>Adicione um novo usuário ao seu escritório virtual</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="gap-y-4 pt-4">
        <div className="gap-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input id="email" type="email" value={email} onChange={e => onEmailChange(e.target.value)} placeholder="Digite o endereço de email" disabled={loading} required />
          <p className="text-xs text-muted-foreground">O usuário receberá um email de convite neste endereço</p>
        </div>

        <div className="gap-y-2">
          <label htmlFor="role" className="text-sm font-medium">
            Função
          </label>
          <div className="flex gap-x-4 mb-2">
            <button type="button" className={`flex w-[48%] flex-col items-center p-4 border rounded-md cursor-pointer ${role === 'member' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => onRoleChange('member')}>
              <Badge variant="outline" className="mb-2">Membro</Badge>
              <p className="text-sm text-center font-medium">Membro Regular</p>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Pode usar o escritório mas não pode gerenciar usuários ou configurações
              </p>
            </button>

            <button type="button" className={`flex w-[48%] flex-col items-center p-4 border rounded-md cursor-pointer ${role === 'admin' ? 'border-primary bg-primary/5' : 'border-border'}`} onClick={() => onRoleChange('admin')}>
              <Badge variant="default" className="mb-2">Admin</Badge>
              <p className="text-sm text-center font-medium">Administrador</p>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Pode gerenciar configurações da empresa, usuários e todos os recursos
              </p>
            </button>
          </div>
          <input type="hidden" id="role" value={role} />
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end gap-x-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar Convite'}
          </Button>
        </div>
      </form>
    </>
  );
}
