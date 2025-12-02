'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Copy, Check, Trash2, Loader2, RefreshCw, Mail, Users, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Portuguese strings
const messages = {
  title: 'Convites Pendentes',
  description: 'Gerencie os convites enviados para sua equipe',
  email: 'Email',
  status: 'Status',
  createdAt: 'Criado em',
  expiresAt: 'Expira em',
  actions: 'Ações',
  copyLink: 'Copiar link',
  linkCopied: '✓ Link copiado!',
  revoke: 'Revogar',
  revokeConfirm: 'Tem certeza que deseja revogar este convite?',
  revokeDescription: 'Esta ação não pode ser desfeita. O convite será marcado como expirado.',
  revokeSuccess: 'Convite revogado com sucesso',
  resendEmail: 'Reenviar email',
  resendSuccess: 'Email reenviado com sucesso',
  resendError: 'Falha ao reenviar email',
  noPending: 'Nenhum convite pendente',
  noInvitations: 'Nenhum convite encontrado',
  loading: 'Carregando convites...',
  error: 'Erro ao carregar convites',
  refresh: 'Atualizar',
  statusLabels: {
    pending: 'Pendente',
    accepted: 'Aceito',
    expired: 'Expirado',
  },
  userLimit: 'Usuários: {current} / {limit}',
  remaining: '{remaining} convites restantes',
};

interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  expiresAt: number;
  inviteUrl: string;
  token: string;
}

interface InvitationsResponse {
  invitations: Invitation[];
  total: number;
  limit: number;
  remaining: number;
  userCount: number;
  pendingCount: number;
}

export function PendingInvitationsList() {
  const { company } = useCompany();
  const { showSuccess, showError } = useNotification();
  const queryClient = useQueryClient();
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState<Invitation | null>(null);

  // Fetch invitations
  const { data, isLoading, error, refetch } = useQuery<InvitationsResponse>({
    queryKey: ['invitations', company?.id],
    queryFn: async () => {
      if (!company?.id) throw new Error('Company not found');
      
      const response = await fetch(`/api/invitations/list?companyId=${company.id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch invitations');
      }
      return response.json();
    },
    enabled: !!company?.id,
    staleTime: 30000, // 30 seconds
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await fetch('/api/invitations/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revoke invitation');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccess({ description: messages.revokeSuccess });
      queryClient.invalidateQueries({ queryKey: ['invitations', company?.id] });
      setRevokeDialogOpen(false);
      setInvitationToRevoke(null);
    },
    onError: (error: Error) => {
      showError({ description: error.message });
    },
  });

  // Resend email mutation
  const resendMutation = useMutation({
    mutationFn: async (invitation: Invitation) => {
      const response = await fetch('/api/invitations/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: invitation.id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || messages.resendError);
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccess({ description: messages.resendSuccess });
    },
    onError: (error: Error) => {
      showError({ description: error.message });
    },
  });

  // Copy link handler
  const handleCopyLink = useCallback(async (invitation: Invitation) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(invitation.inviteUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = invitation.inviteUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      setCopiedId(invitation.id);
      showSuccess({ description: 'Link copiado!' });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showError({ description: 'Falha ao copiar link' });
    }
  }, [showSuccess, showError]);

  // Open revoke confirmation
  const handleRevokeClick = useCallback((invitation: Invitation) => {
    setInvitationToRevoke(invitation);
    setRevokeDialogOpen(true);
  }, []);

  // Confirm revoke
  const handleConfirmRevoke = useCallback(() => {
    if (invitationToRevoke) {
      revokeMutation.mutate(invitationToRevoke.id);
    }
  }, [invitationToRevoke, revokeMutation]);

  // Format date
  const formatDate = (dateString: string | number) => {
    try {
      const date = typeof dateString === 'number' 
        ? new Date(dateString) 
        : new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  // Status badge variant
  const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'pending': return 'default';
      case 'accepted': return 'secondary';
      case 'expired': return 'destructive';
      default: return 'outline';
    }
  };

  if (!company) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {messages.title}
            </CardTitle>
            <CardDescription>{messages.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {messages.userLimit
                    .replace('{current}', String(data.userCount + data.pendingCount))
                    .replace('{limit}', String(data.limit))}
                </span>
                <span className="text-xs">
                  ({messages.remaining.replace('{remaining}', String(data.remaining))})
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              {messages.refresh}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>{messages.loading}</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              {messages.error}
            </div>
          ) : !data?.invitations?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              {messages.noInvitations}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-3 px-2 font-medium">{messages.email}</th>
                    <th className="text-left py-3 px-2 font-medium">{messages.status}</th>
                    <th className="text-left py-3 px-2 font-medium">{messages.createdAt}</th>
                    <th className="text-left py-3 px-2 font-medium">{messages.expiresAt}</th>
                    <th className="text-right py-3 px-2 font-medium">{messages.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{invitation.email}</td>
                      <td className="py-3 px-2">
                        <Badge variant={getStatusVariant(invitation.status)}>
                          {messages.statusLabels[invitation.status] || invitation.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">{formatDate(invitation.createdAt)}</td>
                      <td className="py-3 px-2">{formatDate(invitation.expiresAt)}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          {invitation.status === 'pending' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resendMutation.mutate(invitation)}
                                disabled={resendMutation.isPending}
                                title="Reenviar email de convite"
                              >
                                {resendMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    {messages.resendEmail}
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyLink(invitation)}
                                className={copiedId === invitation.id ? 'bg-green-50' : ''}
                                title="Copiar link (backup caso email não chegue)"
                              >
                                {copiedId === invitation.id ? (
                                  <>
                                    <Check className="h-4 w-4 mr-1" />
                                    {messages.linkCopied}
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-4 w-4 mr-1" />
                                    {messages.copyLink}
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRevokeClick(invitation)}
                                disabled={revokeMutation.isPending}
                              >
                                {revokeMutation.isPending && invitationToRevoke?.id === invitation.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    {messages.revoke}
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirmation dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{messages.revokeConfirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {messages.revokeDescription}
              {invitationToRevoke && (
                <span className="block mt-2 font-medium">
                  Email: {invitationToRevoke.email}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              {messages.revoke}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
