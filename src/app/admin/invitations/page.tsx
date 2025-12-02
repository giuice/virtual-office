// src/app/admin/invitations/page.tsx
'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { PendingInvitationsList } from '@/components/dashboard/pending-invitations-list';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function InvitationsPage() {
  const { company, isLoading: companyLoading } = useCompany();

  return (
    <div className="container mx-auto py-10">
      <div className="mb-6">
        <Link href="/company" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar para Empresa
        </Link>
      </div>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Gerenciamento de Convites</h1>
        <p className="text-muted-foreground mt-2">
          {company?.name 
            ? `Visualize e gerencie os convites enviados para ${company.name}`
            : 'Carregando...'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          💡 Para criar novos convites, use o botão "Convidar Usuário" na página de membros da empresa.
        </p>
      </div>
      
      {/* Pending invitations list with full functionality */}
      <PendingInvitationsList />
    </div>
  );
}
