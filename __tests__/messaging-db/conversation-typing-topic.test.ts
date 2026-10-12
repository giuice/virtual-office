// Phase 5 T5 / AC-019 (FR-019, BR-009), AC-035: the conversation typing topic
// is a PRIVATE Realtime topic whose join and broadcast send are authorized in
// the database only for current members of the conversation
// (users.supabase_uid = auth.uid()::text -> users.id -> conversation_members).
//
// Everything runs against the real local stack: supabase-js clients signed in
// as real local users (or the anon key) talk to the local Realtime server,
// which evaluates the realtime.messages policies in local Postgres. Nothing is
// mocked. Negative delivery is proven against a positive control: a member's
// signal sent AFTER every injection must arrive first, then a grace window
// passes before asserting that nothing else arrived.
import { randomUUID } from 'node:crypto';

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { conversationTypingTopic } from '@/lib/messaging/typing-topic';

import {
  createMessagingWorld,
  MESSAGING_DB_PASSWORD,
  type MessagingDbUser,
  type MessagingDbWorld,
} from './fixtures';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL } from './setup';

interface TypingSignal {
  readonly userId: string;
  readonly isTyping: boolean;
  readonly marker: string;
}

type JoinStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

interface TopicJoin {
  readonly client: SupabaseClient;
  readonly channel: RealtimeChannel;
  readonly status: JoinStatus;
  readonly error: string | null;
  readonly received: TypingSignal[];
  /** Latest lifecycle status reported for this channel after the join. */
  readonly lifecycle: JoinStatus[];
}

const JOIN_TIMEOUT_MS = 10_000;
const DELIVERY_TIMEOUT_MS = 5_000;
// Window after the positive control during which a leaked event would show.
const GRACE_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await sleep(50);
  }
  return predicate();
}

function anonClient(): SupabaseClient {
  return createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A second, independent signed-in session (own Realtime socket) of a user. */
async function signedInClient(user: MessagingDbUser): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: MESSAGING_DB_PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for a fixture user: ${error.message}`);
  return client;
}

async function accessToken(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

async function joinTopic(client: SupabaseClient, topic: string, isPrivate: boolean): Promise<TopicJoin> {
  const received: TypingSignal[] = [];
  const lifecycle: JoinStatus[] = [];
  const channel = client.channel(topic, {
    config: { private: isPrivate, broadcast: { self: false, ack: true } },
  });
  channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    received.push(payload as TypingSignal);
  });
  const outcome = await new Promise<{ status: JoinStatus; error: string | null }>((resolve) => {
    const timer = setTimeout(() => resolve({ status: 'TIMED_OUT', error: 'join not answered' }), JOIN_TIMEOUT_MS);
    channel.subscribe((status, err) => {
      lifecycle.push(status as JoinStatus);
      clearTimeout(timer);
      resolve({ status: status as JoinStatus, error: err?.message ?? null });
    });
  });
  if (outcome.status !== 'SUBSCRIBED') {
    // A refused join would otherwise keep rejoining in the background.
    await client.removeChannel(channel);
  }
  return { client, channel, received, lifecycle, ...outcome };
}

function signal(userId: string, marker: string): TypingSignal {
  return { userId, isTyping: true, marker };
}

async function wsSend(join: TopicJoin, payload: TypingSignal): Promise<string> {
  return join.channel.send({ type: 'broadcast', event: 'typing', payload });
}

/** Realtime REST batch endpoint (what `channel.send` falls back to). */
async function restBatchSend(
  token: string | null,
  topic: string,
  payload: TypingSignal,
  isPrivate: boolean,
): Promise<number> {
  const response = await fetch(`${MESSAGING_API_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: MESSAGING_ANON_KEY,
      Authorization: `Bearer ${token ?? MESSAGING_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages: [{ topic, event: 'typing', payload, private: isPrivate }] }),
  });
  await response.body?.cancel();
  return response.status;
}

/** Realtime REST per-topic endpoint (what `channel.httpSend` uses). */
async function restTopicSend(
  token: string | null,
  topic: string,
  payload: TypingSignal,
  isPrivate: boolean,
): Promise<number> {
  const url = new URL(
    `${MESSAGING_API_URL}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/typing`,
  );
  if (isPrivate) url.searchParams.set('private', 'true');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: MESSAGING_ANON_KEY,
      Authorization: `Bearer ${token ?? MESSAGING_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  await response.body?.cancel();
  return response.status;
}

const markers = (join: TopicJoin) => join.received.map((event) => event.marker);

/** The `session_id` claim of an access token (the presence fence key). */
function sessionIdOf(token: string): string {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
    session_id?: string;
  };
  if (!claims.session_id) throw new Error('access token without session_id');
  return claims.session_id;
}

describe('conversation typing topic: private, members-only Realtime (AC-019)', () => {
  let world: MessagingDbWorld;
  const extraClients: SupabaseClient[] = [];

  const track = (client: SupabaseClient): SupabaseClient => {
    extraClients.push(client);
    return client;
  };

  const leaveAll = async (): Promise<void> => {
    for (const client of [
      world.primary.client,
      world.secondary.client,
      world.outsider.client,
      world.groupThirdMember?.client,
      ...extraClients,
    ]) {
      if (client) await client.removeAllChannels();
    }
  };

  beforeAll(async () => {
    world = await createMessagingWorld({ historyMessageCount: 0, withGroupThirdMember: true });
  });

  afterAll(async () => {
    if (!world) return;
    await leaveAll();
    await world.cleanup();
  });

  it('delivers a member typing signal to another member over WebSocket and REST', async () => {
    const { primary, secondary, directConversationId } = world;
    const topic = conversationTypingTopic(directConversationId);
    try {
      const sender = await joinTopic(primary.client, topic, true);
      const receiver = await joinTopic(secondary.client, topic, true);
      expect(sender.status).toBe('SUBSCRIBED');
      expect(receiver.status).toBe('SUBSCRIBED');

      const tag = randomUUID();
      expect(await wsSend(sender, signal(primary.appUserId, `ws-${tag}`))).toBe('ok');
      expect(
        await restBatchSend(await accessToken(primary.client), topic, signal(primary.appUserId, `rest-${tag}`), true),
      ).toBe(202);
      expect(
        await restTopicSend(await accessToken(primary.client), topic, signal(primary.appUserId, `http-${tag}`), true),
      ).toBe(202);

      expect(await waitFor(() => receiver.received.length >= 3, DELIVERY_TIMEOUT_MS)).toBe(true);
      expect(markers(receiver).sort()).toEqual([`http-${tag}`, `rest-${tag}`, `ws-${tag}`]);
      expect(receiver.received.every((event) => event.userId === primary.appUserId)).toBe(true);
    } finally {
      await leaveAll();
    }
  });

  it('refuses the private join to anon clients, outsiders and same-company non-members', async () => {
    const { outsider, groupThirdMember, directConversationId } = world;
    const topic = conversationTypingTopic(directConversationId);
    // groupThirdMember belongs to the same company but is not in the DM.
    const sameCompanyNonMember = groupThirdMember as MessagingDbUser;
    try {
      const anon = await joinTopic(track(anonClient()), topic, true);
      const other = await joinTopic(outsider.client, topic, true);
      const nonMember = await joinTopic(sameCompanyNonMember.client, topic, true);
      for (const refused of [anon, other, nonMember]) {
        expect(refused.status).toBe('CHANNEL_ERROR');
        expect(refused.error).toMatch(/^Unauthorized: You do not have permissions to read from this Channel topic/);
      }
    } finally {
      await leaveAll();
    }
  });

  it('never delivers member typing to anon, outsider, non-member or public-topic listeners', async () => {
    const { primary, secondary, outsider, groupThirdMember, directConversationId } = world;
    const topic = conversationTypingTopic(directConversationId);
    const legacyPublicTopic = `conversation:${directConversationId}`;
    try {
      const sender = await joinTopic(primary.client, topic, true);
      const receiver = await joinTopic(secondary.client, topic, true);
      expect(sender.status).toBe('SUBSCRIBED');
      expect(receiver.status).toBe('SUBSCRIBED');

      // Listeners on the SAME topic name as a public channel, including a
      // member's own identity, plus the legacy public typing topic name.
      const publicListeners = [
        await joinTopic(track(anonClient()), topic, false),
        await joinTopic(outsider.client, topic, false),
        await joinTopic((groupThirdMember as MessagingDbUser).client, topic, false),
        await joinTopic(track(await signedInClient(secondary)), topic, false),
        await joinTopic(track(anonClient()), legacyPublicTopic, false),
      ];
      for (const listener of publicListeners) {
        expect(listener.status).toBe('SUBSCRIBED');
      }

      const tag = randomUUID();
      expect(await wsSend(sender, signal(primary.appUserId, `member-ws-${tag}`))).toBe('ok');
      await restBatchSend(await accessToken(primary.client), topic, signal(primary.appUserId, `member-rest-${tag}`), true);
      expect(await waitFor(() => receiver.received.length >= 2, DELIVERY_TIMEOUT_MS)).toBe(true);

      // The public listeners are live: a public control reaches them.
      const publicSender = await joinTopic(track(anonClient()), topic, false);
      const legacySender = await joinTopic(track(anonClient()), legacyPublicTopic, false);
      expect(await wsSend(publicSender, signal('public', `public-control-${tag}`))).toBe('ok');
      expect(await wsSend(legacySender, signal('public', `legacy-control-${tag}`))).toBe('ok');
      expect(
        await waitFor(
          () => publicListeners.every((listener) => listener.received.length >= 1),
          DELIVERY_TIMEOUT_MS,
        ),
      ).toBe(true);
      await sleep(GRACE_MS);

      for (const listener of publicListeners.slice(0, 4)) {
        expect(markers(listener)).toEqual([`public-control-${tag}`]);
      }
      expect(markers(publicListeners[4])).toEqual([`legacy-control-${tag}`]);
      // ...and the public controls never reached the private topic.
      expect(markers(receiver).sort()).toEqual([`member-rest-${tag}`, `member-ws-${tag}`]);
    } finally {
      await leaveAll();
    }
  });

  it('drops typing injected by anon, outsiders, non-members and the public topic', async () => {
    const { primary, secondary, outsider, groupThirdMember, directConversationId } = world;
    const nonMember = groupThirdMember as MessagingDbUser;
    const topic = conversationTypingTopic(directConversationId);
    try {
      const sender = await joinTopic(primary.client, topic, true);
      const receiver = await joinTopic(secondary.client, topic, true);
      expect(sender.status).toBe('SUBSCRIBED');
      expect(receiver.status).toBe('SUBSCRIBED');

      const tag = randomUUID();
      // Forged identities: every injection claims to be the member primary.
      const forged = (source: string) => signal(primary.appUserId, `inject-${source}-${tag}`);
      const outsiderToken = await accessToken(outsider.client);
      const nonMemberToken = await accessToken(nonMember.client);

      const restStatuses: Record<string, number> = {
        anonBatchPrivate: await restBatchSend(null, topic, forged('anon-batch'), true),
        anonTopicPrivate: await restTopicSend(null, topic, forged('anon-topic'), true),
        outsiderBatchPrivate: await restBatchSend(outsiderToken, topic, forged('outsider-batch'), true),
        outsiderTopicPrivate: await restTopicSend(outsiderToken, topic, forged('outsider-topic'), true),
        nonMemberBatchPrivate: await restBatchSend(nonMemberToken, topic, forged('nonmember-batch'), true),
        nonMemberTopicPrivate: await restTopicSend(nonMemberToken, topic, forged('nonmember-topic'), true),
        outsiderBatchPublic: await restBatchSend(outsiderToken, topic, forged('outsider-public-batch'), false),
        anonTopicPublic: await restTopicSend(null, topic, forged('anon-public-topic'), false),
      };
      // The per-topic endpoint refuses an unauthorized private send (403);
      // the batch endpoint answers 202 and drops it. Either way nothing may be
      // delivered, which is asserted below against the positive control.
      expect(restStatuses).toMatchObject({
        anonTopicPrivate: 403,
        outsiderTopicPrivate: 403,
        nonMemberTopicPrivate: 403,
      });
      for (const status of Object.values(restStatuses)) {
        expect([202, 401, 403]).toContain(status);
      }

      // WebSocket sends on the public channel of the same name, including a
      // member identity that is not joined to the private topic.
      const publicSenders = [
        await joinTopic(track(anonClient()), topic, false),
        await joinTopic(outsider.client, topic, false),
        await joinTopic(track(await signedInClient(secondary)), topic, false),
      ];
      for (const [index, publicSender] of publicSenders.entries()) {
        expect(publicSender.status).toBe('SUBSCRIBED');
        expect(await wsSend(publicSender, forged(`public-ws-${index}`))).toBe('ok');
      }

      // Positive controls sent after every injection, over the WebSocket and
      // over the same REST batch path the batch injections used (its 202 is
      // answered before dispatch, so the REST control bounds their delivery).
      expect(await wsSend(sender, signal(primary.appUserId, `control-${tag}`))).toBe('ok');
      expect(
        await restBatchSend(await accessToken(primary.client), topic, signal(primary.appUserId, `rest-control-${tag}`), true),
      ).toBe(202);
      expect(
        await waitFor(
          () => markers(receiver).includes(`control-${tag}`) && markers(receiver).includes(`rest-control-${tag}`),
          DELIVERY_TIMEOUT_MS,
        ),
      ).toBe(true);
      await sleep(GRACE_MS);

      expect(markers(receiver).sort()).toEqual([`control-${tag}`, `rest-control-${tag}`]);
      // REST broadcasts have no `self: false`: the sender hears only its own REST control.
      expect(markers(sender)).toEqual([`rest-control-${tag}`]);
    } finally {
      await leaveAll();
    }
  });

  it('leaves the existing private Presence and Knock topic joins unchanged through the real Realtime server', async () => {
    const { primary, outsider, companyId } = world;
    // Same topic builders as src/lib/presence/realtime.ts and knock-realtime.ts.
    const presenceTopic = `company:${companyId}:presence`;
    const knockTopic = `company:${companyId}:knock`;
    try {
      // Own company (unfenced session): authorized, as before T5.
      expect((await joinTopic(primary.client, presenceTopic, true)).status).toBe('SUBSCRIBED');
      expect((await joinTopic(primary.client, knockTopic, true)).status).toBe('SUBSCRIBED');
      // Another company's member and anon: refused, as before T5.
      for (const topic of [presenceTopic, knockTopic]) {
        expect((await joinTopic(outsider.client, topic, true)).status).toBe('CHANNEL_ERROR');
        expect((await joinTopic(track(anonClient()), topic, true)).status).toBe('CHANNEL_ERROR');
      }
    } finally {
      await leaveAll();
    }
  });

  it('refuses a signed-out (presence-fenced) auth session of a member; other sessions keep working', async () => {
    const { primary, secondary, directConversationId } = world;
    const topic = conversationTypingTopic(directConversationId);
    try {
      const sender = await joinTopic(primary.client, topic, true);
      const receiver = await joinTopic(secondary.client, topic, true);
      const fencedClient = track(await signedInClient(secondary));
      const fenced = await joinTopic(fencedClient, topic, true);
      expect([sender.status, receiver.status, fenced.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED']);

      // What the Presence logout transition records for the signed-out session.
      const fencedToken = (await accessToken(fencedClient)) as string;
      await world.query(
        `insert into public.revoked_presence_auth_sessions (auth_session_id, user_id, revoked_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [sessionIdOf(fencedToken), secondary.appUserId],
      );

      // The fenced session can no longer join (fresh channel on its socket)...
      await fencedClient.removeAllChannels();
      const rejoin = await joinTopic(fencedClient, topic, true);
      expect(rejoin.status).toBe('CHANNEL_ERROR');
      // ...nor send over REST.
      const tag = randomUUID();
      expect(await restTopicSend(fencedToken, topic, signal(secondary.appUserId, `fenced-${tag}`), true)).toBe(403);

      // The member's other (unfenced) session is unaffected.
      expect(await wsSend(sender, signal(primary.appUserId, `control-${tag}`))).toBe('ok');
      expect(await waitFor(() => markers(receiver).includes(`control-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);
      await sleep(GRACE_MS);
      expect(markers(sender)).toEqual([]);
    } finally {
      await leaveAll();
    }
  });

  it('refuses a removed member a new join and REST sends; its stale join keeps cached receive/send until a token refresh closes it', async () => {
    const { primary, secondary, groupConversationId } = world;
    const removed = world.groupThirdMember as MessagingDbUser;
    const topic = conversationTypingTopic(groupConversationId);
    try {
      const sender = await joinTopic(primary.client, topic, true);
      const receiver = await joinTopic(secondary.client, topic, true);
      const stale = await joinTopic(removed.client, topic, true);
      expect([sender.status, receiver.status, stale.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED']);

      const tag = randomUUID();
      expect(await wsSend(sender, signal(primary.appUserId, `before-${tag}`))).toBe('ok');
      expect(await waitFor(() => markers(stale).includes(`before-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);
      // The removed member had sent before removal (write authorization cached).
      expect(await wsSend(stale, signal(removed.appUserId, `stale-before-${tag}`))).toBe('ok');
      expect(await waitFor(() => markers(receiver).includes(`stale-before-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);

      // Administrative removal (service role) = revocation (T28).
      await world.query(
        'delete from public.conversation_members where conversation_id = $1 and user_id = $2',
        [groupConversationId, removed.appUserId],
      );

      // A fresh join (new session of the removed user) is refused.
      const rejoin = await joinTopic(track(await signedInClient(removed)), topic, true);
      expect(rejoin.status).toBe('CHANNEL_ERROR');
      expect(rejoin.error).toMatch(/^Unauthorized: You do not have permissions to read from this Channel topic/);
      // REST sends from the removed user are refused (per-topic) or dropped (batch).
      const removedToken = await accessToken(removed.client);
      expect(
        await restTopicSend(removedToken, topic, signal(removed.appUserId, `removed-http-${tag}`), true),
      ).toBe(403);
      await restBatchSend(removedToken, topic, signal(removed.appUserId, `removed-rest-${tag}`), true);
      expect(
        await restBatchSend(await accessToken(primary.client), topic, signal(primary.appUserId, `rest-control-${tag}`), true),
      ).toBe(202);
      expect(await waitFor(() => markers(receiver).includes(`rest-control-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);

      // Until re-authorized, the stale join keeps its cached authorization
      // (accepted residual, SPEC D3/D6; the application leaves on its removal
      // signal — T15). Measured: after the revocation and before any refresh,
      // the stale socket still SENDS (its write authorization was cached by
      // its pre-removal send) and members receive it; it also still receives
      // (the REST control above).
      expect(await wsSend(stale, signal(removed.appUserId, `stale-cached-${tag}`))).toBe('ok');
      expect(await waitFor(() => markers(receiver).includes(`stale-cached-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);

      // Pushing a refreshed access token (what supabase-js does on
      // TOKEN_REFRESHED) makes the server re-check the policies and close the
      // join. Closure at token expiry without a refresh is not exercised here.
      expect(stale.lifecycle).toEqual(['SUBSCRIBED']);
      const { error: refreshError } = await removed.client.auth.refreshSession();
      expect(refreshError).toBeNull();
      await removed.client.realtime.setAuth((await accessToken(removed.client)) ?? undefined);
      // The only lifecycle change is the one caused by the re-authorization.
      expect(await waitFor(() => stale.lifecycle.length > 1, DELIVERY_TIMEOUT_MS)).toBe(true);
      expect(stale.lifecycle.slice(1).every((status) => status !== 'SUBSCRIBED')).toBe(true);
      // After the close this falls back to REST with the removed user's token.
      await wsSend(stale, signal(removed.appUserId, `stale-after-${tag}`));

      expect(await wsSend(sender, signal(primary.appUserId, `after-${tag}`))).toBe('ok');
      expect(await waitFor(() => markers(receiver).includes(`after-${tag}`), DELIVERY_TIMEOUT_MS)).toBe(true);
      await sleep(GRACE_MS);

      // Before the re-authorization the stale join still heard the member's
      // REST control (accepted residual, D3/D6); after it, nothing.
      expect(markers(stale)).toEqual([`before-${tag}`, `rest-control-${tag}`]);
      // Of what the removed member sent after its removal, only the cached
      // stale-socket send before the re-authorization reached members (the
      // residual); its REST sends and its send after re-authorization did not.
      expect(markers(receiver).sort()).toEqual(
        [`after-${tag}`, `before-${tag}`, `rest-control-${tag}`, `stale-before-${tag}`, `stale-cached-${tag}`].sort(),
      );
    } finally {
      await leaveAll();
    }
  });
});

// The same contract read from the catalog and evaluated by Postgres exactly as
// the Realtime server evaluates it (role + request.jwt.claims + realtime.topic
// set per transaction), inside transactions that are rolled back.
describe('conversation typing topic: realtime.messages policy contract', () => {
  let world: MessagingDbWorld;

  beforeAll(async () => {
    world = await createMessagingWorld({ historyMessageCount: 0, withGroupThirdMember: true });
  });

  afterAll(async () => {
    if (world) await world.cleanup();
  });

  /**
   * Runs `body` as `role` with the given JWT subject, auth session and realtime
   * topic, then rolls back.
   */
  const asRealtime = async (
    role: 'authenticated' | 'anon',
    sub: string | null,
    topic: string,
    body: () => Promise<void>,
    sessionId: string = randomUUID(),
  ): Promise<void> => {
    await world.query('begin');
    try {
      await world.query(`select pg_catalog.set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(sub ? { role, sub, session_id: sessionId } : { role }),
      ]);
      await world.query(`select pg_catalog.set_config('realtime.topic', $1, true)`, [topic]);
      await world.query(`set local role ${role}`);
      await body();
    } finally {
      await world.query('rollback');
    }
  };

  const expectDenied = async (sql: string, params: unknown[]): Promise<void> => {
    await world.query('savepoint denied');
    await expect(world.query(sql, params)).rejects.toMatchObject({ code: '42501' });
    await world.query('rollback to savepoint denied');
  };

  it('installs exactly the two broadcast-only typing policies next to the unchanged private-topic policies', async () => {
    const policies = await world.query<{
      policyname: string;
      cmd: string;
      permissive: string;
      roles: string[];
      qual: string | null;
      with_check: string | null;
    }>(
      `select policyname, cmd, permissive, roles::text[] as roles, qual, with_check
         from pg_catalog.pg_policies
        where schemaname = 'realtime' and tablename = 'messages'
        order by policyname`,
    );
    expect(policies.map(({ policyname, cmd }) => `${policyname}:${cmd}`)).toEqual([
      'phase4_knock_broadcast_receive:SELECT',
      'phase5_conversation_typing_broadcast_receive:SELECT',
      'phase5_conversation_typing_broadcast_send:INSERT',
      'phase6_company_presence_channel_broadcast_receive:SELECT',
      'phase6_company_presence_receive:SELECT',
      'phase6_company_presence_track:INSERT',
      'phase8_media_broadcast_receive:SELECT',
      'phase8_media_presence_receive:SELECT',
      'phase8_media_presence_track:INSERT',
    ]);
    for (const policy of policies.filter(({ policyname }) => policyname.startsWith('phase5_'))) {
      expect(policy.permissive).toBe('PERMISSIVE');
      expect(policy.roles).toEqual(['authenticated']);
      const expression = (policy.cmd === 'SELECT' ? policy.qual : policy.with_check) ?? '';
      expect(policy.cmd === 'SELECT' ? policy.with_check : policy.qual).toBeNull();
      expect(expression).toContain("extension = 'broadcast'::text");
      expect(expression).toContain('(topic = ');
      expect(expression).toContain('realtime.topic()');
      expect(expression).toContain('private.can_use_conversation_typing_topic(topic)');
      expect(expression).toContain('private.is_presence_auth_session_unfenced()');
    }
    // No pre-existing policy can match a conversation topic.
    for (const policy of policies.filter(({ policyname }) => !policyname.startsWith('phase5_'))) {
      const expression = `${policy.qual ?? ''} ${policy.with_check ?? ''}`;
      expect(expression).not.toContain('conversation');
      expect(expression).toMatch(/company:|is_media_topic_authorized/);
    }

    const [fn] = await world.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public_grant: boolean;
    }>(
      `select p.prosecdef, p.proconfig,
              pg_catalog.has_function_privilege('anon', p.oid, 'execute') as anon,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              pg_catalog.has_function_privilege('service_role', p.oid, 'execute') as service_role,
              exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = 0) as public_grant
         from pg_catalog.pg_proc p
        where p.oid = 'private.can_use_conversation_typing_topic(text)'::regprocedure`,
    );
    expect(fn).toEqual({
      prosecdef: false,
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: true,
      service_role: false,
      public_grant: false,
    });
  });

  it('authorizes only the canonical topic of a conversation the caller currently belongs to', async () => {
    const { primary, groupThirdMember, outsider, directConversationId, groupConversationId } = world;
    const third = groupThirdMember as MessagingDbUser;
    const check = async (sub: string, topic: string | null): Promise<boolean> => {
      let result = false;
      await asRealtime('authenticated', sub, topic ?? '', async () => {
        const [row] = await world.query<{ ok: boolean }>(
          'select private.can_use_conversation_typing_topic($1) as ok',
          [topic],
        );
        result = row.ok;
      });
      return result;
    };
    const direct = conversationTypingTopic(directConversationId);
    expect(await check(primary.supabaseUid, direct)).toBe(true);
    expect(await check(third.supabaseUid, conversationTypingTopic(groupConversationId))).toBe(true);
    // Same company, not a member of the DM; other company.
    expect(await check(third.supabaseUid, direct)).toBe(false);
    expect(await check(outsider.supabaseUid, direct)).toBe(false);
    // Unknown JWT subject (no users row).
    expect(await check(randomUUID(), direct)).toBe(false);
    // Only the exact contract spelling.
    for (const variant of [
      `conversation:${directConversationId.toUpperCase()}:typing`,
      `conversation:{${directConversationId}}:typing`,
      `conversation:${directConversationId}`,
      `conversation:${directConversationId}:typing:x`,
      `conversation:${directConversationId}:typing\n`,
      `xconversation:${directConversationId}:typing`,
      `conversation:${directConversationId.replace(/-/g, '')}:typing`,
      `conversation:${randomUUID()}:typing`,
      'conversation:not-a-uuid:typing',
      '',
      null,
    ]) {
      expect(await check(primary.supabaseUid, variant)).toBe(false);
    }
  });

  it('allows a member broadcast join/send on the typing topic but never presence, another topic row, or anon', async () => {
    const { primary, companyId, directConversationId, groupConversationId } = world;
    const topic = conversationTypingTopic(directConversationId);
    const [broadcastRow, presenceRow] = await world.query<{ id: string }>(
      `insert into realtime.messages (topic, extension)
       values ($1, 'broadcast'), ($1, 'presence')
       returning id`,
      [topic],
    );
    try {
      await asRealtime('authenticated', primary.supabaseUid, topic, async () => {
        const visible = await world.query<{ id: string }>(
          'select id from realtime.messages where id = any($1::uuid[])',
          [[broadcastRow.id, presenceRow.id]],
        );
        expect(visible.map(({ id }) => id)).toEqual([broadcastRow.id]);
        const sent = await world.query<{ extension: string }>(
          `insert into realtime.messages (topic, extension) values ($1, 'broadcast') returning extension`,
          [topic],
        );
        expect(sent).toEqual([{ extension: 'broadcast' }]);
        await expectDenied(`insert into realtime.messages (topic, extension) values ($1, 'presence')`, [topic]);
        // The row's topic must be the authorized topic, even for another
        // conversation the caller belongs to.
        await expectDenied(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [
          conversationTypingTopic(groupConversationId),
        ]);
        // Existing private topics are unchanged: no client broadcast on company presence.
        await expectDenied(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [
          `company:${companyId}:presence`,
        ]);
      });

      // A presence-fenced (signed-out) auth session of the same member.
      const fencedSessionId = randomUUID();
      await world.query(
        `insert into public.revoked_presence_auth_sessions (auth_session_id, user_id, revoked_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [fencedSessionId, primary.appUserId],
      );
      await asRealtime(
        'authenticated',
        primary.supabaseUid,
        topic,
        async () => {
          const visible = await world.query<{ id: string }>(
            'select id from realtime.messages where id = any($1::uuid[])',
            [[broadcastRow.id, presenceRow.id]],
          );
          expect(visible).toEqual([]);
          await expectDenied(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [topic]);
        },
        fencedSessionId,
      );
      await world.query('delete from public.revoked_presence_auth_sessions where auth_session_id = $1', [
        fencedSessionId,
      ]);

      await asRealtime('anon', null, topic, async () => {
        await expectDenied('select private.can_use_conversation_typing_topic($1)', [topic]);
        const visible = await world.query<{ id: string }>(
          'select id from realtime.messages where id = any($1::uuid[])',
          [[broadcastRow.id, presenceRow.id]],
        );
        expect(visible).toEqual([]);
        await expectDenied(`insert into realtime.messages (topic, extension) values ($1, 'broadcast')`, [topic]);
      });
    } finally {
      await world.query('delete from realtime.messages where id = any($1::uuid[])', [
        [broadcastRow.id, presenceRow.id],
      ]);
    }
  });
});
