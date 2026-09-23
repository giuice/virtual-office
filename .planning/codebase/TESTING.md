# Testing Patterns

**Analysis Date:** 2026-07-22

## Test Framework

**Runner:**
- Vitest 4.0.18.
- Default config: `vitest.config.mts` with jsdom, globals, React plugin, `@` alias, and `vitest.setup.ts`.
- Specialized configs: `vitest.presence.config.mts`, `vitest.presence-db.config.mts`, `vitest.presence-concurrency.config.mts`, and `vitest.remote-messaging.config.mts`.
- Playwright 1.58.2 for browser/API E2E in `playwright.config.ts`.

**Assertion Library:**
- Vitest `expect` plus `@testing-library/jest-dom` matchers.
- Testing Library queries and `userEvent` for user-observable component behavior.

**Run Commands:**
```bash
npm test                         # Default isolated Vitest suite
npm run test:watch               # Watch mode
npm run test:coverage            # V8 text/JSON/HTML coverage
npm run test:presence            # Presence application/API/hook contract
npm run test:presence:db         # Local Supabase/Postgres integration
npm run test:presence:concurrency # Exact concurrent transition cases
npm run test:presence:e2e        # Multi-user browser Presence project
npm run test:api                 # Playwright projects
```

## Test File Organization

**Location:**
- Tests are centralized under `__tests__/` rather than co-located.
- Route-handler tests live in `__tests__/api/`.
- Browser specs live in `__tests__/api/playwright/`.
- Local database tests live in `__tests__/presence-db/`.
- Guard tests live in `__tests__/guards/`.

**Naming:**
- Unit/component/API: `*.test.ts` or `*.test.tsx`.
- Playwright: `*.spec.ts`.
- Feature names align with source behavior, for example `audio-signaling.test.tsx` and `presence-location-route.test.ts`.

**Structure:**
```text
__tests__/
├── api/                  # Route handlers and Playwright
├── app/                  # Page behavior
├── components/           # Component-specific suites
├── contexts/             # Provider/bootstrap behavior
├── guards/               # Static architecture/security gates
├── lib/                  # Pure utility/domain contracts
├── messaging/            # Messaging cache/UI/integration
├── presence-db/          # Real local PostgreSQL/RLS/RPC
└── *.test.ts[x]          # Cross-cutting feature behavior
```

## Test Structure

**Suite Organization:**
```typescript
describe('server-authoritative reconnection fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('uses default when no scoped hint or home assignment exists', () => {
    const result = getReconnectionContext(user, spaces, company, null);
    expect(result.spaceId).toBe('default-space');
  });
});
```

**Patterns:**
- Reset mocks and shared fake storage in `beforeEach`.
- Assert user-observable DOM state with role/label/test-id queries.
- Route tests mock server clients/repositories and inspect status plus stable response codes.
- Race/lifecycle tests hold promises or queued channel handlers, retire the owning instance, then assert stale work is ignored.
- Database suites serialize files because fixtures share one local database.

## Mocking

**Framework:** Vitest `vi`.

**Patterns:**
```typescript
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(),
}));

const channel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
```

**What to Mock:**
- Browser media APIs, Realtime channels, network requests, timers, and server client factories for isolated unit tests.
- Time and local storage when testing reconnection or expiry behavior.
- UI notification/logging side effects that are not the behavior under test.

**What NOT to Mock:**
- RLS, grants, RPC atomicity, and concurrency claims; use `__tests__/presence-db/` and local Supabase.
- Multi-user Realtime delivery and browser unload/reload behavior; use the Playwright Presence project.
- Repository wiring when the test is specifically an integration boundary.

## Fixtures and Factories

**Test Data:**
```typescript
const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  supabase_uid: 'auth-user-1',
  companyId: 'company-1',
  role: 'member',
  status: 'online',
  currentSpaceId: null,
};
```

**Location:**
- Small fixtures are local constants within test files.
- Messaging E2E seed support lives in `src/lib/test-utils/messaging-test-seeder.ts` and `src/app/api/test/messaging/seed/route.ts`.
- Presence DB setup/cleanup lives under `__tests__/presence-db/`.

## Coverage

**Requirements:**
- No global percentage threshold is configured in `vitest.config.mts`.
- Presence has behavior-based terminating gates instead of a raw percentage: unit/API, DB/RLS/RPC, exact concurrency, and browser E2E.

**View Coverage:**
```bash
npm run test:coverage
```

## Test Types

**Unit Tests:**
- Pure contracts/utilities, caches, coordinator behavior, error parsing, and guards.

**Component Tests:**
- React Testing Library for forms, messaging, floor-plan cards, providers, and accessibility interactions.

**Integration Tests:**
- Route handlers with mocked boundaries under `__tests__/api/`.
- Local Supabase/Postgres tests under `__tests__/presence-db/` for database authority.
- Explicit remote messaging integration runs only through `vitest.remote-messaging.config.mts`.

**E2E Tests:**
- Playwright projects `api`, `messaging-drawer`, and `presence` from `playwright.config.ts`.
- CI captures traces, videos, screenshots, and concurrency evidence on failure/as artifacts.

## Common Patterns

**Async Testing:**
```typescript
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: /open/i }));
await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
```

**Error Testing:**
```typescript
const response = await POST(request);
expect(response.status).toBe(403);
expect(await response.json()).toMatchObject({ code: 'SPACE_ACCESS_DENIED' });
```

**Presence verification order:**
1. `npm run presence:gate`
2. `npm run test:presence`
3. `npm run test:presence:db` against a reset local stack
4. `npm run test:presence:concurrency`
5. `npm run test:presence:e2e`
6. typecheck, lint, and build

---

*Testing analysis: 2026-07-22*
