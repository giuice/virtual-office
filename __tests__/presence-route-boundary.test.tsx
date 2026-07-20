import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/floor-plan' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/contexts/PresenceContext', () => ({
  PresenceProvider: ({
    children,
    enabled,
  }: {
    children: ReactNode;
    enabled?: boolean;
  }) => <div data-testid="presence-boundary" data-enabled={String(enabled)}>{children}</div>,
}));

import {
  isPresenceEnabledPath,
  PresenceRouteBoundary,
} from '@/components/presence/PresenceRouteBoundary';

describe('PresenceRouteBoundary', () => {
  beforeEach(() => {
    mocks.pathname = '/floor-plan';
  });

  it.each(['/login', '/signup', '/forgot-password', '/set-password', '/create-company', '/onboarding', '/join'])(
    'disables Presence on %s',
    (pathname) => {
      expect(isPresenceEnabledPath(pathname)).toBe(false);
    }
  );

  it('keeps Presence enabled on authenticated application routes', () => {
    expect(isPresenceEnabledPath('/floor-plan')).toBe(true);
    expect(isPresenceEnabledPath('/dashboard')).toBe(true);
  });

  it('passes the current route decision into the provider', () => {
    mocks.pathname = '/login';
    const { rerender } = render(<PresenceRouteBoundary>child</PresenceRouteBoundary>);
    expect(screen.getByTestId('presence-boundary')).toHaveAttribute('data-enabled', 'false');

    mocks.pathname = '/floor-plan';
    rerender(<PresenceRouteBoundary>child</PresenceRouteBoundary>);
    expect(screen.getByTestId('presence-boundary')).toHaveAttribute('data-enabled', 'true');
  });
});
