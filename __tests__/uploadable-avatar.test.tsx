import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadableAvatar } from '@/components/profile/UploadableAvatar';

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    upload: vi.fn(),
    state: 'idle',
    progress: 0,
    preview: null,
    error: null,
    reset: vi.fn(),
  }),
}));

const user = {
  id: 'user-1',
  displayName: 'Taylor User',
  avatarUrl: null,
  status: 'online' as const,
};

describe('UploadableAvatar controls', () => {
  it('keeps upload buttons out of a non-editable trigger', () => {
    const { container } = render(
      <UploadableAvatar user={user} showUploadButton={false} />
    );

    const hoverTarget = container.querySelector<HTMLElement>('.relative');
    expect(hoverTarget).not.toBeNull();
    if (!hoverTarget) throw new Error('Avatar hover target was not rendered');
    fireEvent.mouseEnter(hoverTarget);

    expect(screen.queryByRole('button', { name: 'Upload avatar' })).not.toBeInTheDocument();
  });

  it('shows upload controls when an avatar-change handler is supplied', () => {
    const { container } = render(
      <UploadableAvatar user={user} onAvatarChange={vi.fn()} />
    );

    const hoverTarget = container.querySelector<HTMLElement>('.relative');
    expect(hoverTarget).not.toBeNull();
    if (!hoverTarget) throw new Error('Avatar hover target was not rendered');
    fireEvent.mouseEnter(hoverTarget);

    expect(screen.getByRole('button', { name: 'Upload avatar' })).toBeInTheDocument();
  });
});
