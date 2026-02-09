import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SpaceActionButtons } from '@/components/floor-plan/modern/SpaceActionButtons';

describe('SpaceActionButtons', () => {
  const baseProps = {
    isUserInSpace: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onKnock: vi.fn(),
  };

  it('shows Knock as default action when onKnock is available', () => {
    render(<SpaceActionButtons {...baseProps} hasOccupants={false} isPrivate={false} />);

    const button = screen.getByRole('button', { name: /knock to request entry/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Knock');
  });

  it('disables knock button and shows pending label while knocking', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        knockStatus="knocking"
      />
    );

    const button = screen.getByRole('button', { name: /knock pending/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Knocking...');
  });

  it('disables knock button and shows cooldown seconds', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        knockStatus="cooldown"
        knockCooldownRemaining={42}
      />
    );

    const button = screen.getByRole('button', {
      name: /knock cooldown active, 42 seconds remaining/i,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Knock (42s)');
  });

  it('shows leave button for users already in space', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        isUserInSpace
      />
    );

    const button = screen.getByRole('button', { name: /leave this space/i });
    fireEvent.click(button);
    expect(baseProps.onLeave).toHaveBeenCalledTimes(1);
  });
});

