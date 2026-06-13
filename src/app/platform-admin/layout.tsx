// src/app/platform-admin/layout.tsx
// Story: story-platform-admin - AC 2.1
// Platform Admin area with strict auth guard

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabasePlatformAdminRepository } from '@/repositories/implementations/supabase/SupabasePlatformAdminRepository';

export const metadata = {
	title: 'Platform Admin | Virtual Office',
	description: 'Platform administration for Virtual Office',
};

export default async function PlatformAdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Get authenticated user
	const supabase = await createSupabaseServerClient();
	const { data: { user }, error: authError } = await supabase.auth.getUser();

	// If not authenticated, redirect to login
	if (authError || !user) {
		redirect('/login');
	}

	// Check if user is a platform admin
	const platformAdminRepository = new SupabasePlatformAdminRepository(supabase);
	const isPlatformAdmin = await platformAdminRepository.isUserPlatformAdmin(user.id);

	// AC 2.1: If not platform admin, redirect to dashboard
	if (!isPlatformAdmin) {
		redirect('/dashboard');
	}

	return (
		<div className="min-h-screen bg-[var(--vo-bg-base)]">
			{/* Platform Admin Header */}
			<header className="border-b border-[var(--vo-border)] bg-[var(--vo-bg-elevated)]">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex justify-between items-center h-16">
						<div className="flex items-center gap-3">
							<span className="text-2xl">🛡️</span>
							<div>
								<h1 className="text-lg font-semibold text-[var(--vo-text-primary)]">
									Platform Admin
								</h1>
								<p className="text-xs text-[var(--vo-text-muted)]">
									Virtual Office Management
								</p>
							</div>
						</div>
						<Link
							href="/dashboard"
							className="text-sm text-[var(--vo-text-secondary)] hover:text-[var(--vo-text-primary)] transition-colors"
						>
							← Back to Dashboard
						</Link>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{children}
			</main>
		</div>
	);
}
