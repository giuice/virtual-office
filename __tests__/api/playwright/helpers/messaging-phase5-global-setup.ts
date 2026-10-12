import sweepLeftoverSeedData from './messaging-local-global-setup';
import { LOCAL_MESSAGING_FLAG, assertLocalSupabaseOnly } from './local-supabase-mode';
import {
  cleanupMessagingServerState,
  findTestAccountUserIds,
  readPresenceRuntimeMode,
  withLocalMessagingDb,
} from './messaging-local-db';

/**
 * Phase 5 runner global setup (runs after the dev server is up).
 *
 * 1. Refuses to run unless local Presence is in its `atomic` mode (the
 *    Presence DB suite leaves it `legacy`; messaging E2E expects `atomic`).
 * 2. Removes what interrupted runs left behind:
 *    - seeded conversations of the test accounts (seed route sweep; deleting a
 *      conversation cascades to its members, messages, mentions, receipts,
 *      attempt/fence rows, and revocations);
 *    - the test accounts' remaining Phase 5 server state: budget counters,
 *      attempt/fence rows, revocations and mentions in test-only conversations.
 * Browser state needs no sweep: every device is a fresh, non-persistent
 * context (helpers/messaging-browser-state.ts).
 */
export default async function messagingPhase5GlobalSetup(): Promise<void> {
  if (process.env[LOCAL_MESSAGING_FLAG] !== '1') {
    throw new Error('The Phase 5 messaging runner only runs in local Supabase mode.');
  }
  assertLocalSupabaseOnly(process.env);

  const mode = await withLocalMessagingDb(readPresenceRuntimeMode);
  if (mode !== 'atomic') {
    throw new Error(
      `Local private.presence_runtime_control.mode is '${mode ?? 'missing'}'; restore 'atomic' before messaging E2E ` +
        '(npm run test:presence:db leaves it legacy).',
    );
  }

  await sweepLeftoverSeedData();

  const removed = await withLocalMessagingDb(async (db) =>
    cleanupMessagingServerState(db, await findTestAccountUserIds(db)),
  );
  console.log(
    `[messaging phase5 setup] removed leftover server state: ${removed.budgetCounters} budget counter(s), ` +
      `${removed.attemptRows} attempt row(s), ${removed.revocations} revocation(s), ${removed.mentions} mention(s)`,
  );
}
