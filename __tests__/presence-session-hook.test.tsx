import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { usePresenceSession } from '@/hooks/usePresenceSession';
import { invalidatePresenceClientLifecycle } from '@/lib/presence/client-lifecycle';

const HEARTBEAT_INTERVAL_MS = 30_000;

type FetchMock = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface HookWrapperResult {
  queryClient: QueryClient;
  wrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createResponse(status: number, body: Record<string, unknown> = {}): Response {
  const responseBody =
    status >= 200 &&
    status < 300 &&
    typeof body.sessionId === 'string' &&
    body.companyId === undefined
      ? { ...body, companyId: 'company-1' }
      : body;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(responseBody),
  } as unknown as Response;
}

function createWrapper(strict = false): HookWrapperResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => {
    const content = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return strict ? <React.StrictMode>{content}</React.StrictMode> : content;
  };

  return { queryClient, wrapper };
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getFetchMock(): FetchMock {
  return global.fetch as unknown as FetchMock;
}

function getFetchCall(index: number): [string, RequestInit | undefined] {
  const call = getFetchMock().mock.calls[index];
  return [String(call[0]), call[1]];
}

function queueFetchResponses(...responses: Response[]): void {
  const fetchMock = getFetchMock();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

describe('usePresenceSession', () => {
  const sendBeaconMock = vi.fn<(url: string, data?: BodyInit) => boolean>();
  const randomUUIDMock = vi.fn<() => `${string}-${string}-${string}-${string}-${string}`>();
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setDocumentVisibility('visible');

    global.fetch = vi.fn() as unknown as typeof fetch;
    randomUUIDMock.mockReset();
    randomUUIDMock
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValue('00000000-0000-4000-8000-000000000003');

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: randomUUIDMock },
    });

    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: sendBeaconMock,
    });
    sendBeaconMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not register until both app user and company scope are known', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => usePresenceSession('user-1', null),
      { wrapper },
    );
    await flushAsync();

    expect(result.current).toMatchObject({ sessionId: null, status: 'idle' });
    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'NO_COMPANY'],
    [409, 'PRESENCE_COMPANY_SCOPE_CHANGED'],
  ])('stops registration retries for terminal membership response %s/%s', async (status, code) => {
    queueFetchResponses(createResponse(status, { code }));
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => usePresenceSession('user-1', 'company-1'),
      { wrapper },
    );
    await flushAsync();
    await advanceTimers(120_000);

    expect(result.current).toMatchObject({ sessionId: null, status: 'idle' });
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does not heartbeat before registration succeeds', async () => {
    const deferredRegister = createDeferred<Response>();
    getFetchMock().mockReturnValueOnce(deferredRegister.promise);
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    deferredRegister.resolve(createResponse(200, { sessionId: 'session-1' }));
    await flushAsync();

    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(getFetchCall(1)[0]).toBe('/api/presence/sessions/session-1/heartbeat');
  });

  it('heartbeats every 30 seconds after a successful register', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200),
      createResponse(200)
    );
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();

    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    await advanceTimers(HEARTBEAT_INTERVAL_MS);

    expect(getFetchMock()).toHaveBeenCalledTimes(3);
    expect(getFetchCall(1)).toEqual(['/api/presence/sessions/session-1/heartbeat', { method: 'POST' }]);
    expect(getFetchCall(2)).toEqual(['/api/presence/sessions/session-1/heartbeat', { method: 'POST' }]);
  });

  it('rotates once when heartbeat returns SESSION_RETIRED', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(409, { code: 'SESSION_RETIRED' }),
      createResponse(200, { sessionId: 'session-2' })
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    await flushAsync();

    expect(result.current.sessionId).toBe('session-2');
    expect(getFetchMock()).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(getFetchCall(0)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000001',
      expectedCompanyId: 'company-1',
    });
    expect(JSON.parse(String(getFetchCall(2)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000002',
      expectedCompanyId: 'company-1',
    });
  });

  it('stops the lease lifecycle when heartbeat reports an auth-session fence', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(401, { code: 'AUTH_SESSION_REVOKED' }),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => usePresenceSession('user-1', 'company-1'),
      { wrapper },
    );
    await flushAsync();
    expect(result.current.sessionId).toBe('session-1');

    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    expect(result.current).toMatchObject({ sessionId: null, status: 'idle' });

    await advanceTimers(HEARTBEAT_INTERVAL_MS * 2);
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it('stops the old company lease when membership scope is invalidated', async () => {
    queueFetchResponses(createResponse(200, { sessionId: 'session-1' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePresenceSession('user-1', 'company-1'),
      { wrapper },
    );
    await flushAsync();
    expect(result.current.sessionId).toBe('session-1');

    await act(async () => {
      invalidatePresenceClientLifecycle({
        reason: 'membership-scope-invalidated',
        userId: 'user-1',
        companyId: 'company-1',
      });
    });

    expect(result.current).toMatchObject({ sessionId: null, status: 'idle' });
    await advanceTimers(HEARTBEAT_INTERVAL_MS * 2);
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('supports one controlled rotation and resolves the replacement session', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200, { sessionId: 'session-2' })
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();

    let replacement: string | null = null;
    await act(async () => {
      replacement = await result.current.rotateSession();
    });

    expect(replacement).toBe('session-2');
    expect(result.current).toMatchObject({ sessionId: 'session-2', status: 'registered' });
    expect(JSON.parse(String(getFetchCall(1)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000002',
      expectedCompanyId: 'company-1',
    });
  });

  it('ignores a retired heartbeat from the session replaced by controlled rotation', async () => {
    const staleHeartbeat = createDeferred<Response>();
    getFetchMock()
      .mockResolvedValueOnce(createResponse(200, { sessionId: 'session-1' }))
      .mockReturnValueOnce(staleHeartbeat.promise)
      .mockResolvedValueOnce(createResponse(200, { sessionId: 'session-2' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS);

    await act(async () => {
      await result.current.rotateSession();
    });
    expect(result.current.sessionId).toBe('session-2');

    getFetchMock().mockResolvedValueOnce(createResponse(200));
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    expect(getFetchCall(3)[0]).toBe('/api/presence/sessions/session-2/heartbeat');

    staleHeartbeat.resolve(createResponse(409, { code: 'SESSION_RETIRED' }));
    await flushAsync();

    expect(result.current.sessionId).toBe('session-2');
    expect(getFetchMock()).toHaveBeenCalledTimes(4);
  });

  it('ignores an older registration response after a controlled rotation wins', async () => {
    const staleRegister = createDeferred<Response>();
    getFetchMock()
      .mockReturnValueOnce(staleRegister.promise)
      .mockResolvedValueOnce(createResponse(200, { sessionId: 'session-2' }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });

    await act(async () => {
      await result.current.rotateSession();
    });
    expect(result.current.sessionId).toBe('session-2');

    staleRegister.resolve(createResponse(200, { sessionId: 'session-1' }));
    await flushAsync();

    expect(result.current.sessionId).toBe('session-2');
  });

  it('rotates registration when company changes for the same app user', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200, { sessionId: 'session-2', companyId: 'company-2' })
    );
    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ companyId }) => usePresenceSession('user-1', companyId),
      { initialProps: { companyId: 'company-1' }, wrapper }
    );
    await flushAsync();

    rerender({ companyId: 'company-2' });
    await flushAsync();

    expect(result.current.sessionId).toBe('session-2');
    expect(JSON.parse(String(getFetchCall(1)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000002',
      expectedCompanyId: 'company-2',
    });
  });

  it('stops the rotation cycle after a second SESSION_RETIRED', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(409, { code: 'SESSION_RETIRED' }),
      createResponse(409, { code: 'SESSION_RETIRED' })
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS * 2);

    expect(result.current.sessionId).toBeNull();
    expect(getFetchMock()).toHaveBeenCalledTimes(3);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[PresenceSession] Session registration retired twice; stopping rotation cycle.'
    );
  });

  it('does not create a rotation loop under Strict Mode double mount', async () => {
    const deferredRegister = createDeferred<Response>();
    getFetchMock().mockReturnValueOnce(deferredRegister.promise);
    const { wrapper } = createWrapper(true);

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    deferredRegister.resolve(createResponse(200, { sessionId: 'session-1' }));
    await flushAsync();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
  });

  it('sends a pagehide disconnect beacon for the current session', async () => {
    queueFetchResponses(createResponse(200, { sessionId: 'session-1' }));
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();

    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconMock).toHaveBeenCalledWith('/api/presence/sessions/session-1/disconnect', '{}');
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('falls back to keepalive fetch when sendBeacon returns false', async () => {
    sendBeaconMock.mockReturnValue(false);
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200)
    );
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();

    window.dispatchEvent(new Event('beforeunload'));
    await flushAsync();

    expect(getFetchCall(1)).toEqual([
      '/api/presence/sessions/session-1/disconnect',
      { method: 'POST', keepalive: true },
    ]);
  });

  it('heartbeats immediately and invalidates presence on visible visibilitychange', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200)
    );
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => usePresenceSession('user-1', 'company-1'), { wrapper });
    await flushAsync();

    setDocumentVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsync();

    expect(getFetchCall(1)).toEqual(['/api/presence/sessions/session-1/heartbeat', { method: 'POST' }]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['presence', 'company-1', 'user-1', 'snapshot'],
    });
  });

  it('retires the active lease once when route eligibility removes the identity scope', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200)
    );
    const { wrapper } = createWrapper();
    const initialProps: { userId: string | null } = { userId: 'user-1' };

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        usePresenceSession(userId, userId ? 'company-1' : null),
      { initialProps, wrapper }
    );
    await flushAsync();

    expect(result.current.sessionId).toBe('session-1');

    rerender({ userId: null });
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    window.dispatchEvent(new Event('pagehide'));

    expect(result.current.sessionId).toBeNull();
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(sendBeaconMock).toHaveBeenCalledWith(
      '/api/presence/sessions/session-1/disconnect',
      '{}',
    );
  });

  it('retires a successful registration that resolves after identity scope cleanup', async () => {
    const deferredRegister = createDeferred<Response>();
    getFetchMock().mockReturnValueOnce(deferredRegister.promise);
    const { wrapper } = createWrapper();
    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        usePresenceSession(userId, userId ? 'company-1' : null),
      { initialProps: { userId: 'user-1' as string | null }, wrapper },
    );

    rerender({ userId: null });
    deferredRegister.resolve(createResponse(200, { sessionId: 'stale-session' }));
    await flushAsync();

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    expect(sendBeaconMock).toHaveBeenCalledWith(
      '/api/presence/sessions/stale-session/disconnect',
      '{}',
    );
  });
});
