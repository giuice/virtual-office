import { defineConfig } from 'vitest/config';
import path from 'path';

// Explicit opt-in suite for the service-role messaging integration. The test
// itself requires dedicated REMOTE_MESSAGING_* credentials and an opt-in flag.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/messaging/pin_star_integration.test.ts'],
    exclude: ['**/node_modules/**'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
