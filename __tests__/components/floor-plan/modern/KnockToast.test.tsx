// src/components/floor-plan/modern/__tests__/KnockToast.test.tsx
// Story 3.16: Knock to Enter - Unit Tests for KnockToast component
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnockToast } from '@/components/floor-plan/modern/KnockToast';

describe('KnockToast', () => {
	const defaultProps = {
		requesterName: 'John Doe',
		onApprove: vi.fn(),
		onDeny: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Rendering', () => {
		it('should render the requester name', () => {
			render(<KnockToast {...defaultProps} />);

			expect(screen.getByText('John Doe')).toBeInTheDocument();
			expect(screen.getByText('is knocking')).toBeInTheDocument();
		});

		it('should render approve and deny buttons', () => {
			render(<KnockToast {...defaultProps} />);

			expect(screen.getByRole('button', { name: /let john doe in/i })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: /deny john doe/i })).toBeInTheDocument();
		});

		it('should have aria-live for accessibility', () => {
			render(<KnockToast {...defaultProps} />);

			const alert = screen.getByRole('alert');
			expect(alert).toHaveAttribute('aria-live', 'polite');
			expect(alert).toHaveAttribute('aria-atomic', 'true');
		});

		it('should have data-avatar-interactive for click-stop protocol', () => {
			render(<KnockToast {...defaultProps} />);

			const toast = screen.getByRole('alert');
			expect(toast).toHaveAttribute('data-avatar-interactive', 'true');
		});
	});

	describe('Avatar Display', () => {
		it('should display avatar image when URL is provided', () => {
			render(
				<KnockToast
					{...defaultProps}
					requesterAvatarUrl="https://example.com/avatar.jpg"
				/>
			);

			const avatar = screen.getByAltText("John Doe's avatar");
			expect(avatar).toBeInTheDocument();
			expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
		});

		it('should display icon when no avatar URL is provided', () => {
			render(<KnockToast {...defaultProps} />);

			// Should not find an avatar img, should find DoorOpen icon container
			expect(screen.queryByAltText("John Doe's avatar")).not.toBeInTheDocument();
		});
	});

	describe('Interactions', () => {
		it('should call onApprove when approve button is clicked', () => {
			render(<KnockToast {...defaultProps} />);

			const approveButton = screen.getByRole('button', { name: /let john doe in/i });
			fireEvent.click(approveButton);

			expect(defaultProps.onApprove).toHaveBeenCalledTimes(1);
		});

		it('should call onDeny when deny button is clicked', () => {
			render(<KnockToast {...defaultProps} />);

			const denyButton = screen.getByRole('button', { name: /deny john doe/i });
			fireEvent.click(denyButton);

			expect(defaultProps.onDeny).toHaveBeenCalledTimes(1);
		});

		it('should stop event propagation on button clicks', () => {
			const parentClickHandler = vi.fn();

			render(
				<div onClick={parentClickHandler}>
					<KnockToast {...defaultProps} />
				</div>
			);

			const approveButton = screen.getByRole('button', { name: /let john doe in/i });
			fireEvent.click(approveButton);

			// Parent should not receive click due to stopPropagation
			expect(parentClickHandler).not.toHaveBeenCalled();
		});

		it('should stop event propagation on toast click', () => {
			const parentClickHandler = vi.fn();

			render(
				<div onClick={parentClickHandler}>
					<KnockToast {...defaultProps} />
				</div>
			);

			const toast = screen.getByRole('alert');
			fireEvent.click(toast);

			expect(parentClickHandler).not.toHaveBeenCalled();
		});
	});
});
