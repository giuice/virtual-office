import { request } from '@playwright/test';

import { LOCAL_MESSAGING_FLAG, assertLocalSupabaseOnly } from './local-supabase-mode';
import { sweepMeetingNotesE2ELeftovers } from './meeting-notes-e2e';
import { readPresenceRuntimeMode, withLocalMessagingDb } from './messaging-local-db';

/** Base URL of the meeting-notes runner (set by playwright.meeting-notes.config.ts). */
export const MEETING_NOTES_E2E_BASE_URL_ENV = 'VO_MEETING_NOTES_E2E_BASE_URL';

/**
 * Phase 6 meeting-notes runner global setup (runs after the dev server is up).
 *
 * 1. Local Supabase mode only; refuses a non-atomic local Presence mode (the
 *    floor plan, where the space Notes tab lives, expects `atomic`).
 * 2. Removes what interrupted runs left: the messaging seed's leftover
 *    conversations (seed route sweep, which otherwise blocks the next seed)
 *    and every meeting-notes E2E note, space, member row, and company.
 */
export default async function meetingNotesGlobalSetup(): Promise<void> {
  if (process.env[LOCAL_MESSAGING_FLAG] !== '1') {
    throw new Error('The meeting-notes E2E runner only runs in local Supabase mode.');
  }
  assertLocalSupabaseOnly(process.env);

  const mode = await withLocalMessagingDb(readPresenceRuntimeMode);
  if (mode !== 'atomic') {
    throw new Error(
      `Local private.presence_runtime_control.mode is '${mode ?? 'missing'}'; restore 'atomic' before meeting-notes E2E ` +
        '(npm run test:presence:db leaves it legacy).',
    );
  }

  const baseURL = process.env[MEETING_NOTES_E2E_BASE_URL_ENV];
  if (!baseURL) throw new Error(`${MEETING_NOTES_E2E_BASE_URL_ENV} is not set.`);
  const context = await request.newContext({ baseURL });
  try {
    const response = await context.delete('/api/test/messaging/seed', {
      headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET ?? '' },
      data: { action: 'sweep-leftovers' },
    });
    if (!response.ok()) {
      throw new Error(`Sweeping leftover messaging seed data failed: ${response.status()} ${await response.text()}`);
    }
  } finally {
    await context.dispose();
  }

  const removed = await sweepMeetingNotesE2ELeftovers();
  console.log(
    `[meeting-notes setup] removed leftovers: ${removed.notes} note(s), ${removed.spaces} space(s), ` +
      `${removed.users} member row(s), ${removed.companies} company(ies)`,
  );
}
