import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(
        __dirname,
        './node_modules/next/dist/compiled/server-only/empty.js',
      ),
    },
    include: ['__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/__tests__/api/playwright/**',
      // Real-database suites need the local Supabase stack and run under
      // vitest.presence-db.config.mts (npm run test:presence-db) only.
      '**/__tests__/presence-db/**',
      // This service-role integration mutates an explicitly configured remote
      // project and runs only via `npm run test:messaging-remote`.
      '**/__tests__/messaging/pin_star_integration.test.ts',
      '**/node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
