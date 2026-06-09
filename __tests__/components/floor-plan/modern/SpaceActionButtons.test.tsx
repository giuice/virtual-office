import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SpaceActionButtons } from '@/components/floor-plan/modern/SpaceActionButtons';

describe('SpaceActionButtons', () => {
  const baseProps = {
    state: { userInSpace: false },
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onKnock: vi.fn(),
  };

  it('shows Join and Knock for public occupied spaces', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        state={{
          ...baseProps.state,
          privateSpace: false,
          hasOccupants: true,
          canDirectEnter: true,
        }}
      />
    );

    expect(screen.getByRole('button', { name: /join this space/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /knock to request entry/i })).toBeInTheDocument();
  });

  it('disables knock button and shows pending label while knocking', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        state={{
          ...baseProps.state,
          hasOccupants: true,
          canDirectEnter: false,
        }}
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
        state={{
          ...baseProps.state,
          hasOccupants: true,
          canDirectEnter: false,
        }}
        knockStatus="cooldown"
        knockCooldownRemaining={42}
      />
    );

    const button = screen.getByRole('button', {
      name: /knock cooldown active, 42 seconds remaining/i,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Wait 42s');
  });

  it('shows leave button for users already in space', () => {
    render(
      <SpaceActionButtons
        {...baseProps}
        state={{ userInSpace: true }}
      />
    );

    const button = screen.getByRole('button', { name: /leave this space/i });
    fireEvent.click(button);
    expect(baseProps.onLeave).toHaveBeenCalledTimes(1);
  });
});
