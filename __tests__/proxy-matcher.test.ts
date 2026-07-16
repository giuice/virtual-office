import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

describe('proxy matcher', () => {
  it.each([
    '/api/users/sync-profile',
    '/api/users/list',
    '/api/companies/get',
    '/api/spaces',
    '/api/auth/callback',
    '/api',
    '/api/',
    '/favicon.ico',
    '/_next/static/chunk.js',
  ])('does not match %s', (pathname) => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: `https://example.test${pathname}` })
    ).toBe(false);
  });

  it.each(['/floor-plan', '/dashboard', '/login', '/admin', '/', '/api-docs'])('matches %s', (pathname) => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: `https://example.test${pathname}` })
    ).toBe(true);
  });
});