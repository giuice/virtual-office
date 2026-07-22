import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YouAreHereChip } from '@/components/floor-plan/modern/YouAreHereChip';

describe('YouAreHereChip', () => {
  it('shows the current space and fires the locate callback', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    render(<YouAreHereChip spaceName="Design Studio" onLocate={onLocate} />);

    const chip = screen.getByRole('button', { name: 'Find my space: Design Studio' });
    expect(chip).toHaveTextContent('You are in');
    expect(chip).toHaveTextContent('Design Studio');
    await user.click(chip);
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('shows a dash when the user is in no space', () => {
    render(<YouAreHereChip onLocate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Find my space: not in a space' })).toHaveTextContent('—');
  });
});
