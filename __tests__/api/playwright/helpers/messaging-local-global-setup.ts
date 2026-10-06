import { request } from '@playwright/test';

import {
  LOCAL_MESSAGING_BASE_URL,
  LOCAL_MESSAGING_FLAG,
  assertLocalSupabaseOnly,
} from './local-supabase-mode';

/**
 * Local messaging mode global setup (runs after the dev server is up).
 *
 * A run that is killed mid-way skips its fixtures' cleanup, and the seeded
 * direct conversation it leaves behind makes every later seed fail on the
 * unique direct-participants fingerprint. Before any test seeds, ask the seed
 * route to remove what earlier runs left: seeded conversations whose members
 * are all Playwright test accounts. The route refuses outside local mode.
 */
export default async function sweepLeftoverSeedData(): Promise<void> {
  if (process.env[LOCAL_MESSAGING_FLAG] !== '1') {
    throw new Error('The messaging leftover sweep only runs in local Supabase mode.');
  }
  assertLocalSupabaseOnly(process.env);

  const context = await request.newContext({ baseURL: LOCAL_MESSAGING_BASE_URL });
  try {
    const response = await context.delete('/api/test/messaging/seed', {
      headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
      data: { action: 'sweep-leftovers' },
    });
    if (!response.ok()) {
      throw new Error(
        `Sweeping leftover messaging seed data failed: ${response.status()} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { removedConversations: number };
    console.log(
      `[messaging local setup] removed ${body.removedConversations} leftover seeded conversation(s) from earlier runs`,
    );
  } finally {
    await context.dispose();
  }
}
