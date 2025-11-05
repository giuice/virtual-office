// __tests__/messaging/reaction-chips.test.tsx
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionChips } from '@/components/messaging/ReactionChips';
import { MessageReaction } from '@/types/messaging';

vi.mock('@/components/ui/tooltip', () => {
  const Stub = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    TooltipProvider: Stub,
    Tooltip: Stub,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

describe('ReactionChips', () => {
  const mockReactions: MessageReaction[] = [
    { emoji: '👍', userId: 'user1', timestamp: new Date('2024-01-01') },
    { emoji: '👍', userId: 'user2', timestamp: new Date('2024-01-02') },
    { emoji: '❤️', userId: 'user3', timestamp: new Date('2024-01-03') },
  ];

  it('renders reaction chips with counts', () => {
    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={mockReactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    expect(screen.getByTestId('reaction-chip-👍')).toBeInTheDocument();
    expect(screen.getByTestId('reaction-chip-❤️')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 👍 count
    expect(screen.getByText('1')).toBeInTheDocument(); // ❤️ count
  });

  it('highlights reactions from current user', () => {
    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={mockReactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    const thumbsUp = screen.getByTestId('reaction-chip-👍');
    expect(thumbsUp).toHaveClass('border-primary');
  });

  it('calls onReactionToggle when chip is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={mockReactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    await user.click(chip);

    expect(onToggle).toHaveBeenCalledWith('👍');
  });

  it('stops propagation on chip click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onParentClick = vi.fn();
    
    render(
      <div onClick={onParentClick}>
        <ReactionChips
          reactions={mockReactions}
          currentUserId="user1"
          onReactionToggle={onToggle}
        />
      </div>
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    await user.click(chip);

    expect(onToggle).toHaveBeenCalledWith('👍');
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('stops propagation on pointer down', () => {
    const onToggle = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div onPointerDown={onParentClick}>
        <ReactionChips
          reactions={mockReactions}
          currentUserId="user1"
          onReactionToggle={onToggle}
        />
      </div>
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    fireEvent.pointerDown(chip);

    expect(onToggle).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('sorts reactions by most recent first', () => {
    const reactions: MessageReaction[] = [
      { emoji: '❤️', userId: 'user1', timestamp: new Date('2024-01-01') },
      { emoji: '👍', userId: 'user2', timestamp: new Date('2024-01-03') },
    ];
    
    const onToggle = vi.fn();
    const { container } = render(
      <ReactionChips
        reactions={reactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    const chips = container.querySelectorAll('[data-testid^="reaction-chip-"]');
    expect(chips[0]).toHaveAttribute('data-testid', 'reaction-chip-👍');
    expect(chips[1]).toHaveAttribute('data-testid', 'reaction-chip-❤️');
  });

  it('renders nothing when no reactions', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ReactionChips
        reactions={[]}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('aggregates multiple reactions for same emoji', () => {
    const reactions: MessageReaction[] = [
      { emoji: '👍', userId: 'user1', timestamp: new Date() },
      { emoji: '👍', userId: 'user2', timestamp: new Date() },
      { emoji: '👍', userId: 'user3', timestamp: new Date() },
    ];
    
    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={reactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    expect(screen.getByTestId('reaction-chip-👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('deduplicates repeated reactions from the same user', () => {
    const reactions: MessageReaction[] = [
      { emoji: '👍', userId: 'user1', timestamp: new Date('2024-01-01') },
      { emoji: '👍', userId: 'user1', timestamp: new Date('2024-01-02') },
      { emoji: '👍', userId: 'user2', timestamp: new Date('2024-01-03') },
    ];

    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={reactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    expect(screen.getByTestId('reaction-chip-👍')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('supports keyboard activation without bubbling to parent containers', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onParentKeyDown = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown}>
        <ReactionChips
          reactions={mockReactions}
          currentUserId="user1"
          onReactionToggle={onToggle}
        />
      </div>
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    chip.focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });

    expect(onToggle).toHaveBeenCalledWith('👍');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it('handles Space key activation exactly once', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ReactionChips
        reactions={mockReactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    chip.focus();

    await act(async () => {
      await user.keyboard(' ');
    });

    expect(onToggle).toHaveBeenCalledWith('👍');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('applies data-avatar-interactive attribute', () => {
    const onToggle = vi.fn();
    render(
      <ReactionChips
        reactions={mockReactions}
        currentUserId="user1"
        onReactionToggle={onToggle}
      />
    );

    const chip = screen.getByTestId('reaction-chip-👍');
    expect(chip).toHaveAttribute('data-avatar-interactive');
  });
});
