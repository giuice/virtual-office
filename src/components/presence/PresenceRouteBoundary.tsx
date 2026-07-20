'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PresenceProvider } from '@/contexts/PresenceContext';

const PRESENCE_DISABLED_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/set-password',
  '/create-company',
  '/onboarding',
  '/join',
] as const;

export function isPresenceEnabledPath(pathname: string): boolean {
  return !PRESENCE_DISABLED_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function PresenceRouteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <PresenceProvider enabled={isPresenceEnabledPath(pathname)}>
      {children}
    </PresenceProvider>
  );
}
