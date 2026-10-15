import { defineConfig } from "vitest/config";
import path from "path";

import {
  MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV,
  meetingNotesFakeAiBaseUrl,
} from "./__tests__/meeting-notes-ai-fake/config";

// Meeting-notes DB integration tests run against the LOCAL Supabase stack only
// (API 127.0.0.1:54321, Postgres 127.0.0.1:54322). Start it with
// `npm run db:local:start`; apply pending migrations with
// `npx supabase migration up --local`. Node environment: real PostgREST + RLS.
// The external AI provider is the only thing replaced: globalSetup starts the
// fake AI server (127.0.0.1:54399, MEETING_NOTES_FAKE_AI_PORT), self-checks it,
// and stops it after the run; workers get its URL as the app's override.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: "./__tests__/meeting-notes-db/setup.ts",
    globalSetup: "./__tests__/meeting-notes-ai-fake/vitest-global-setup.ts",
    env: { [MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV]: meetingNotesFakeAiBaseUrl() },
    include: ["__tests__/meeting-notes-db/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Fixtures share one local database; serialize to keep cleanup deterministic.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Route handlers are invoked in-process against the local stack; the
      // `server-only` guard is a bundler marker (same alias as vitest.config).
      "server-only": path.resolve(__dirname, "./node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
