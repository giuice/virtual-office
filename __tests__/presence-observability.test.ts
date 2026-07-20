import { describe, expect, it, vi } from 'vitest';
import {
  emitPresenceEvent,
  formatPresenceEvent,
  toSafePresenceLogEntry,
  type PresenceObservabilityEvent,
} from '@/lib/presence/observability';

const IDS = {
  correlation: '00000000-0000-4000-8000-000000000001',
  transition: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003',
  session: '00000000-0000-4000-8000-000000000004',
  space: '00000000-0000-4000-8000-000000000005',
  request: '00000000-0000-4000-8000-000000000006',
  responder: '00000000-0000-4000-8000-000000000007',
} as const;

describe('Presence observability formatter', () => {
  it('emits a deterministic one-line allowlisted location event', () => {
    const line = formatPresenceEvent({
      category: 'location',
      action: 'transition',
      resultCode: 'LOCATION_UPDATED',
      occurredAt: '2026-07-19T12:34:56.000Z',
      correlationId: IDS.correlation,
      transitionId: IDS.transition,
      appUserId: IDS.user,
      presenceSessionId: IDS.session,
      reason: 'manual-enter',
      targetSpaceId: IDS.space,
      durationMs: 17,
      expectedLocationVersion: 3,
      previousLocationVersion: 3,
      resultLocationVersion: 4,
      idempotentReplay: false,
      authorizationMode: 'public',
    });

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      schema: 'presence-observability-v1',
      occurredAt: '2026-07-19T12:34:56.000Z',
      category: 'location',
      action: 'transition',
      resultCode: 'LOCATION_UPDATED',
      reason: 'manual-enter',
      authorizationMode: 'public',
      correlationId: IDS.correlation,
      transitionId: IDS.transition,
      appUserId: IDS.user,
      presenceSessionId: IDS.session,
      targetSpaceId: IDS.space,
      durationMs: 17,
      expectedLocationVersion: 3,
      previousLocationVersion: 3,
      resultLocationVersion: 4,
      idempotentReplay: false,
    });
  });

  it('allowlists the complete session and Knock evidence fields', () => {
    const sessionEntry = toSafePresenceLogEntry({
      category: 'session',
      action: 'heartbeat',
      resultCode: 'SESSION_HEARTBEAT',
      occurredAt: '2026-07-19T12:34:56.000Z',
      presenceSessionId: IDS.session,
      appUserId: IDS.user,
      activeSessionCount: 2,
      durationMs: 8,
    });
    expect(sessionEntry).toMatchObject({ activeSessionCount: 2 });

    const knockEntry = toSafePresenceLogEntry({
      category: 'knock',
      action: 'respond',
      resultCode: 'KNOCK_RESPONDED',
      occurredAt: '2026-07-19T12:34:56.000Z',
      requestId: IDS.request,
      requesterUserId: IDS.user,
      responderUserId: IDS.responder,
      spaceId: IDS.space,
      stateTransition: 'approve:approved',
      requesterLocationVersionBefore: 8,
      requesterLocationVersionAfter: 9,
      requesterAccessRevision: 2,
      responderAccessRevision: 4,
      spaceAccessRevision: 3,
      expiryResult: 'usable',
      consumeResult: 'not-consumed',
    });
    expect(knockEntry).toEqual(expect.objectContaining({
      requestId: IDS.request,
      requesterUserId: IDS.user,
      responderUserId: IDS.responder,
      spaceId: IDS.space,
      requesterLocationVersionBefore: 8,
      requesterLocationVersionAfter: 9,
      requesterAccessRevision: 2,
      responderAccessRevision: 4,
      spaceAccessRevision: 3,
      expiryResult: 'usable',
      consumeResult: 'not-consumed',
    }));
  });

  it('drops unknown, malformed, secret, and raw-error fields at runtime', () => {
    const unsafe = {
      category: 'session',
      action: 'register',
      resultCode: 'SESSION_REGISTERED',
      occurredAt: '2026-07-19T00:00:00.000Z',
      correlationId: 'not-a-uuid',
      durationMs: -1,
      access_token: 'eyJ.secret',
      authSessionId: IDS.session,
      email: 'person@example.com',
      displayName: 'Sensitive Name',
      serviceRoleKey: 'service-role-secret',
      error: new Error('database detail'),
    } as unknown as PresenceObservabilityEvent;

    const entry = toSafePresenceLogEntry(unsafe);
    const serialized = JSON.stringify(entry);

    expect(entry).toEqual({
      schema: 'presence-observability-v1',
      occurredAt: '2026-07-19T00:00:00.000Z',
      category: 'session',
      action: 'register',
      resultCode: 'SESSION_REGISTERED',
    });
    expect(serialized).not.toMatch(/eyJ|secret|example\.com|Sensitive|database detail|authSession/i);
  });

  it('uses an injectable sink while suppressing default test-environment noise', () => {
    const sink = vi.fn();
    emitPresenceEvent({
      category: 'knock',
      action: 'respond',
      resultCode: 'KNOCK_DENIED',
      occurredAt: '2026-07-19T00:00:00.000Z',
    }, sink);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0]?.[0]).toContain('presence-observability-v1');
  });

  it('never lets a failing sink enter the product control path', () => {
    expect(() => emitPresenceEvent({
      category: 'realtime',
      action: 'reconcile',
      resultCode: 'RECONCILE_SIGNAL',
      occurredAt: '2026-07-19T00:00:00.000Z',
    }, () => {
      throw new Error('sink unavailable');
    })).not.toThrow();
  });
});
