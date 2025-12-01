// src/app/admin/invitations/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';
import { useNotification } from '@/hooks/useNotification';
import { useEffect, useRef } from 'react';

export default function InvitationsPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { company, isLoading: companyLoading } = useCompany();
  const { showSuccess, showError } = useNotification();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const loadInvitations = async () => {
      if (!company?.id || hasLoadedRef.current) return;
      hasLoadedRef.current = true;
      try {
        const response = await fetch(`/api/invitations/list?companyId=${company.id}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load invitations');
        }
        setInvitations(data.invitations || []);
      } catch (error) {
        showError({ description: error instanceof Error ? error.message : 'Falha ao carregar convites' });
      }
    };

    loadInvitations();
  }, [company?.id, showError]);

  // Create invitation
  const handleCreateInvitation = async () => {
    if (!email || !role) {
      showError({ description: 'Preencha o email e o papel.' });
      return;
    }

    if (!company?.id) {
      showError({ description: 'Você precisa estar associado a uma empresa para enviar convites.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, companyId: company.id }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      showSuccess({ description: 'Convite criado com sucesso' });
      setInvitations([...invitations, data.invitation]);
      
      // Copy invitation link to clipboard
      const invitationLink = `${window.location.origin}/join?token=${data.invitation.token}`;
      navigator.clipboard.writeText(invitationLink);
      showSuccess({ description: 'Link de convite copiado para a área de transferência' });
      
    } catch (error) {
      showError({ description: error instanceof Error ? error.message : 'Falha ao criar convite' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Gerenciamento de Convites</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Criar Novo Convite</CardTitle>
            <CardDescription>
              {company?.name
                ? `Gerar um link de convite para ${company.name}`
                : 'Você precisa de uma empresa para enviar convites'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input 
                type="email" 
                placeholder="user@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || companyLoading}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Função</label>
              <Select value={role} onValueChange={setRole} disabled={loading || companyLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membro</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCreateInvitation} 
              disabled={loading || companyLoading || !company?.id}
            >
              {loading ? 'Criando...' : 'Criar Convite'}
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Convites Recentes</CardTitle>
            <CardDescription>Visualize e gerencie convites</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-muted-foreground">Nenhum convite criado ainda</p>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div key={invitation.id || invitation.token} className="border rounded-md p-4">
                    <p><strong>Email:</strong> {invitation.email}</p>
                    {invitation.token && (
                      <p><strong>Token:</strong> {invitation.token.substring(0, 8)}...</p>
                    )}
                    <p><strong>Expira em:</strong> {new Date(invitation.expiresAt).toLocaleString()}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        if (!invitation.token) {
                          showError({ description: 'Token não disponível' });
                          return;
                        }
                        const invitationLink = `${window.location.origin}/join?token=${invitation.token}`;
                        navigator.clipboard.writeText(invitationLink);
                        showSuccess({ description: 'Link de convite copiado!' });
                      }}
                      disabled={!invitation.token}
                    >
                      Copiar Link
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
