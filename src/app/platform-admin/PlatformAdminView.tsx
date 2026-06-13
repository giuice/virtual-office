'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Building2, Mail, CheckCircle, Copy, Loader2, AlertTriangle } from 'lucide-react';

export type PlanType = 'free' | 'starter' | 'professional' | 'enterprise';

export interface CreationSuccess {
  companyId: string;
  companyName: string;
  inviteEmail: string;
  inviteUrl: string;
  expiresAt: string;
}

interface PlatformAdminViewProps {
  companyName: string;
  adminEmail: string;
  planType: PlanType;
  loading: boolean;
  copied: boolean;
  error: string | null;
  successData: CreationSuccess | null;
  onCompanyNameChange: (value: string) => void;
  onAdminEmailChange: (value: string) => void;
  onPlanTypeChange: (value: PlanType) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCopyLink: () => void;
  onReset: () => void;
}

export function PlatformAdminView({
  companyName,
  adminEmail,
  planType,
  loading,
  copied,
  error,
  successData,
  onCompanyNameChange,
  onAdminEmailChange,
  onPlanTypeChange,
  onSubmit,
  onCopyLink,
  onReset,
}: PlatformAdminViewProps) {
  if (successData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="size-6 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-green-600">Empresa Criada com Sucesso!</CardTitle>
                <CardDescription>{successData.companyName}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--vo-text-muted)]">Empresa:</span>
                <p className="font-medium">{successData.companyName}</p>
              </div>
              <div>
                <span className="text-[var(--vo-text-muted)]">Admin Email:</span>
                <p className="font-medium">{successData.inviteEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--vo-text-secondary)]">Link do Convite (válido por 7 dias)</Label>
              <div className="flex gap-2">
                <Input value={successData.inviteUrl} readOnly className="font-mono text-xs" />
                <Button onClick={onCopyLink} variant={copied ? 'secondary' : 'default'} className="shrink-0">
                  {copied ? (
                    <>
                      <CheckCircle className="size-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-[var(--vo-text-muted)]">
                Envie este link para o administrador da empresa por email ou mensagem.
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={onReset} className="flex-1">Criar Outra Empresa</Button>
              <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--vo-text-primary)]">Criar Nova Empresa</h1>
        <p className="text-[var(--vo-text-secondary)] mt-2">
          Crie uma nova empresa e convide seu primeiro administrador
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Dados da Empresa
          </CardTitle>
          <CardDescription>
            Preencha os dados abaixo para criar uma nova empresa no Virtual Office
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-600">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da Empresa *</Label>
              <Input
                id="companyName"
                placeholder="Ex: Acme Corporation"
                value={companyName}
                onChange={(e) => onCompanyNameChange(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">
                <Mail className="size-4 inline mr-1" />
                Email do Admin Inicial *
              </Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="admin@empresa.com"
                value={adminEmail}
                onChange={(e) => onAdminEmailChange(e.target.value)}
                disabled={loading}
                required
              />
              <p className="text-xs text-[var(--vo-text-muted)]">
                Um convite será enviado para este email com link de acesso.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="planType">Tipo de Plano</Label>
              <Select value={planType} onValueChange={(v) => onPlanTypeChange(v as PlanType)} disabled={loading}>
                <SelectTrigger id="planType">
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (até 10 usuários)</SelectItem>
                  <SelectItem value="starter">Starter (até 25 usuários)</SelectItem>
                  <SelectItem value="professional">Professional (até 100 usuários)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (ilimitado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Criando empresa…
                </>
              ) : (
                <>
                  <Building2 className="size-4 mr-2" />
                  Criar Empresa e Enviar Convite
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
