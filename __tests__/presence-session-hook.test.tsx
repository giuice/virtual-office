import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { usePresenceSession } from '@/hooks/usePresenceSession';

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
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
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
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setDocumentVisibility('visible');

    global.fetch = vi.fn() as unknown as typeof fetch;
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

  it('does not heartbeat before registration succeeds', async () => {
    const deferredRegister = createDeferred<Response>();
    getFetchMock().mockReturnValueOnce(deferredRegister.promise);
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1'), { wrapper });

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

    renderHook(() => usePresenceSession('user-1'), { wrapper });
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

    const { result } = renderHook(() => usePresenceSession('user-1'), { wrapper });
    await flushAsync();
    await advanceTimers(HEARTBEAT_INTERVAL_MS);
    await flushAsync();

    expect(result.current.sessionId).toBe('session-2');
    expect(getFetchMock()).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(getFetchCall(0)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000001',
    });
    expect(JSON.parse(String(getFetchCall(2)[1]?.body))).toEqual({
      registrationId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('stops the rotation cycle after a second SESSION_RETIRED', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(409, { code: 'SESSION_RETIRED' }),
      createResponse(409, { code: 'SESSION_RETIRED' })
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePresenceSession('user-1'), { wrapper });
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

    renderHook(() => usePresenceSession('user-1'), { wrapper });

    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    deferredRegister.resolve(createResponse(200, { sessionId: 'session-1' }));
    await flushAsync();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
  });

  it('sends a pagehide disconnect beacon for the current session', async () => {
    queueFetchResponses(createResponse(200, { sessionId: 'session-1' }));
    const { wrapper } = createWrapper();

    renderHook(() => usePresenceSession('user-1'), { wrapper });
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

    renderHook(() => usePresenceSession('user-1'), { wrapper });
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

    renderHook(() => usePresenceSession('user-1'), { wrapper });
    await flushAsync();

    setDocumentVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsync();

    expect(getFetchCall(1)).toEqual(['/api/presence/sessions/session-1/heartbeat', { method: 'POST' }]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-presence'] });
  });

  it('cleans up interval and listeners when userId becomes null without disconnecting', async () => {
    queueFetchResponses(
      createResponse(200, { sessionId: 'session-1' }),
      createResponse(200)
    );
    const { wrapper } = createWrapper();
    const initialProps: { userId: string | null } = { userId: 'user-1' };

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => usePresenceSession(userId),
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
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });
});
