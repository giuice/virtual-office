import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Phase 8 ownership manifest for every application-layer Presence test added or
// changed during Phases 1-7. Real Postgres and browser scenarios have separate
// commands so a missing external prerequisite fails its own gate explicitly.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    include: [
      '__tests__/**/*presence*.test.{js,mjs,ts,tsx}',
      '__tests__/**/*location*.test.{js,mjs,ts,tsx}',
      '__tests__/**/*knock*.test.{js,mjs,ts,tsx}',
      '__tests__/**/*space-capacity*.test.{js,mjs,ts,tsx}',
      '__tests__/api/auth-callback-route.test.ts',
      '__tests__/api/companies-{create,get}-route.test.ts',
      '__tests__/api/invitations-{accept,create-limit}.test.ts',
      '__tests__/api/platform-admin-create-company.test.ts',
      '__tests__/api/spaces-get-route.test.ts',
      '__tests__/api/users-{avatar,by-company,list,remove-from-company,sync-profile,update}-route.test.ts',
      '__tests__/app/auth/{login,onboarding}-page.test.tsx',
      '__tests__/audio-signaling.test.tsx',
      '__tests__/audio-context.test.tsx',
      '__tests__/auth-metrics*.test.{js,mjs,ts}',
      '__tests__/auth-session.test.ts',
      '__tests__/components/floor-plan-bootstrap-states.test.tsx',
      '__tests__/contexts/company-context-bootstrap.test.tsx',
      '__tests__/default-space-assignment.test.tsx',
      '__tests__/guards/*.test.{js,mjs,ts,tsx}',
      '__tests__/lib/api-error-parsing.test.ts',
      '__tests__/proxy-*.test.ts',
      '__tests__/realtime-presence.test.ts',
      '__tests__/reconnection-grace.test.tsx',
      '__tests__/user-avatar-presence-v2.test.tsx',
      '__tests__/uploadable-avatar.test.tsx',
    ],
    exclude: [
      '**/__tests__/api/playwright/**',
      '**/__tests__/presence-db/**',
      '**/__tests__/messaging/pin_star_integration.test.ts',
      '**/node_modules/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(
        __dirname,
        './node_modules/next/dist/compiled/server-only/empty.js',
      ),
    },
  },
});
