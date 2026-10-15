// Test-side client of the meeting-notes fake AI server's `/__control/*` API
// (T16, test-only). Usable from Vitest tests and Playwright specs/fixtures.
import {
  meetingNotesFakeAiBaseUrl,
  type FakeAiOutcome,
  type FakeAiProvider,
  type FakeAiRecordedRequest,
  type FakeAiRequestsResponse,
  type FakeAiStateResponse,
} from './config';

const POLL_INTERVAL_MS = 25;

export class MeetingNotesFakeAiControl {
  constructor(readonly baseUrl: string = meetingNotesFakeAiBaseUrl()) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Fake AI control ${method} ${path} → ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  }

  health(): Promise<{ ok: boolean }> {
    return this.call('GET', '/__control/health');
  }

  /** Appends outcomes to the provider's FIFO queue (one per incoming request). */
  async script(provider: FakeAiProvider, ...outcomes: FakeAiOutcome[]): Promise<void> {
    await this.call('POST', '/__control/script', { provider, outcomes });
  }

  /** Outcome used whenever the provider's queue is empty; null removes it. */
  async setDefault(provider: FakeAiProvider, outcome: FakeAiOutcome | null): Promise<void> {
    await this.call('POST', '/__control/default', { provider, outcome });
  }

  /** Delivers held `pause` requests (all providers when omitted). Returns how many were released. */
  async release(provider?: FakeAiProvider): Promise<number> {
    const result = await this.call<{ released: number }>('POST', '/__control/release', provider ? { provider } : {});
    return result.released;
  }

  /** Clears scripts, defaults, and records; destroys held (timeout/paused) sockets. */
  async reset(): Promise<void> {
    await this.call('POST', '/__control/reset', {});
  }

  requests(provider?: FakeAiProvider): Promise<FakeAiRequestsResponse> {
    return this.call('GET', `/__control/requests${provider ? `?provider=${provider}` : ''}`);
  }

  async received(provider: FakeAiProvider): Promise<number> {
    return (await this.requests()).received[provider];
  }

  /** The provider's most recent recorded request, or null. */
  async lastRequest(provider: FakeAiProvider): Promise<FakeAiRecordedRequest | null> {
    const { requests } = await this.requests(provider);
    return requests.at(-1) ?? null;
  }

  state(): Promise<FakeAiStateResponse> {
    return this.call('GET', '/__control/state');
  }

  /** Waits until at least `count` requests of the provider are held (paused or timeout). */
  async waitForHeld(
    provider: FakeAiProvider,
    kind: 'paused' | 'timeout' = 'paused',
    count = 1,
    timeoutMs = 10_000
  ): Promise<void> {
    await this.poll(async () => (await this.state()).held[kind][provider] >= count, `${count} ${kind} ${provider} request(s)`, timeoutMs);
  }

  /** Waits until the provider has received at least `count` requests. */
  async waitForReceived(provider: FakeAiProvider, count = 1, timeoutMs = 10_000): Promise<void> {
    await this.poll(async () => (await this.received(provider)) >= count, `${count} received ${provider} request(s)`, timeoutMs);
  }

  private async poll(check: () => Promise<boolean>, what: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(`Fake AI server: timed out after ${timeoutMs} ms waiting for ${what}.`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}
