import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: "./__tests__/presence-db/setup.ts",
    include: ["__tests__/presence-db/concurrency/all-cases.test.ts"],
    testNamePattern: /\[presence-concurrency:/,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
