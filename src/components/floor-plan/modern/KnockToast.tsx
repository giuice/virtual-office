// src/components/floor-plan/modern/KnockToast.tsx
// Story 3.16: Knock to Enter Workflow - Notification Toast
'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { DoorOpen, Check, X } from 'lucide-react';

/**
 * Story 3.16 - AC2, AC3: Knock Notification Toast
 *
 * Features:
 * - Displays "User X is knocking" message
 * - Approve/Deny buttons for occupants
 * - Click-stop protocol compliance
 * - Accessibility: aria-live region support
 * - Theme-aware styling
 */
export interface KnockToastProps {
	/** Name of the user requesting entry */
	requesterName: string;
	/** Optional avatar URL of the requester */
	requesterAvatarUrl?: string;
	/** Callback when occupant approves the knock */
	onApprove: () => void;
	/** Callback when occupant denies the knock */
	onDeny: () => void;
	/** Optional additional class name */
	className?: string;
}

export const KnockToast: React.FC<KnockToastProps> = ({
	requesterName,
	requesterAvatarUrl,
	onApprove,
	onDeny,
	className,
}) => {
	return (
		<div
			className={cn(
				'knock-toast',
				'flex items-center gap-3 p-4',
				'rounded-xl border',
				'bg-[var(--vo-card-bg)]',
				'border-[var(--vo-card-border)]',
				'shadow-lg',
				'min-w-[280px]',
				className
			)}
			// Click-stop protocol compliance (Story 3.11 AC7)
			data-avatar-interactive="true"
			onClick={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
			// Accessibility: live region for screen readers
			role="alert"
			aria-live="polite"
			aria-atomic="true"
		>
			{/* Knock icon or avatar */}
			<div className="flex-shrink-0">
				{requesterAvatarUrl ? (
					<Image
						src={requesterAvatarUrl}
						alt={`${requesterName}'s avatar`}
						width={40}
						height={40}
						className="size-10 rounded-full object-cover border-2 border-[var(--vo-border-subtle)]"
					/>
				) : (
					<div className="size-10 rounded-full bg-[var(--vo-pill-bg)] flex items-center justify-center">
						<DoorOpen className="size-5 text-[var(--vo-pill-text)]" />
					</div>
				)}
			</div>

			{/* Message */}
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate">
					<span className="font-semibold">{requesterName}</span> is knocking
				</p>
				<p className="text-xs text-muted-foreground">
					Requesting access to this space
				</p>
			</div>

			{/* Action buttons */}
			<div className="flex gap-2 flex-shrink-0">
				<button type="button"
					onClick={(e) => {
						e.stopPropagation();
						onApprove();
					}}
					className={cn(
						'flex items-center justify-center',
						'size-9 rounded-lg',
						'bg-green-500/20 hover:bg-green-500/30',
						'text-green-600 dark:text-green-400',
						'transition-colors duration-150',
						'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
					)}
					aria-label={`Let ${requesterName} in`}
					title="Let in"
				>
					<Check className="size-5" />
				</button>
				<button type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDeny();
					}}
					className={cn(
						'flex items-center justify-center',
						'size-9 rounded-lg',
						'bg-red-500/20 hover:bg-red-500/30',
						'text-red-600 dark:text-red-400',
						'transition-colors duration-150',
						'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
					)}
					aria-label={`Deny ${requesterName}`}
					title="Deny"
				>
					<X className="size-5" />
				</button>
			</div>
		</div>
	);
};
