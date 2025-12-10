'use client';

import React, { useState, useEffect } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadableAvatar } from '@/components/profile/UploadableAvatar';
import { useNotification } from '@/hooks/useNotification';
import { Loader2 } from 'lucide-react';

export function ProfileForm() {
  const { currentUserProfile, refreshCompanyData } = useCompany();
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentUserProfile) {
      setDisplayName(currentUserProfile.displayName || '');
      setStatusMessage(currentUserProfile.statusMessage || '');
    }
  }, [currentUserProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/users/update?id=${currentUserProfile.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          statusMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      await refreshCompanyData();
      showSuccess({ description: 'Perfil atualizado com sucesso!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      showError({ description: 'Erro ao atualizar perfil. Tente novamente.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (url: string) => {
    if (!currentUserProfile) return;
    
    // UploadableAvatar handles the upload to storage and updates the user record via API
    try {
      await refreshCompanyData();
      showSuccess({ description: 'Avatar atualizado com sucesso!' });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  if (!currentUserProfile) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Seu Perfil</CardTitle>
        <CardDescription>
          Gerencie suas informações pessoais e como você aparece para os outros.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-6">
          <div className="flex flex-col items-center space-y-2">
            <UploadableAvatar
              user={currentUserProfile}
              size="xl"
              onUploadSuccess={handleAvatarUpload}
            />
            <span className="text-xs text-muted-foreground">
              Clique para alterar
            </span>
          </div>
          
          <div className="flex-1 space-y-1 text-center sm:text-left">
            <h3 className="text-lg font-medium">{currentUserProfile.displayName || 'Usuário sem nome'}</h3>
            <p className="text-sm text-muted-foreground">{currentUserProfile.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{currentUserProfile.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Nome de exibição</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como você quer ser chamado"
            />
            <p className="text-xs text-muted-foreground">
              Este é o nome que aparecerá para seus colegas.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="statusMessage">Mensagem de status</Label>
            <Textarea
              id="statusMessage"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="O que você está fazendo?"
              rows={2}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar alterações'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
