import { defineConfig } from 'vitest/config';
import path from 'path';

// Presence DB integration tests run against a LOCAL Supabase stack (never prod).
// Start it with `npm run db:local:start` and reset with `npm run db:local:reset`.
// Node environment (no jsdom): these tests talk to Postgres / PostgREST directly.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: './__tests__/presence-db/setup.ts',
    include: ['__tests__/presence-db/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**'],
    // DB round-trips + fixture cleanup are slower than unit tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Fixtures share one local database; serialize to keep cleanup deterministic.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
