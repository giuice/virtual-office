import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });

const baseURL = 'http://127.0.0.1:3000';
const roles = [
  { email: process.env.AUTH_E2E_EMAIL, password: process.env.AUTH_E2E_PASSWORD },
  { email: process.env.AUTH_E2E_MEMBER_EMAIL, password: process.env.AUTH_E2E_MEMBER_PASSWORD },
];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || roles.some(({ email, password }) => !email || !password)) {
  throw new Error('Missing configured diagnostic authentication inputs.');
}
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

function sessionCookies(session) {
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => encoded.slice(index * 3180, (index + 1) * 3180));
  return chunks.map((value, index) => ({
    name: chunks.length === 1 ? authStorageKey : `${authStorageKey}.${index}`,
    value,
    url: baseURL,
    sameSite: 'Lax',
  }));
}

function timeout(label, promise, milliseconds = 20_000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms.`)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function instrument(context) {
  await context.addInitScript(() => {
    const events = [];
    const record = (event) => events.push(event);
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const request = args[0];
      const requestUrl = typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;
      const route = new URL(requestUrl, location.origin).pathname.match(/\/screen-share\/(active|claim|renew|release|signal)$/)?.[1];
      if (route) {
        let state = 'unknown';
        try {
          const body = await response.clone().json();
          state = body.active === null ? 'null' : body.active || body.share ? 'share' : body.code ?? 'unknown';
        } catch {
          state = 'unreadable';
        }
        record({ type: 'route', route, status: response.status, state });
      }
      return response;
    };
    const nativeSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(data) {
      if (typeof data === 'string' && data.includes('company:') && data.includes('media:v2')) {
        record({ type: 'realtime', event: 'media-channel-send' });
      }
      return nativeSend.call(this, data);
    };
    const NativePeerConnection = window.RTCPeerConnection;
    class TracedPeerConnection extends NativePeerConnection {
      constructor(configuration) {
        super(configuration);
        record({ type: 'peer', event: 'created' });
        this.addEventListener('connectionstatechange', () => record({ type: 'peer', event: this.connectionState }));
        this.addEventListener('track', (event) => record({ type: 'track', kind: event.track.kind, state: event.track.readyState }));
      }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: TracedPeerConnection });
    const mediaDevices = navigator.mediaDevices;
    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const stream = canvas.captureStream(5);
        record({ type: 'capture', event: 'video-only-live', trackCount: stream.getVideoTracks().length });
        return stream;
      },
    });
    window.__screenShareDiagnostic = () => events;
  });
}

async function signIn(role) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await timeout('direct diagnostic sign-in', client.auth.signInWithPassword(role));
  if (error || !data.session) throw new Error('Direct diagnostic sign-in failed.');
  return { client, session: data.session };
}

function observePage(page, diagnostic) {
  page.on('pageerror', () => { diagnostic.pageErrors += 1; });
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostic.consoleErrors += 1;
  });
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).hostname.endsWith('.supabase.co')) diagnostic.supabaseRequestFailures += 1;
  });
}

async function openAuthenticated(page, diagnostic) {
  await timeout('floor plan navigation', page.goto(`${baseURL}/floor-plan`));
  try {
    await timeout('floor plan cards', page.locator('[data-testid^="space-"]').first().waitFor({ state: 'visible' }));
  } catch (error) {
    diagnostic.page = await page.evaluate(() => ({
      path: location.pathname,
      hasRestoringSession: document.body.innerText.includes('Restaurando sessão'),
      hasLoginInput: Boolean(document.querySelector('#email')),
      hasFloorPlanCard: Boolean(document.querySelector('[data-testid^="space-"]')),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}; page=${JSON.stringify(diagnostic)}`);
  }
}

async function chooseSpace(page, email) {
  return timeout('same-company public space lookup', page.evaluate(async (address) => {
    const users = await (await fetch('/api/users/list')).json();
    const user = users.users.find((candidate) => candidate.email.toLowerCase() === address.toLowerCase());
    if (!user?.companyId) throw new Error('No company-bound diagnostic account.');
    const spaces = await (await fetch(`/api/spaces?companyId=${encodeURIComponent(user.companyId)}`)).json();
    const selected = spaces.spaces.find((space) => space.accessControl?.isPublic !== false && space.capacity >= 2);
    if (!selected) throw new Error('No public diagnostic space has capacity for two users.');
    return selected.id;
  }, email));
}

async function enter(page, spaceId) {
  const card = page.locator(`[data-testid="space-${spaceId}"]`);
  if (await card.getAttribute('data-user-in-space') === 'true') return;
  await timeout('enter space', card.getByRole('button', { name: 'Enter' }).click());
  await timeout('occupancy confirmation', page.waitForFunction((id) => {
    return document.querySelector(`[data-testid="space-${id}"]`)?.getAttribute('data-user-in-space') === 'true';
  }, spaceId));
}

async function runDirection(presenterChannel, viewerChannel, presenterAuth, viewerAuth) {
  const presenterBrowser = await timeout(`${presenterChannel} launch`, chromium.launch({ channel: presenterChannel, headless: true }));
  const viewerBrowser = await timeout(`${viewerChannel} launch`, chromium.launch({ channel: viewerChannel, headless: true }));
  const presenterContext = await presenterBrowser.newContext();
  const viewerContext = await viewerBrowser.newContext();
  try {
    await Promise.all([
      instrument(presenterContext),
      instrument(viewerContext),
    ]);
    await Promise.all([
      presenterContext.addCookies(sessionCookies(presenterAuth.session)),
      viewerContext.addCookies(sessionCookies(viewerAuth.session)),
    ]);
    const presenter = await presenterContext.newPage();
    const viewer = await viewerContext.newPage();
    const presenterDiagnostic = { pageErrors: 0, consoleErrors: 0, supabaseRequestFailures: 0 };
    const viewerDiagnostic = { pageErrors: 0, consoleErrors: 0, supabaseRequestFailures: 0 };
    observePage(presenter, presenterDiagnostic);
    observePage(viewer, viewerDiagnostic);
    await Promise.all([openAuthenticated(presenter, presenterDiagnostic), openAuthenticated(viewer, viewerDiagnostic)]);
    const [presenterSpace, viewerSpace] = await Promise.all([
      chooseSpace(presenter, roles[0].email),
      chooseSpace(viewer, roles[1].email),
    ]);
    if (presenterSpace !== viewerSpace) throw new Error('Configured accounts do not share a diagnostic room.');
    await Promise.all([enter(presenter, presenterSpace), enter(viewer, viewerSpace)]);
    await timeout('share click', presenter.getByRole('button', { name: 'Share screen' }).first().click());
    const localStage = await presenter.getByTestId('floor-plan-presentation-stage').isVisible({ timeout: 5_000 });
    const viewerStage = await viewer.getByTestId('floor-plan-presentation-stage').isVisible({ timeout: 5_000 });
    const localTrack = await presenter.evaluate(() => {
      const video = document.querySelector('[data-testid="floor-plan-presentation-video"]');
      return video?.srcObject instanceof MediaStream && video.srcObject.getVideoTracks().some((track) => track.readyState === 'live');
    });
    const viewerTrack = await viewer.evaluate(() => {
      const video = document.querySelector('[data-testid="floor-plan-presentation-video"]');
      return video?.srcObject instanceof MediaStream && video.srcObject.getVideoTracks().some((track) => track.readyState === 'live');
    });
    if (localStage) await timeout('share stop', presenter.getByRole('button', { name: 'Stop sharing' }).first().click());
    return {
      direction: `${presenterChannel}-presenter-to-${viewerChannel}-viewer`,
      localStage,
      viewerStage,
      localTrack,
      viewerTrack,
      presenterEvents: await presenter.evaluate(() => window.__screenShareDiagnostic()),
      viewerEvents: await viewer.evaluate(() => window.__screenShareDiagnostic()),
      presenterDiagnostic,
      viewerDiagnostic,
    };
  } finally {
    await Promise.allSettled([
      presenterContext.close(), viewerContext.close(), presenterBrowser.close(), viewerBrowser.close(),
    ]);
  }
}

const output = [];
const [presenterAuth, viewerAuth] = await Promise.all(roles.map(signIn));
try {
  for (const [presenterChannel, viewerChannel] of [['chrome', 'msedge'], ['msedge', 'chrome']]) {
    try {
      output.push(await runDirection(presenterChannel, viewerChannel, presenterAuth, viewerAuth));
    } catch (error) {
      output.push({ direction: `${presenterChannel}-presenter-to-${viewerChannel}-viewer`, error: error instanceof Error ? error.message : String(error) });
    }
  }
} finally {
  await Promise.allSettled([presenterAuth.client.auth.signOut(), viewerAuth.client.auth.signOut()]);
}
console.log(JSON.stringify(output));
