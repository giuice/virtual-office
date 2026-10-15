import { expect, type BrowserContext, type Locator, type Page, type WebSocketRoute } from '@playwright/test';

import type { FakeAiOutcome } from '../../../meeting-notes-ai-fake/config';
import { MeetingNotesFakeAiControl } from '../../../meeting-notes-ai-fake/control-client';
import type { MeetingNotesE2EWorld } from './meeting-notes-e2e';

/**
 * Phase 6 T13 AI-flow E2E helpers. The only replaced dependency is the
 * external AI provider: the fake AI server (T16), started by the runner's
 * global setup, answers as OpenAI (Chat Completions) on its fixed loopback
 * URL; each spec scripts its outcomes through the control client. Company A's
 * AI settings are written through the REAL settings route as the admin, with
 * a canary key only, and reset (trusted SQL) before and after each spec so the
 * shared seed company never keeps a key. The Next server's ticket secret is a
 * per-run, test-only value set by playwright.meeting-notes.config.ts.
 */
export const fakeAi = new MeetingNotesFakeAiControl();

export const E2E_AI_PROVIDER = 'openai' as const;
export const E2E_AI_PROVIDER_LABEL = 'OpenAI';
export const E2E_AI_MODEL = 'gpt-6.1-sol';
export const E2E_AI_MODEL_LABEL = 'GPT-6.1 Sol';

/** The model output the fake returns (validated by the app against its draft schema). */
export interface FakeModelDraft {
  summary: { keyPoints: string[]; decisions: string[]; nextSteps: string[] };
  actionItems: Array<{ description: string; assigneeName: string | null }>;
}

export function successOutcome(draft: FakeModelDraft): FakeAiOutcome {
  return { kind: 'success', draft, usage: { inputTokens: 900, outputTokens: 200 } };
}

/**
 * Configures company A's AI as OpenAI GPT-6.1 Sol through PUT
 * /api/companies/ai-settings as the admin page (canary key). The default
 * daily limit is the maximum, so usage left by earlier specs of the same
 * day never blocks a spec that does not test the limit.
 */
export async function configureFakeOpenAi(
  admin: Page,
  world: MeetingNotesE2EWorld,
  options: { dailyLimit?: number } = {},
): Promise<void> {
  await world.resetAiSettingsUnsafe();
  const response = await admin.request.put('/api/companies/ai-settings', {
    data: {
      expectedRevision: null,
      provider: E2E_AI_PROVIDER,
      model: E2E_AI_MODEL,
      reasoningLevel: 'low',
      dailyLimit: options.dailyLimit ?? 200,
      apiKey: `mn-e2e-canary-${world.runTag}-K4p8`,
    },
  });
  expect(response.status(), `configure AI: ${await response.text()}`).toBe(200);
}

/** Changes only the daily limit (keeps the stored key) as the admin. */
export async function setAiDailyLimit(admin: Page, dailyLimit: number): Promise<void> {
  const current = await admin.request.get('/api/companies/ai-settings');
  expect(current.status()).toBe(200);
  const { settings } = (await current.json()) as {
    settings: { revision: number; provider: string; model: string; reasoningLevel: string };
  };
  const response = await admin.request.put('/api/companies/ai-settings', {
    data: {
      expectedRevision: settings.revision,
      provider: settings.provider,
      model: settings.model,
      reasoningLevel: settings.reasoningLevel,
      dailyLimit,
      apiKey: null,
    },
  });
  expect(response.status(), `set daily limit: ${await response.text()}`).toBe(200);
}

export interface AiUsageSnapshot {
  used: number;
  limit: number;
  resetAt: string;
}

/** Today's company usage, read through the ticket route as an editor of `noteId` (reserves nothing). */
export async function readAiUsage(page: Page, noteId: string): Promise<AiUsageSnapshot> {
  const response = await page.request.post(`/api/meeting-notes/${noteId}/ai/ticket`);
  expect(response.status(), `read AI usage: ${await response.text()}`).toBe(200);
  const { usage } = (await response.json()) as { usage: AiUsageSnapshot };
  return usage;
}

/** One complete processing through the real routes (ticket + process) as the page's user; returns the HTTP status. */
export async function processThroughApi(page: Page, noteId: string): Promise<number> {
  const ticketResponse = await page.request.post(`/api/meeting-notes/${noteId}/ai/ticket`);
  expect(ticketResponse.status(), `ticket: ${await ticketResponse.text()}`).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const response = await page.request.post(`/api/meeting-notes/${noteId}/ai/process`, { data: { ticket } });
  return response.status();
}

/** A transcript file for a file chooser. */
export function transcriptFile(name: string, text: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') };
}

/** Clicks a picker button and chooses `file` in the file chooser it opens. */
export async function chooseTranscriptFile(
  page: Page,
  button: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent('filechooser', { timeout: 15_000 });
  await button.click();
  await (await chooser).setFiles(file);
}

/** The note view's AI section (editors only). */
export function aiSection(page: Page): Locator {
  return page.getByTestId('meeting-note-ai-section');
}

/** Clicks "Generate summary" / "Reprocess transcript" (or "Try again") and waits for the provider notice. */
export async function openAiNotice(page: Page, trigger?: Locator): Promise<Locator> {
  await (trigger ?? page.getByTestId('meeting-note-ai-start')).click();
  const notice = page.getByTestId('meeting-note-ai-notice');
  await expect(notice).toBeVisible({ timeout: 30_000 });
  return notice;
}

/** Clicks "Process" and waits for the review of the draft. */
export async function processToReview(page: Page): Promise<Locator> {
  await page.getByTestId('meeting-note-ai-process').click();
  const review = page.getByTestId('meeting-note-ai-review');
  await expect(review).toBeVisible({ timeout: 90_000 });
  return review;
}

/** The suggestions of the review, in draft order. */
export function suggestions(page: Page): Locator {
  return page.getByTestId('meeting-note-ai-review').getByTestId('meeting-note-ai-suggestion');
}

const DRAFT_MONITOR_BINDING = '__mnE2eDraftMonitorReport';
const DRAFT_MONITOR_FLAG = '__mnE2eDraftMonitorActive';

/** Whether a draft review was EVER rendered in a page, across full-page navigations (AC-033). */
export interface DraftReviewMonitor {
  /** True once any document of `page` rendered a draft review since the monitor was installed. */
  wasSeen(page: Page): boolean;
  /**
   * Asserts the monitor runs in `page`'s current document and has reported
   * from every document the page loaded (none was left unobserved).
   */
  expectActive(page: Page): Promise<void>;
}

/**
 * Installs the draft-review monitor in EVERY document of `context`
 * (addInitScript) before any app script runs; each document reports its
 * activation and any rendered review to the test process through an exposed
 * binding, so an observation survives the navigation that destroys the
 * document. Install it before the context opens its pages.
 */
export async function installDraftReviewMonitor(context: BrowserContext): Promise<DraftReviewMonitor> {
  const seen = new Set<Page>();
  const activations = new Map<Page, number>();
  const documents = new Map<Page, number>();
  const track = (page: Page) => {
    if (documents.has(page)) return;
    documents.set(page, 0);
    // App documents only (the monitor skips about:blank and other non-http documents).
    page.on('domcontentloaded', () => {
      if (/^https?:/.test(page.url())) documents.set(page, (documents.get(page) ?? 0) + 1);
    });
  };
  context.pages().forEach(track);
  context.on('page', track);

  await context.exposeBinding(DRAFT_MONITOR_BINDING, ({ page, frame }, event: unknown) => {
    if (frame !== page.mainFrame()) return;
    if (event === 'active') activations.set(page, (activations.get(page) ?? 0) + 1);
    if (event === 'seen') seen.add(page);
  });
  await context.addInitScript(
    ({ binding, flag }) => {
      if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
      const scope = window as unknown as Record<string, unknown>;
      // The binding is installed with the document; retry briefly if a report races it.
      const report = (event: 'active' | 'seen', attempt = 0): void => {
        const send = scope[binding];
        if (typeof send === 'function') {
          void (send as (value: string) => Promise<void>)(event);
        } else if (attempt < 200) {
          setTimeout(() => report(event, attempt + 1), 10);
        }
      };
      let reported = false;
      const check = () => {
        if (!reported && document.querySelector('[data-testid="meeting-note-ai-review"]')) {
          reported = true;
          report('seen');
        }
      };
      // Observing the document itself works before <html> exists.
      new MutationObserver(check).observe(document, { subtree: true, childList: true });
      scope[flag] = true;
      report('active');
      check();
    },
    { binding: DRAFT_MONITOR_BINDING, flag: DRAFT_MONITOR_FLAG },
  );

  return {
    wasSeen: (page) => seen.has(page),
    async expectActive(page) {
      track(page);
      expect(
        await page.evaluate((flag) => (window as unknown as Record<string, unknown>)[flag] === true, DRAFT_MONITOR_FLAG),
        'the draft monitor runs in the current document',
      ).toBe(true);
      await expect
        .poll(() => (activations.get(page) ?? 0) >= (documents.get(page) ?? 0), {
          message: 'every loaded document reported an active draft monitor',
          timeout: 10_000,
        })
        .toBe(true);
    },
  };
}

/** Holds the Realtime frames the server sends to a context's pages until released. */
export interface RealtimeInboundHold {
  /** From now on, server → page Realtime frames are queued. */
  hold(): void;
  /** Delivers the queued frames in order and stops holding. */
  release(): void;
}

/**
 * Routes every Realtime WebSocket of `context` through the test (the local
 * Realtime server stays the transport): frames pass through unchanged until
 * `hold()`, e.g. to keep a membership-change event from reaching the browser
 * while a response in transit is delivered. Install before the pages connect.
 */
export async function routeRealtimeInbound(context: BrowserContext): Promise<RealtimeInboundHold> {
  let holding = false;
  const queued: Array<{ socket: WebSocketRoute; frame: string | Buffer }> = [];
  await context.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((frame) => {
      if (holding) {
        queued.push({ socket, frame });
        return;
      }
      socket.send(frame);
    });
  });
  return {
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      for (const { socket, frame } of queued.splice(0)) {
        try {
          socket.send(frame);
        } catch {
          // The page closed that socket meanwhile.
        }
      }
    },
  };
}

/** GET /api/meeting-notes/[id]?include=transcript as the page's user: the stored transcript text. */
export async function readStoredTranscript(page: Page, noteId: string): Promise<string | null> {
  const response = await page.request.get(`/api/meeting-notes/${noteId}?include=transcript`);
  expect(response.status()).toBe(200);
  const { note } = (await response.json()) as { note: { transcript?: string | null } };
  return note.transcript ?? null;
}
