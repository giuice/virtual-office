'use client';

// src/app/platform-admin/page.tsx
// Story: story-platform-admin - AC 2.1, 2.2, 2.3, 2.4
// Company Creation Backoffice for Platform Admins

import { useState } from 'react';
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
import { useToast } from '@/components/ui/use-toast';

type PlanType = 'free' | 'starter' | 'professional' | 'enterprise';

interface CreationSuccess {
	companyId: string;
	companyName: string;
	inviteEmail: string;
	inviteUrl: string;
	expiresAt: string;
}

export default function PlatformAdminPage() {
	// Form state
	const [companyName, setCompanyName] = useState('');
	const [adminEmail, setAdminEmail] = useState('');
	const [planType, setPlanType] = useState<PlanType>('free');
	const [isLoading, setIsLoading] = useState(false);

	// Success state - AC 2.4
	const [successData, setSuccessData] = useState<CreationSuccess | null>(null);
	const [copied, setCopied] = useState(false);

	// Error state
	const [error, setError] = useState<string | null>(null);

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

	// AC 2.4: Success UI
	if (successData) {
		return (
			<div className="max-w-2xl mx-auto space-y-6">
				<Card className="border-green-500/50 bg-green-500/5">
					<CardHeader>
						<div className="flex items-center gap-3">
							<div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
								<CheckCircle className="h-6 w-6 text-green-500" />
							</div>
							<div>
								<CardTitle className="text-green-600">
									Empresa Criada com Sucesso!
								</CardTitle>
								<CardDescription>
									{successData.companyName}
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Company Details */}
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

						{/* Invitation Link */}
						<div className="space-y-2">
							<Label className="text-[var(--vo-text-secondary)]">
								📋 Link do Convite (válido por 7 dias)
							</Label>
							<div className="flex gap-2">
								<Input
									value={successData.inviteUrl}
									readOnly
									className="font-mono text-xs"
								/>
								<Button
									onClick={handleCopyLink}
									variant={copied ? 'secondary' : 'default'}
									className="shrink-0"
								>
									{copied ? (
										<>
											<CheckCircle className="h-4 w-4 mr-2" />
											Copiado!
										</>
									) : (
										<>
											<Copy className="h-4 w-4 mr-2" />
											Copiar
										</>
									)}
								</Button>
							</div>
							<p className="text-xs text-[var(--vo-text-muted)]">
								💡 Envie este link para o administrador da empresa por email ou mensagem.
							</p>
						</div>

						{/* Actions */}
						<div className="flex gap-3 pt-4 border-t">
							<Button onClick={handleReset} className="flex-1">
								Criar Outra Empresa
							</Button>
							<Button
								variant="outline"
								onClick={() => window.location.href = '/dashboard'}
							>
								Voltar ao Dashboard
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// AC 2.2: Company Creation Form
	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="text-center">
				<h1 className="text-2xl font-bold text-[var(--vo-text-primary)]">
					Criar Nova Empresa
				</h1>
				<p className="text-[var(--vo-text-secondary)] mt-2">
					Crie uma nova empresa e convide seu primeiro administrador
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Building2 className="h-5 w-5" />
						Dados da Empresa
					</CardTitle>
					<CardDescription>
						Preencha os dados abaixo para criar uma nova empresa no Virtual Office
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Error Alert */}
						{error && (
							<div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/50 text-red-600">
								<AlertTriangle className="h-4 w-4 shrink-0" />
								<span className="text-sm">{error}</span>
							</div>
						)}

						{/* Company Name */}
						<div className="space-y-2">
							<Label htmlFor="companyName">
								Nome da Empresa *
							</Label>
							<Input
								id="companyName"
								placeholder="Ex: Acme Corporation"
								value={companyName}
								onChange={(e) => setCompanyName(e.target.value)}
								disabled={isLoading}
								required
							/>
						</div>

						{/* Admin Email */}
						<div className="space-y-2">
							<Label htmlFor="adminEmail">
								<Mail className="h-4 w-4 inline mr-1" />
								Email do Admin Inicial *
							</Label>
							<Input
								id="adminEmail"
								type="email"
								placeholder="admin@empresa.com"
								value={adminEmail}
								onChange={(e) => setAdminEmail(e.target.value)}
								disabled={isLoading}
								required
							/>
							<p className="text-xs text-[var(--vo-text-muted)]">
								Um convite será enviado para este email com link de acesso.
							</p>
						</div>

						{/* Plan Type */}
						<div className="space-y-2">
							<Label htmlFor="planType">
								Tipo de Plano
							</Label>
							<Select
								value={planType}
								onValueChange={(v) => setPlanType(v as PlanType)}
								disabled={isLoading}
							>
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

						{/* Submit Button */}
						<Button
							type="submit"
							className="w-full"
							disabled={isLoading}
						>
							{isLoading ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Criando empresa...
								</>
							) : (
								<>
									<Building2 className="h-4 w-4 mr-2" />
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
