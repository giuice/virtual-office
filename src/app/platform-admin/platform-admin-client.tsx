'use client';

// src/app/platform-admin/page.tsx
// Story: story-platform-admin - AC 2.1, 2.2, 2.3, 2.4
// Company Creation Backoffice for Platform Admins


import { useReducerState } from '@/hooks/useReducerState';
import { useToast } from '@/components/ui/use-toast';
import { PlatformAdminView, type CreationSuccess, type PlanType } from './PlatformAdminView';

export default function PlatformAdminPage() {
	// Form state
	const [companyName, setCompanyName] = useReducerState('');
	const [adminEmail, setAdminEmail] = useReducerState('');
	const [planType, setPlanType] = useReducerState<PlanType>('free');
	const [isLoading, setIsLoading] = useReducerState(false);

	// Success state - AC 2.4
	const [successData, setSuccessData] = useReducerState<CreationSuccess | null>(null);
	const [copied, setCopied] = useReducerState(false);

	// Error state
	const [error, setError] = useReducerState<string | null>(null);

	const { toast } = useToast();

	// AC 2.2: Company Creation Form submission
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!companyName.trim()) {
			setError('Nome da empresa é obrigatório');
			return;
		}

		if (!adminEmail.trim()) {
			setError('Email do admin é obrigatório');
			return;
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(adminEmail)) {
			setError('Formato de email inválido');
			return;
		}

		try {
			setIsLoading(true);

			// AC 2.3: Create company and invitation via API
			const response = await fetch('/api/platform-admin/create-company', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					companyName: companyName.trim(),
					adminEmail: adminEmail.trim(),
					planType,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Falha ao criar empresa');
			}

			// AC 2.4: Show success state
			setSuccessData({
				companyId: data.company.id,
				companyName: data.company.name,
				inviteEmail: data.invitation.email,
				inviteUrl: data.invitation.inviteUrl,
				expiresAt: data.invitation.expiresAt,
			});

			toast({
				title: 'Empresa criada com sucesso!',
				description: `${companyName} foi criada e o convite foi enviado.`,
			});

		} catch (err) {
			const message = err instanceof Error ? err.message : 'Erro desconhecido';
			setError(message);
			toast({
				variant: 'destructive',
				title: 'Erro ao criar empresa',
				description: message,
			});
		} finally {
			setIsLoading(false);
		}
	};

	// AC 2.4: Copy invitation link
	const handleCopyLink = async () => {
		if (!successData?.inviteUrl) return;

		try {
			await navigator.clipboard.writeText(successData.inviteUrl);
			setCopied(true);
			toast({
				title: 'Link copiado!',
				description: 'O link foi copiado para a área de transferência.',
			});
			setTimeout(() => setCopied(false), 3000);
		} catch {
			toast({
				variant: 'destructive',
				title: 'Erro ao copiar',
				description: 'Não foi possível copiar o link. Tente manualmente.',
			});
		}
	};

	// Reset form to create another company
	const handleReset = () => {
		setCompanyName('');
		setAdminEmail('');
		setPlanType('free');
		setSuccessData(null);
		setCopied(false);
		setError(null);
	};

	return (
		<PlatformAdminView
			companyName={companyName}
			adminEmail={adminEmail}
			planType={planType}
			loading={isLoading}
			copied={copied}
			error={error}
			successData={successData}
			onCompanyNameChange={setCompanyName}
			onAdminEmailChange={setAdminEmail}
			onPlanTypeChange={setPlanType}
			onSubmit={handleSubmit}
			onCopyLink={handleCopyLink}
			onReset={handleReset}
		/>
	);
}
