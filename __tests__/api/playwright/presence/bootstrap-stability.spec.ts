import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  expect,
  test,
  type Browser,
  type Page,
  type Request as PlaywrightRequest,
  type Response,
} from '@playwright/test';
import { resolvePresenceE2EEnvironment } from './local-fixture';

const METRICS_FILE = resolve(
  process.env.VO_AUTH_METRICS_FILE ?? 'test-results/auth-metrics.ndjson'
);
const RATE_LIMIT_PATTERN = /rate[ -]?limit|over_request_rate_limit/i;
const PASSWORD_LABEL = /^(?:Password|Senha)$/i;
const SIGN_IN_BUTTON_NAME = /^(?:Sign In|Entrar)$/i;
// Realtime deliberately performs an unconditional reconciliation 2s after a
// subscription. The phase boundary must include that request; otherwise a
// reload can inherit it from the previous phase and navigation aborts it.
const QUIET_WINDOW_MS = 2_500;
const QUIET_TIMEOUT_MS = 30_000;
const COLD_NAVIGATION_TIMEOUT_MS = 60_000;

const BOOTSTRAP_BUDGETS = [
  { method: 'POST', pathname: '/api/users/sync-profile', count: 1 },
  { method: 'GET', pathname: '/api/companies/get', count: 1 },
  { method: 'GET', pathname: '/api/users/by-company', count: 1 },
  { method: 'GET', pathname: '/api/spaces', count: 1 },
] as const;

const REQUIRED_ROUTE_AUTH_BUDGETS = [
  ...BOOTSTRAP_BUDGETS,
  { method: 'GET', pathname: '/api/conversations/get', count: 1 },
] as const;

const OPTIONAL_ROUTE_AUTH_PATHS = new Set([
  '/api/spaces/details',
]);

// Provisional until WP7's first live capture. These totals include every page
// and asset path so an asset-driven proxy storm cannot hide behind route-only
// assertions. Per-path duplicates still fail immediately; refreshed is <= 1.
const PROXY_BUDGETS = {
  initial: { maxValidations: 3, maxRefreshed: 1, maxFloorPlanValidations: 1 },
  reload: { maxValidations: 2, maxRefreshed: 1, maxFloorPlanValidations: 1 },
  member: { maxValidations: 3, maxRefreshed: 1, maxFloorPlanValidations: 1 },
} as const;

type BootstrapPhaseName = keyof typeof PROXY_BUDGETS;

interface CapturedApiRequest {
  phaseId: number;
  requestStartSequence: number;
  method: string;
  pathname: string;
  status?: number;
  correlationId?: string;
  body?: string;
  bodyCompleted: boolean;
  failure?: string;
}

interface AuthMetric {
  event: 'auth_validation';
  correlationId: string;
  boundary: 'proxy' | 'route';
  pathname: string;
  authMethod: 'getClaims' | 'getUser';
  authStatus: 'authenticated' | 'unauthenticated' | 'error';
  authErrorCode?: string;
  refreshed?: boolean;
}

interface MetricSnapshot {
  byteLength: number;
  sequence: number;
  metrics: AuthMetric[];
}

interface PhaseBoundary {
  id: number;
  name: string;
  metricBoundary: MetricSnapshot;
}

interface PhaseSnapshot {
  phase: PhaseBoundary;
  requests: CapturedApiRequest[];
  metrics: Array<AuthMetric & { sequence: number }>;
}

function assertSuccessfulJsonRequests(
  requests: CapturedApiRequest[],
  label: string,
  validate: (body: Record<string, unknown>) => boolean,
): void {
  for (const request of requests) {
    expect(request.failure, `${label}: request failure`).toBeUndefined();
    expect(request.status, `${label}: completed response status`).toBeDefined();
    expect(request.status, `${label}: response must be 2xx`).toBeGreaterThanOrEqual(200);
    expect(request.status, `${label}: response must be 2xx`).toBeLessThan(300);
    let body: unknown;
    try {
      body = JSON.parse(request.body ?? '');
    } catch {
      throw new Error(`${label}: response body must be valid JSON`);
    }
    expect(
      typeof body === 'object' && body !== null && validate(body as Record<string, unknown>),
      `${label}: response contract`,
    ).toBe(true);
  }
}

function parseMetricLines(contents: string): AuthMetric[] {
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) !== '') {
    lines.pop();
  }
  return lines.filter(Boolean).map((line) => JSON.parse(line) as AuthMetric);
}

async function readMetricSnapshot(): Promise<MetricSnapshot> {
  try {
    const contents = await readFile(METRICS_FILE);
    const metrics = parseMetricLines(contents.toString('utf8'));
    return { byteLength: contents.byteLength, sequence: metrics.length, metrics };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { byteLength: 0, sequence: 0, metrics: [] };
    }
    throw error;
  }
}

async function readMetricsSince(
  boundary: MetricSnapshot
): Promise<Array<AuthMetric & { sequence: number }>> {
  const contents = await readFile(METRICS_FILE);
  const appended = contents.subarray(boundary.byteLength).toString('utf8');
  return parseMetricLines(appended).map((metric, index) => ({
    ...metric,
    sequence: boundary.sequence + index + 1,
  }));
}

function captureApiRequests(page: Page) {
  const requests: CapturedApiRequest[] = [];
  const recordsByRequest = new WeakMap<PlaywrightRequest, CapturedApiRequest>();
  let activePhaseId = 0;
  let requestStartSequence = 0;
  let responseCompletionSequence = 0;

  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return;

    const record: CapturedApiRequest = {
      phaseId: activePhaseId,
      requestStartSequence: ++requestStartSequence,
      method: request.method(),
      pathname,
      bodyCompleted: false,
    };
    recordsByRequest.set(request, record);
    requests.push(record);
  });

  page.on('response', (response: Response) => {
    const record = recordsByRequest.get(response.request());
    if (!record) return;
    record.status = response.status();
    record.correlationId = response.headers()['x-correlation-id'];
    void response.text()
      .then((body) => {
        record.body = body;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'response body read failed';
        const bodyWasEvictedDuringNavigation = response.ok() &&
          /Network\.getResponseBody\): No data found for resource/i.test(message);
        if (!bodyWasEvictedDuringNavigation) {
          record.failure = message;
        }
      })
      .finally(() => {
        record.bodyCompleted = true;
        responseCompletionSequence += 1;
      });
  });

  page.on('requestfailed', (request) => {
    const record = recordsByRequest.get(request);
    if (!record || record.bodyCompleted) return;
    record.failure = request.failure()?.errorText ?? 'request failed';
    record.bodyCompleted = true;
    responseCompletionSequence += 1;
  });

  return {
    async beginPhase(name: string): Promise<PhaseBoundary> {
      const metricBoundary = await readMetricSnapshot();
      activePhaseId += 1;
      return { id: activePhaseId, name, metricBoundary };
    },
    phaseRequests(phase: PhaseBoundary): CapturedApiRequest[] {
      return requests.filter((request) => request.phaseId === phase.id);
    },
    state(phase: PhaseBoundary) {
      const phaseRecords = requests.filter((request) => request.phaseId === phase.id);
      return {
        requestStartSequence,
        responseCompletionSequence,
        pendingBodies: phaseRecords.filter((request) => !request.bodyCompleted).length,
      };
    },
  };
}

type ApiCapture = ReturnType<typeof captureApiRequests>;

async function loginFromCurrentPage(
  page: Page,
  email: string,
  password: string,
  navigationTimeout = COLD_NAVIGATION_TIMEOUT_MS,
): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(password);
  const navigation = waitForUrlOrPageError(page, /\/floor-plan/, navigationTimeout);
  await page.getByRole('button', { name: SIGN_IN_BUTTON_NAME }).click();
  await navigation;
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({ timeout: 30_000 });
}

function waitForUrlOrPageError(page: Page, url: RegExp, timeout: number): Promise<void> {
  let pageErrorHandler: ((error: Error) => void) | undefined;
  const pageError = new Promise<never>((_resolve, reject) => {
    pageErrorHandler = (error) => reject(error);
    page.once('pageerror', pageErrorHandler);
  });
  const navigation = page.waitForURL(url, { timeout, waitUntil: 'commit' });
  return Promise.race([navigation, pageError]).finally(() => {
    if (pageErrorHandler) page.off('pageerror', pageErrorHandler);
  });
}

async function warmAuthenticatedFloorPlan(
  browser: Browser,
  email: string,
  password: string
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/login');
    const placeholderId = '00000000-0000-4000-8000-000000000000';
    await page.evaluate(async (id) => {
      const responses = await Promise.all([
        fetch('/api/presence/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transitionId: '00000000-0000-4000-8000-000000000001' }),
        }),
        fetch(`/api/presence/sessions/${id}/disconnect`, { method: 'POST' }),
        fetch(`/api/spaces/${id}/details`),
        fetch(`/api/users/get-by-id?supabase_uid=${id}`),
        fetch('/api/presence/snapshot'),
        fetch('/api/presence/sessions', { method: 'POST' }),
        fetch('/api/presence/location', { method: 'POST' }),
        fetch(`/api/spaces/knock/pending?spaceId=${id}&sessionId=${id}`),
        fetch('/api/neighborhoods'),
      ]);
      await Promise.all(responses.map((response) => response.text()));
    }, placeholderId);
    try {
      await loginFromCurrentPage(page, email, password, 30_000);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;

      // A cold Next dev compile can complete the authenticated request while
      // Fast Refresh aborts the client-router commit. This context only warms
      // routes; a direct retry must still render the authenticated floor plan.
      await page.goto('/floor-plan', {
        timeout: COLD_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'commit',
      });
      await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({
        timeout: 30_000,
      });
    }
    // Let Next finish any post-compile Fast Refresh before the evidence browser
    // starts. Production serves precompiled code, so HMR is harness noise.
    await page.waitForTimeout(2_000);
  } finally {
    await context.close();
  }
}

function hasBrowserBootstrapMinimum(requests: CapturedApiRequest[]): boolean {
  return BOOTSTRAP_BUDGETS.every((budget) =>
    requests.filter((request) =>
      request.method === budget.method && request.pathname === budget.pathname
    ).length >= budget.count
  );
}

function hasServerBootstrapMinimum(metrics: AuthMetric[]): boolean {
  return REQUIRED_ROUTE_AUTH_BUDGETS.every((budget) =>
    metrics.filter((metric) =>
      metric.boundary === 'route' && metric.pathname === budget.pathname
    ).length >= budget.count
  ) && metrics.some((metric) => metric.boundary === 'proxy');
}

function normalizedAuthPath(pathname: string): string {
  return /^\/api\/spaces\/[^/]+\/details$/.test(pathname)
    ? '/api/spaces/details'
    : pathname;
}

async function waitForQuietPhase(
  capture: ApiCapture,
  phase: PhaseBoundary,
  options: { requireBootstrapMinimum: boolean }
): Promise<PhaseSnapshot> {
  if (options.requireBootstrapMinimum) {
    await expect.poll(() => hasBrowserBootstrapMinimum(capture.phaseRequests(phase)), {
      message: `${phase.name} should issue every bootstrap request`,
      timeout: QUIET_TIMEOUT_MS,
    }).toBe(true);
    await expect.poll(async () => hasServerBootstrapMinimum(
      await readMetricsSince(phase.metricBoundary)
    ), {
      message: `${phase.name} should emit route and proxy auth metrics`,
      timeout: QUIET_TIMEOUT_MS,
    }).toBe(true);
  }

  const deadline = Date.now() + QUIET_TIMEOUT_MS;
  let stableKey = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const requestState = capture.state(phase);
    const metricState = await readMetricSnapshot();
    const nextKey = [
      requestState.requestStartSequence,
      requestState.responseCompletionSequence,
      requestState.pendingBodies,
      metricState.sequence,
      metricState.byteLength,
    ].join(':');

    if (nextKey !== stableKey || requestState.pendingBodies !== 0) {
      stableKey = nextKey;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= QUIET_WINDOW_MS) {
      const requests = capture.phaseRequests(phase).map((request) => ({ ...request }));
      const metrics = await readMetricsSince(phase.metricBoundary);
      const finalRequestState = capture.state(phase);
      const finalMetricState = await readMetricSnapshot();
      const finalKey = [
        finalRequestState.requestStartSequence,
        finalRequestState.responseCompletionSequence,
        finalRequestState.pendingBodies,
        finalMetricState.sequence,
        finalMetricState.byteLength,
      ].join(':');
      if (finalKey === stableKey && finalRequestState.pendingBodies === 0) {
        return { phase, requests, metrics };
      }
      stableKey = finalKey;
      stableSince = Date.now();
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 50));
  }

  throw new Error(`${phase.name} did not reach a ${QUIET_WINDOW_MS}ms stable quiet window`);
}

function assertBootstrapBudgets(
  snapshot: PhaseSnapshot,
  phaseName: BootstrapPhaseName
): void {
  for (const budget of BOOTSTRAP_BUDGETS) {
    const count = snapshot.requests.filter((request) =>
      request.method === budget.method && request.pathname === budget.pathname
    ).length;
    expect(count, `${phaseName}: ${budget.method} ${budget.pathname}`).toBe(budget.count);
  }

  const sessionRegistrations = snapshot.requests.filter((request) =>
    request.method === 'POST' && request.pathname === '/api/presence/sessions'
  );
  expect(sessionRegistrations, `${phaseName}: exact presence session registration`)
    .toHaveLength(1);
  assertSuccessfulJsonRequests(
    sessionRegistrations,
    `${phaseName}: presence session registration`,
    (body) => typeof body.sessionId === 'string' && typeof body.companyId === 'string',
  );
  const locationTransitions = snapshot.requests.filter((request) =>
    request.method === 'POST' && request.pathname === '/api/presence/location'
  );
  expect(locationTransitions, `${phaseName}: exact automatic placement transition`)
    .toHaveLength(1);
  assertSuccessfulJsonRequests(
    locationTransitions,
    `${phaseName}: automatic placement transition`,
    (body) => body.success === true &&
      (body.code === 'LOCATION_UPDATED' || body.code === 'LOCATION_UNCHANGED'),
  );
  const snapshots = snapshot.requests.filter((request) =>
    request.method === 'GET' && request.pathname === '/api/presence/snapshot'
  );
  expect(snapshots.length, `${phaseName}: snapshot reconciliation minimum`).toBeGreaterThanOrEqual(2);
  expect(snapshots.length, `${phaseName}: snapshot reconciliation budget`).toBeLessThanOrEqual(4);
  assertSuccessfulJsonRequests(
    snapshots,
    `${phaseName}: presence snapshot`,
    (body) => typeof body.companyId === 'string' && Array.isArray(body.users),
  );

  for (const budget of REQUIRED_ROUTE_AUTH_BUDGETS) {
    const count = snapshot.requests.filter((request) =>
      request.method === budget.method && normalizedAuthPath(request.pathname) === budget.pathname
    ).length;
    expect(count, `${phaseName}: auth route ${budget.method} ${budget.pathname}`)
      .toBe(budget.count);
  }

  const failedBootstrapRequests = snapshot.requests.filter((request) =>
    request.failure && BOOTSTRAP_BUDGETS.some((budget) =>
      request.method === budget.method && request.pathname === budget.pathname
    )
  );
  expect(failedBootstrapRequests, `${phaseName}: bootstrap request failures`).toEqual([]);
  const unexpectedRequestFailures = snapshot.requests.filter((request) => {
    if (!request.failure) return false;
    const isNavigationAbort = request.failure === 'net::ERR_ABORTED' && (
      /^\/api\/presence\/sessions(?:\/|$)/.test(request.pathname) ||
      request.pathname === '/api/spaces/knock/pending'
    );
    return !isNavigationAbort;
  });
  expect(unexpectedRequestFailures, `${phaseName}: unexpected request failures`).toEqual([]);
  const correlatedAuthRequests = snapshot.requests.filter((request) => request.correlationId);
  expect(correlatedAuthRequests.filter((request) =>
    request.status === undefined || request.status < 200 || request.status >= 300
  ), `${phaseName}: correlated auth route responses must be 2xx`).toEqual([]);
  expect(snapshot.requests.filter((request) =>
    request.status === 401 || request.status === 429 || (request.status ?? 0) >= 500
  ), `${phaseName}: API responses must not be 401, 429, or 5xx`).toEqual([]);
  expect(snapshot.requests.filter((request) => RATE_LIMIT_PATTERN.test(request.body ?? '')),
    `${phaseName}: API bodies must not contain a rate-limit error`).toEqual([]);

  const byCorrelationId = new Map<string, AuthMetric[]>();
  for (const metric of snapshot.metrics) {
    const group = byCorrelationId.get(metric.correlationId) ?? [];
    group.push(metric);
    byCorrelationId.set(metric.correlationId, group);
  }
  for (const [correlationId, group] of byCorrelationId) {
    expect(group, `${phaseName}: correlation ${correlationId}`).toHaveLength(1);
  }

  const routeMetrics = snapshot.metrics.filter((metric) => metric.boundary === 'route');
  expect(routeMetrics.some((metric) => metric.pathname === '/unattributed'),
    `${phaseName}: every route auth validation must be attributed`).toBe(false);

  const routePathCounts = new Map<string, number>();
  for (const metric of routeMetrics) {
    routePathCounts.set(metric.pathname, (routePathCounts.get(metric.pathname) ?? 0) + 1);
    const matchingRequest = correlatedAuthRequests.filter((request) =>
      request.correlationId === metric.correlationId &&
      normalizedAuthPath(request.pathname) === metric.pathname
    );
    expect(matchingRequest, `${phaseName}: browser/server join for ${metric.pathname}`)
      .toHaveLength(1);
  }
  for (const [pathname, count] of routePathCounts) {
    const knownPath = REQUIRED_ROUTE_AUTH_BUDGETS.some((budget) => budget.pathname === pathname) ||
      OPTIONAL_ROUTE_AUTH_PATHS.has(pathname);
    expect(knownPath, `${phaseName}: unbudgeted authenticated route ${pathname}`).toBe(true);
    expect(count, `${phaseName}: duplicate route validation for ${pathname}`).toBeLessThanOrEqual(1);
  }

  for (const budget of REQUIRED_ROUTE_AUTH_BUDGETS) {
    const routeMetrics = snapshot.metrics.filter((metric) =>
      metric.boundary === 'route' && metric.pathname === budget.pathname
    );
    expect(routeMetrics, `${phaseName}: route auth budget for ${budget.pathname}`)
      .toHaveLength(budget.count);
    expect(routeMetrics.every((metric) =>
      metric.authMethod === 'getUser' && metric.authStatus === 'authenticated'
    )).toBe(true);
  }

  const proxyMetrics = snapshot.metrics.filter((metric) => metric.boundary === 'proxy');
  const proxyBudget = PROXY_BUDGETS[phaseName];
  expect(proxyMetrics.length, `${phaseName}: proxy validation count`).toBeGreaterThan(0);
  expect(proxyMetrics.length, `${phaseName}: provisional proxy validation max`)
    .toBeLessThanOrEqual(proxyBudget.maxValidations);
  expect(snapshot.metrics.filter((metric) => metric.refreshed).length,
    `${phaseName}: refreshed validation event max`).toBeLessThanOrEqual(proxyBudget.maxRefreshed);
  expect(proxyMetrics.every((metric) => metric.authMethod === 'getUser'),
    `${phaseName}: HS256 proxy validation method`).toBe(true);
  const protectedProxyMetrics = proxyMetrics.filter((metric) =>
    ['/dashboard', '/floor-plan', '/create-company', '/admin'].some((route) =>
      metric.pathname.startsWith(route)
    )
  );
  expect(protectedProxyMetrics.length, `${phaseName}: protected page validation count`)
    .toBeGreaterThan(0);
  expect(protectedProxyMetrics.every((metric) => metric.authStatus === 'authenticated'),
    `${phaseName}: protected page validations`).toBe(true);
  expect(proxyMetrics.some((metric) => /\.[A-Za-z0-9]+$/.test(metric.pathname)),
    `${phaseName}: proxy must exclude public assets`).toBe(false);
  expect(proxyMetrics.some((metric) => metric.pathname.startsWith('/api/')),
    `${phaseName}: proxy must exclude API routes`).toBe(false);

  const proxyPathCounts = new Map<string, number>();
  for (const metric of proxyMetrics) {
    proxyPathCounts.set(metric.pathname, (proxyPathCounts.get(metric.pathname) ?? 0) + 1);
  }
  for (const [pathname, count] of proxyPathCounts) {
    const maxForPath = pathname === '/floor-plan'
      ? proxyBudget.maxFloorPlanValidations
      : 1;
    expect(count, `${phaseName}: duplicate proxy validation for ${pathname}`)
      .toBeLessThanOrEqual(maxForPath);
  }
}

test.describe('authenticated bootstrap stability', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  let adminEmail: string;
  let adminPassword: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    if (process.env.VO_AUTH_METRICS !== '1') {
      throw new Error(
        'VO_AUTH_METRICS=1 is required so Playwright owns a fresh, correlated metrics server.'
      );
    }
    const environment = await resolvePresenceE2EEnvironment();
    adminEmail = environment.admin.email;
    adminPassword = environment.admin.password;
    await warmAuthenticatedFloorPlan(browser, adminEmail, adminPassword);
  });

  test('keeps initial and reload bootstraps within budget', async ({ page }) => {
    const capture = captureApiRequests(page);

    const loginPreparation = await capture.beginPhase('login preparation');
    await page.goto('/login');
    await expect(page.getByRole('button', { name: SIGN_IN_BUTTON_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await waitForQuietPhase(capture, loginPreparation, { requireBootstrapMinimum: false });

    const initial = await capture.beginPhase('initial');
    await loginFromCurrentPage(page, adminEmail, adminPassword);
    assertBootstrapBudgets(
      await waitForQuietPhase(capture, initial, { requireBootstrapMinimum: true }),
      'initial'
    );

    const reload = await capture.beginPhase('reload');
    await page.reload();
    await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({ timeout: 30_000 });
    assertBootstrapBudgets(
      await waitForQuietPhase(capture, reload, { requireBootstrapMinimum: true }),
      'reload'
    );
  });

  test('keeps an admin-to-member account switch within budget', async ({ page }) => {
    // These remain hard preconditions rather than a skip. Keeping this scenario
    // separate lets the admin-only runtime gate produce evidence while the
    // distinct member account is being provisioned.
    const environment = await resolvePresenceE2EEnvironment();
    const memberEmail = environment.member.email;
    const memberPassword = environment.member.password;
    const capture = captureApiRequests(page);

    const loginPreparation = await capture.beginPhase('account-switch login preparation');
    await page.goto('/login');
    await expect(page.getByRole('button', { name: SIGN_IN_BUTTON_NAME })).toBeVisible();
    await waitForQuietPhase(capture, loginPreparation, { requireBootstrapMinimum: false });

    const initial = await capture.beginPhase('account-switch initial');
    await loginFromCurrentPage(page, adminEmail, adminPassword);
    assertBootstrapBudgets(
      await waitForQuietPhase(capture, initial, { requireBootstrapMinimum: true }),
      'initial'
    );

    // Exercise A -> logout -> B in one browser so cookies/storage and the
    // customer-visible identity boundary are verified end to end. The stricter
    // same-React-tree late-response race is covered by the CompanyContext test.
    const logout = await capture.beginPhase('logout');
    const logoutContracts: Array<{ status: number; body: string }> = [];
    const logoutRoutePattern = '**/api/presence/logout';
    await page.route(logoutRoutePattern, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      logoutContracts.push({ status: response.status(), body });
      await route.fulfill({ response, body });
    });
    await page.getByTestId('account-menu-trigger').click();
    const logoutNavigation = waitForUrlOrPageError(page, /\/login/, 30_000);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await logoutNavigation;
    await page.unroute(logoutRoutePattern);
    await expect(page.getByRole('button', { name: SIGN_IN_BUTTON_NAME })).toBeVisible({
      timeout: 30_000,
    });
    const logoutSnapshot = await waitForQuietPhase(capture, logout, {
      requireBootstrapMinimum: false,
    });
    const logoutRequests = logoutSnapshot.requests.filter((request) =>
      request.method === 'POST' && request.pathname === '/api/presence/logout'
    );
    expect(logoutRequests, 'logout: exact atomic presence logout').toHaveLength(1);
    const [logoutContract] = logoutContracts;
    if (!logoutContract) throw new Error('logout: atomic presence logout response was not captured');
    expect(logoutRequests[0]?.status, 'logout: captured response status agreement')
      .toBe(logoutContract.status);
    expect(logoutContract.status, 'logout: atomic presence logout response status')
      .toBeGreaterThanOrEqual(200);
    expect(logoutContract.status, 'logout: atomic presence logout response status')
      .toBeLessThan(300);
    const logoutBody = JSON.parse(logoutContract.body) as Record<string, unknown>;
    expect(
      logoutBody.success === true &&
        (logoutBody.code === 'LOCATION_UPDATED' || logoutBody.code === 'LOCATION_UNCHANGED'),
      'logout: atomic presence logout response contract',
    ).toBe(true);

    const member = await capture.beginPhase('member');
    await loginFromCurrentPage(page, memberEmail, memberPassword);
    assertBootstrapBudgets(
      await waitForQuietPhase(capture, member, { requireBootstrapMinimum: true }),
      'member'
    );

    await page.getByTestId('account-menu-trigger').click();
    await expect(page.getByText(memberEmail, { exact: true })).toBeVisible();
    await expect(page.getByText(adminEmail, { exact: true })).toHaveCount(0);
  });
});
