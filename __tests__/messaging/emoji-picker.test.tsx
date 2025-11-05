// __tests__/messaging/emoji-picker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';

// Mock debugLogger
vi.mock('@/utils/debug-logger', () => ({
  debugLogger: {
    messaging: {
      info: vi.fn(),
      event: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      metric: vi.fn(),
      enabled: () => false,
      featureEnabled: () => false,
      storageKeys: {
        debug: 'vo:debug:messaging',
        flag: 'vo:flag:messaging_v2',
      },
    },
  },
}));

describe('EmojiPicker', () => {
  it('renders trigger button with correct test ID', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    const trigger = screen.getByTestId('message-reaction-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-avatar-interactive');
  });

  it('renders custom trigger when provided', () => {
    const onSelect = vi.fn();
    const customTrigger = <button data-testid="custom-trigger">Custom</button>;
    
    render(<EmojiPicker onEmojiSelect={onSelect} trigger={customTrigger} />);

    expect(screen.getByTestId('custom-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('message-reaction-trigger')).not.toBeInTheDocument();
  });

  it('opens popover when trigger is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    const trigger = screen.getByTestId('message-reaction-trigger');
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search emojis...')).toBeInTheDocument();
    });
  });

  it('displays frequently used emojis section', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    await user.click(screen.getByTestId('message-reaction-trigger'));

    await waitFor(() => {
      expect(screen.getByText('Frequently Used')).toBeInTheDocument();
    });
  });

  it('displays all emojis section', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    await user.click(screen.getByTestId('message-reaction-trigger'));

    await waitFor(() => {
      expect(screen.getByText('All Emojis')).toBeInTheDocument();
    });
  });

  it('calls onEmojiSelect when emoji is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    await user.click(screen.getByTestId('message-reaction-trigger'));

    await waitFor(() => {
      const emojiButtons = screen.getAllByRole('button', { name: /React with/ });
      expect(emojiButtons.length).toBeGreaterThan(0);
    });

    const firstEmoji = screen.getAllByRole('button', { name: /React with/ })[0];
    await user.click(firstEmoji);

    expect(onSelect).toHaveBeenCalled();
  });

  it('closes popover after emoji selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    await user.click(screen.getByTestId('message-reaction-trigger'));
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search emojis...')).toBeInTheDocument();
    });

    const firstEmoji = screen.getAllByRole('button', { name: /React with/ })[0];
    await user.click(firstEmoji);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search emojis...')).not.toBeInTheDocument();
    });
  });

  it('filters emojis based on search input', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    await user.click(screen.getByTestId('message-reaction-trigger'));

    const searchInput = await screen.findByPlaceholderText('Search emojis...');
    await user.type(searchInput, '👍');

    // After filtering, fewer emojis should be visible
    const emojis = screen.getAllByRole('button', { name: /React with/ });
    expect(emojis.length).toBeLessThan(50); // Less than all emojis
  });

  it('stops propagation on popover interactions', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <EmojiPicker onEmojiSelect={onSelect} />
      </div>
    );

    await user.click(screen.getByTestId('message-reaction-trigger'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search emojis...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search emojis...');
    await user.click(searchInput);

    // Parent should not receive click
    expect(onParentClick).toHaveBeenCalledTimes(0);
  });

  it('supports keyboard activation and returns focus on close', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} />);

    const trigger = screen.getByTestId('message-reaction-trigger');
    trigger.focus();

    await user.keyboard('{Enter}');

    const searchInput = await screen.findByPlaceholderText('Search emojis...');
    expect(searchInput).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search emojis...')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('prevents parent key handlers when navigating picker with keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onParentKeyDown = vi.fn();

    render(
      <div onKeyDown={onParentKeyDown}>
        <EmojiPicker onEmojiSelect={onSelect} />
      </div>
    );

    const trigger = screen.getByTestId('message-reaction-trigger');
    await user.click(trigger);

    const searchInput = await screen.findByPlaceholderText('Search emojis...');
    searchInput.focus();

    await user.keyboard('ArrowDown');
    await user.keyboard('{Enter}');

    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it('is disabled when disabled prop is true', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} disabled={true} />);

    const trigger = screen.getByTestId('message-reaction-trigger');
    expect(trigger).toBeDisabled();
  });

  it('applies custom className', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onEmojiSelect={onSelect} className="custom-class" />);

    const trigger = screen.getByTestId('message-reaction-trigger');
    expect(trigger).toHaveClass('custom-class');
  });
});
