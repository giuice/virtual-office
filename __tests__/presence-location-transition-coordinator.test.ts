import { describe, expect, it, vi } from 'vitest';
import {
  LocationTransitionCoordinator,
  type PresenceLocationSnapshot,
} from '@/lib/presence/location-transition-coordinator';

const SPACE_A = '11111111-1111-4111-8111-111111111111';
const SPACE_B = '22222222-2222-4222-8222-222222222222';
const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function success(spaceId: string | null, version: number): Response {
  return Response.json({
    success: true,
    code: 'LOCATION_UPDATED',
    transitionId: '33333333-3333-4333-8333-333333333333',
    previousSpaceId: null,
    currentSpaceId: spaceId,
    locationVersion: version,
    alreadyApplied: false,
  });
}

function makeCoordinator(options: {
  fetcher: typeof fetch;
  reconcile?: () => Promise<PresenceLocationSnapshot | null>;
  rotateSession?: () => Promise<string | null>;
}) {
  let uuid = 0;
  return new LocationTransitionCoordinator({
    getSessionId: () => SESSION_A,
    rotateSession: options.rotateSession ?? (async () => null),
    reconcile: options.reconcile ?? (async () => ({ currentSpaceId: SPACE_A, locationVersion: 1 })),
    fetcher: options.fetcher,
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    sleep: async () => undefined,
  });
}

describe('LocationTransitionCoordinator', () => {
  it('serializes rapid manual A to B and leaves B as the confirmed result', async () => {
    let releaseA!: () => void;
    const waitForA = new Promise<void>((resolve) => { releaseA = resolve; });
    let version = 0;
    let currentSpaceId: string | null = null;
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.spaceId === SPACE_A) await waitForA;
      currentSpaceId = body.spaceId as string;
      version += 1;
      return success(currentSpaceId, version);
    }) as unknown as typeof fetch;
    const coordinator = makeCoordinator({
      fetcher,
      reconcile: async () => ({ currentSpaceId, locationVersion: version }),
    });

    const first = coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' });
    const second = coordinator.transition({ spaceId: SPACE_B, reason: 'manual-enter' });
    releaseA();

    expect(await first).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
    expect((await second).ok).toBe(true);
    expect(bodies.map((body) => body.spaceId)).toEqual([SPACE_A, SPACE_B]);
    expect(currentSpaceId).toBe(SPACE_B);
  });

  it('cancels an auto command during backoff when a manual intent arrives', async () => {
    let attempts = 0;
    let releaseBackoff!: () => void;
    const backoff = new Promise<void>((resolve) => { releaseBackoff = resolve; });
    let currentSpaceId: string | null = null;
    let version = 0;
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { spaceId: string };
      attempts += 1;
      if (body.spaceId === SPACE_A) throw new Error('network');
      currentSpaceId = body.spaceId;
      version += 1;
      return success(currentSpaceId, version);
    }) as unknown as typeof fetch;
    const coordinator = new LocationTransitionCoordinator({
      getSessionId: () => SESSION_A,
      rotateSession: async () => null,
      reconcile: async () => ({ currentSpaceId, locationVersion: version }),
      fetcher,
      randomUUID: () => crypto.randomUUID(),
      sleep: async () => backoff,
    });

    const auto = coordinator.transition({
      spaceId: SPACE_A,
      reason: 'auto-rejoin',
      expectedLocationVersion: 0,
    });
    await vi.waitFor(() => expect(attempts).toBe(1));
    const manual = coordinator.transition({ spaceId: SPACE_B, reason: 'manual-enter' });
    releaseBackoff();

    expect(await auto).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
    expect((await manual).ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('replays the same transition id after a controlled session rotation', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (bodies.length === 1) {
        return Response.json({
          success: false,
          code: 'SESSION_INVALID',
          message: 'invalid',
          retryable: true,
          transitionId: body.transitionId,
        }, { status: 409 });
      }
      return success(SPACE_A, 1);
    }) as unknown as typeof fetch;
    const coordinator = makeCoordinator({
      fetcher,
      rotateSession: async () => SESSION_B,
    });

    expect((await coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' })).ok).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.transitionId).toBe(bodies[1]?.transitionId);
    expect(bodies.map((body) => body.sessionId)).toEqual([SESSION_A, SESSION_B]);
  });

  it('registers a missing tab session before the first manual transition', async () => {
    let sessionId: string | null = null;
    const recoveryStates: boolean[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    const coordinator = new LocationTransitionCoordinator({
      getSessionId: () => sessionId,
      rotateSession: async () => {
        sessionId = SESSION_B;
        return sessionId;
      },
      reconcile: async () => ({ currentSpaceId: SPACE_A, locationVersion: 1 }),
      fetcher: vi.fn(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return success(SPACE_A, 1);
      }) as unknown as typeof fetch,
      onSessionRecoveryChange: (isRecovering) => recoveryStates.push(isRecovering),
    });

    expect(await coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' }))
      .toMatchObject({ ok: true });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.sessionId).toBe(SESSION_B);
    expect(recoveryStates).toEqual([true, false]);
  });

  it('binds the native fetch receiver when no fetcher is injected', async () => {
    const originalFetch = globalThis.fetch;
    const receiverCheckingFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(success(SPACE_A, 1));
    }) as unknown as typeof fetch;
    globalThis.fetch = receiverCheckingFetch;

    try {
      const coordinator = new LocationTransitionCoordinator({
        getSessionId: () => SESSION_A,
        rotateSession: async () => null,
        reconcile: async () => ({ currentSpaceId: SPACE_A, locationVersion: 1 }),
      });

      expect(await coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' }))
        .toMatchObject({ ok: true });
      expect(receiverCheckingFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('coalesces initial session recovery when B supersedes A during registration', async () => {
    let releaseRotation!: () => void;
    const rotationGate = new Promise<void>((resolve) => { releaseRotation = resolve; });
    const recoveryStates: boolean[] = [];
    const bodies: Array<Record<string, unknown>> = [];
    let currentSpaceId: string | null = null;
    let version = 0;
    const rotateSession = vi.fn(async () => {
      await rotationGate;
      return SESSION_B;
    });
    const coordinator = new LocationTransitionCoordinator({
      getSessionId: () => null,
      rotateSession,
      reconcile: async () => ({ currentSpaceId, locationVersion: version }),
      fetcher: vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        currentSpaceId = body.spaceId as string;
        version += 1;
        return success(currentSpaceId, version);
      }) as unknown as typeof fetch,
      onSessionRecoveryChange: (isRecovering) => recoveryStates.push(isRecovering),
    });

    const first = coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' });
    await vi.waitFor(() => expect(rotateSession).toHaveBeenCalledTimes(1));
    const second = coordinator.transition({ spaceId: SPACE_B, reason: 'manual-enter' });
    releaseRotation();

    expect(await first).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
    expect(await second).toMatchObject({ ok: true });
    expect(rotateSession).toHaveBeenCalledTimes(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ sessionId: SESSION_B, spaceId: SPACE_B });
    expect(recoveryStates).toEqual([true, false]);
  });

  it('does not report stale historical success when the reconciled snapshot moved on', async () => {
    const coordinator = makeCoordinator({
      fetcher: vi.fn(async () => success(SPACE_A, 1)) as unknown as typeof fetch,
      reconcile: async () => ({ currentSpaceId: SPACE_B, locationVersion: 2 }),
    });

    expect(await coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' }))
      .toMatchObject({ ok: false, code: 'LOCATION_SUPERSEDED', skipped: true });
  });

  it('supersedes A when B arrives while A is awaiting reconcile', async () => {
    let releaseReconcile!: () => void;
    const reconcileGate = new Promise<void>((resolve) => { releaseReconcile = resolve; });
    let currentSpaceId: string | null = null;
    let version = 0;
    let reconcileCalls = 0;
    const coordinator = makeCoordinator({
      fetcher: vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { spaceId: string };
        currentSpaceId = body.spaceId;
        version += 1;
        return success(currentSpaceId, version);
      }) as unknown as typeof fetch,
      reconcile: async () => {
        reconcileCalls += 1;
        if (reconcileCalls === 1) await reconcileGate;
        return { currentSpaceId, locationVersion: version };
      },
    });

    const first = coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' });
    await vi.waitFor(() => expect(reconcileCalls).toBe(1));
    const second = coordinator.transition({ spaceId: SPACE_B, reason: 'manual-enter' });
    releaseReconcile();

    expect(await first).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
    expect(await second).toMatchObject({ ok: true });
  });

  it('cannot report success after disposal during reconcile', async () => {
    let releaseReconcile!: () => void;
    const reconcileGate = new Promise<void>((resolve) => { releaseReconcile = resolve; });
    const coordinator = makeCoordinator({
      fetcher: vi.fn(async () => success(SPACE_A, 1)) as unknown as typeof fetch,
      reconcile: async () => {
        await reconcileGate;
        return { currentSpaceId: SPACE_A, locationVersion: 1 };
      },
    });

    const transition = coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' });
    await Promise.resolve();
    coordinator.dispose();
    releaseReconcile();

    expect(await transition).toMatchObject({ ok: false, code: 'CLIENT_COMMAND_SUPERSEDED' });
  });

  it('replays an ambiguous truncated 2xx with the same transition id', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const coordinator = makeCoordinator({
      fetcher: vi.fn(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return bodies.length === 1
          ? new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } })
          : success(SPACE_A, 1);
      }) as unknown as typeof fetch,
    });

    expect(await coordinator.transition({ spaceId: SPACE_A, reason: 'manual-enter' }))
      .toMatchObject({ ok: true });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.transitionId).toBe(bodies[1]?.transitionId);
  });

  it('keeps explicit leave at null without treating null as no pending target', async () => {
    const pending: Array<string | null> = [];
    const coordinator = new LocationTransitionCoordinator({
      getSessionId: () => SESSION_A,
      rotateSession: async () => null,
      reconcile: async () => ({ currentSpaceId: null, locationVersion: 1 }),
      fetcher: vi.fn(async () => success(null, 1)) as unknown as typeof fetch,
      randomUUID: () => crypto.randomUUID(),
      onPendingTargetChange: (spaceId) => pending.push(spaceId),
    });

    expect((await coordinator.transition({ spaceId: null, reason: 'manual-leave' })).ok).toBe(true);
    expect(pending.at(-1)).toBeNull();
  });

  it('keeps a Knock intent reserved until released or consumed by knock-enter', async () => {
    const pending: boolean[] = [];
    const coordinator = new LocationTransitionCoordinator({
      getSessionId: () => SESSION_A,
      rotateSession: async () => null,
      reconcile: async () => ({ currentSpaceId: SPACE_A, locationVersion: 1 }),
      fetcher: vi.fn(async () => success(SPACE_A, 1)) as unknown as typeof fetch,
      randomUUID: () => crypto.randomUUID(),
      onPendingChange: (isPending) => pending.push(isPending),
    });

    const generation = coordinator.beginManualIntent();
    expect(pending.at(-1)).toBe(true);
    coordinator.releaseManualIntent(generation);
    expect(pending.at(-1)).toBe(false);

    const nextGeneration = coordinator.beginManualIntent();
    const transition = coordinator.transition({
      spaceId: SPACE_A,
      reason: 'knock-enter',
      knockRequestId: '99999999-9999-4999-8999-999999999999',
      expectedLocationVersion: 0,
      intentGeneration: nextGeneration,
    });
    expect((await transition).ok).toBe(true);
    expect(pending.at(-1)).toBe(false);
  });
});
