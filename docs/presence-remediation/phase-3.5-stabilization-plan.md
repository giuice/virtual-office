# Phase 3.5 — Authenticated bootstrap and read-model stabilization plan

Revision 3 — 2026-07-16. Incorporates the adversarial review of revision 1 and the operability correction after the linked environment was found without required migrations and the customer-testable floor plan lost rooms, avatars, movement, and Knock. Inserted before Phase 4 of the presence-safety remediation (`docs/presence-safety-remediation-handoff-2026-07-09.md`). Phase 3.5 itself remains application-layer only; it creates no schema migration, but its release gate now verifies migration readiness and end-to-end product operability.

## Context

`docs/presence-remediation/current-runtime-debug-report-2026-07-14.md` proved at runtime that a single admin login breaks the floor plan: an auth request storm → `Request rate limit reached` → API routes fail 500/401 → `CompanyContext` wipes all state → the UI shows a false "No spaces available" and Presence unsubscribes. All code claims were verified on `staging` @ `00ee8d0`. None of it originates in Phase 3; it is pre-existing bootstrap architecture exposed by Phase 3 runtime verification. Phase 4 must not be promoted as a normal customer-facing rollout on this state; a narrowly scoped emergency restoration may proceed only to recover a safe core workflow and remains subject to the shared operability gate below.

## Operability-first release gate

Phase isolation is for implementation and review; it is not permission to release an unusable intermediate product. Security and operability are simultaneous release requirements.

- A passing unit suite cannot close Phase 3.5 while the runtime shows a false empty office, hides active avatars, prevents movement, or leaves the customer unable to exercise the office with two users.
- Any required migration must be explicitly applied to the named environment, registered/reconciled in migration history, and read back. “The SQL file exists” is not deployment evidence.
- A security kill switch is an emergency incident state, not a successful phase outcome. The safe server contract and its minimum compatible client must ship as one customer-facing release unit.
- The shared Phase 3.5/Phase 4 product smoke uses an admin and a member in isolated browsers: both load the same rooms, both avatars appear exactly once, both can move, each can Knock on the other's occupied room, approve/deny works, and an admin/directly authorized user sees **Enter** and **Knock** independently.
- If this smoke fails, engineering may continue locally to repair it, but the build is not customer-testable and no earlier phase may be represented as complete in practice.

### Current execution checkpoint - 2026-07-16

- WP1-WP3 are implemented and adversarial findings were corrected; their focused suites and type-check passed.
- WP4-WP7 remain required to close Phase 3.5.
- The Phase 4 social-Knock migration `20260716143115_phase4_social_knock_server_contract.sql` and the follow-up `20260716175515_phase4_knock_delivery_and_retention.sql` are now applied to the linked project, recorded in migration history, and read back. The post-`20260716175515` admin/member runtime smoke is user-approved. The cross-company Realtime probe, terminating full-suite result, and final explicit confirmation after those gates remain pending.

## Architecture decisions

- **D1 — CompanyContext kept, minimally hardened.** In-flight guard + structured `bootstrapError` + auth-generation guard. NOT migrated to TanStack Query in this phase: `currentUserProfile` identity semantics are load-bearing for `PresenceContext` (`src/contexts/PresenceContext.tsx:19-24`).
- **D2 — Profile sync belongs to CompanyContext only, deduped in-flight only.** The duplicate `AuthContext` Google-sync effect is deleted. The `signUp` sync call is also deleted: `signUp` can return `data.user` without `data.session` (email confirmation), in which case the authenticated endpoint 401s; sync is deferred until an authenticated bootstrap exists — which CompanyContext already performs. Dedupe is **in-flight only** (entry removed in `finally`), because a permanent per-UID promise cache dies on reload anyway and would serve stale profile/avatar during long SPA sessions. Acceptance criterion: at most one `sync-profile` per authenticated bootstrap; no Strict Mode duplication; a fresh sync is allowed after a new bootstrap/auth transition.
- **D3 — One authoritative server-side validation per API request: `requireAuthUser` in the route.** The proxy stops matching `/api/**`. The proxy keeps page-route protection and the cookie-refresh responsibility, using `supabase.auth.getClaims()` (current Supabase Next.js SSR recommendation) instead of `getUser()`; routes keep `getUser()` as the authoritative boundary. Caveat (WP0 verifies): `getClaims()` verifies locally only with asymmetric signing keys; on legacy HS256 it falls back to a network call. If the project is on HS256, either the user approves a key migration (separate task) or the proxy keeps `getUser()` for page routes only — still a large reduction. Expired-JWT and concurrent-request behavior must be proven, not assumed.
- **D4 — Error contract split client/server.** Three modules so `next/server` never leaks into the client bundle:
  - `src/lib/api/error-contract.ts` — pure types: `ApiErrorBody = { error: string; code?: string; correlationId?: string }`, error-code constants.
  - `src/lib/api/server-error.ts` — server-only: `jsonError(status, code, message, { correlationId })` (extends the shape of the existing `jsonError` in `src/lib/auth/authorize.ts:43`, which re-exports from here; messaging/knock routes untouched); `serializeSupabaseError(err)` reading `.code/.message/.details/.hint/.status` structurally (a `PostgrestError` is a plain object — the current `instanceof Error` checks drop it); structured redacted server log line per error with `correlationId`. **`details`/`hint` go to the server log only, never in the HTTP response.**
  - `src/lib/api/client-error.ts` — `class ApiError extends Error { status; code?; correlationId? }` + `throwApiError(response)` reading `body.error ?? body.message ?? statusText`.

## Findings-to-fix map

| Report finding | Fixed in |
|---|---|
| VO-RUNTIME-001 credential logging | WP1 |
| VO-RUNTIME-002 auth storm | WP2 (server), WP3 (client), WP0 (real endpoint/code diagnosis) |
| VO-RUNTIME-003 false empty office | WP5 |
| VO-RUNTIME-004 error loss | WP4 |
| VO-RUNTIME-005 blind tests | WP3–WP6 regression tests, WP7 E2E |
| VO-RUNTIME-006 duplicate sync on critical path | WP3 |

## Work packages

Each WP ships its regression test in the same diff. Execution delegated to Codex, **minimum tier Sol high** (per current `CLAUDE.md`), one WP at a time, orchestrator reviews every diff. No commits — the user reviews and commits.

### WP0 — Preconditions and evidence capture (user + read-only investigation, no code)

1. **USER:** rotate the exposed admin session (Supabase dashboard → sign out all sessions for the affected user).
2. **USER:** scrub/delete the contaminated local dev log (tokens).
3. Diagnose the real rate-limited endpoint before designing around it: from the dev log / a controlled reproduction, capture the Auth endpoint actually called (`/auth/v1/user` vs `/auth/v1/token` — refresh bucket has burst 30 and is the plausible culprit for concurrent refresh storms), HTTP status, `AuthApiError.code`, whether a token refresh happened, and validations per application request. Detection logic in code must key on `status === 429`, preserving the original code redacted — never on string-matching `over_request_rate_limit`.
4. **Staging readback (exit-gate prerequisite, moved back from "follow-up"):** read the staging migration history/catalog state (per report item 9 and the Phase 0 unresolved reconciliation) so any residual authenticated read failure can be classified as RLS/PostgREST vs schema drift once WP4 makes errors visible.
5. Record the JWT signing key type (asymmetric vs HS256) — decides the `getClaims()` path in WP2.
6. Provision `AUTH_E2E_MEMBER_EMAIL/PASSWORD` in `.env.local` (staging member account).

### WP1 — Remove credential logging + automated guard (P0)

- `src/hooks/useSession.ts:81`: replace `console.log(\`Auth state changed: ${event}\`, session)` with a dev-gated redacted line (event name only).
- New `__tests__/guards/no-credential-logging.test.ts`: scans `src/**/*.{ts,tsx}` and fails on any `console.*` call whose arguments reference banned identifiers (`session`, `access_token`, `refresh_token`, `provider_token`, interpolated JWTs). Allowlist via `// vo-log-audited` trailing comment. Must fail on the current tree, pass after the fix.

### WP2 — Proxy: pages only, claims-based refresh (server half of the storm)

- `src/proxy.ts` matcher excludes API routes: `'/((?!_next/|__nextjs|favicon.ico|src/|api/).*)'`. Comment block documents D3 (routes self-validate; route handlers persist rotated cookies via the server client's `setAll`; the OAuth callback manages its own cookie exchange — implementer confirms that route).
- Replace the proxy's `getUser()` with `getClaims()` for page-route protection + cookie refresh (subject to the WP0 key-type check; HS256 fallback = keep `getUser()` for pages only). Routes keep `getUser()` via `requireAuthUser` as the single authoritative boundary.
- Matcher must stay a static literal (Next requires static analysis — do not export a dynamic variable into `config`). Test uses Next's experimental matcher-testing helper (`unstable_doesProxyMatch` / `unstable_doesMiddlewareMatch` from `next/experimental/testing/server`, per installed Next version) against the **real** exported `config`: `/api/users/sync-profile`, `/api/users/list`, `/api/companies/get`, `/api/spaces` do NOT match; `/floor-plan`, `/dashboard`, `/login`, `/admin` DO. `protectedRoutes` untouched.
- Evidence requirement (feeds WP7): expired-JWT navigation and several concurrent API requests with an expired access token refresh correctly (no 401 wave, no duplicate concurrent refreshes observable in the WP6 events).

### WP3 — Client dedupe: in-flight-only sync + auth-generation guard (P0 fixes)

- New `src/lib/bootstrap/profile-sync.ts`: `syncUserProfileOnce(payload)` with a module-level `Map<supabase_uid, Promise<User>>` used **only for in-flight dedupe** — the entry is deleted in `finally` (success and failure). Collapses Strict Mode double-invoke; permits a fresh sync on the next bootstrap. Test-only `__resetProfileSyncCache()`.
- `src/contexts/AuthContext.tsx`: delete `syncGoogleOAuthUser` (~23-52) and its effect (54-56) plus unused imports. Delete the `signUp` sync call entirely (D2 — no session may exist yet; CompanyContext syncs on the first authenticated bootstrap).
- `src/contexts/CompanyContext.tsx`:
  - `loadCompanyData` uses `syncUserProfileOnce` (line 70 and `createNewCompany`); in-flight guard per `authUserId` (concurrent call for the same uid returns the existing promise; cleared in `finally`).
  - **Auth-generation guard:** a monotonically increasing generation (or the captured `authUserId`) is snapshotted when a load starts; every async state commit (`updateCurrentUserProfile`, `updateCompanyState`, `updateCompanyUsers`, `updateSpaces`, `bootstrapError`) is skipped if the generation/UID changed meanwhile. Prevents account A's late responses landing after account B logs in in the same browser.
- New `__tests__/contexts/company-context-bootstrap.test.tsx`:
  - `<React.StrictMode>` render with mocked/counted `@/lib/api`: `syncUserProfile` exactly 1×, `getCompany`/`getUsersByCompany`/`getSpacesByCompany` 1× each (fails on current tree).
  - **Account-switch test: A → logout → B in the same tree** — delayed A responses resolve after B's login; assert no A data is committed and B's bootstrap runs cleanly (fails on current tree).

### WP4 — Structured, redacted error contract (client/server split per D4)

- Create `error-contract.ts`, `server-error.ts`, `client-error.ts` as in D4. `src/lib/auth/authorize.ts` re-exports `jsonError` (messaging/knock routes untouched, base `{error, code}` shape preserved).
- `src/lib/auth/session.ts` `requireAuthUser`: classify the `getUser()` failure by `status === 429` → `jsonError(429, 'RATE_LIMITED', ...)` preserving the original Auth error code redacted in the server log; otherwise 401 `UNAUTHORIZED`; profile-lookup failure → 500 `INTERNAL_ERROR` (serialized to server log); missing profile → 404 `PROFILE_NOT_FOUND`.
- Convert error paths (success shapes UNCHANGED) with a `correlationId` generated at handler entry, present in every error response and its server log line: `api/companies/get`, `api/users/by-company`, `api/users/list`, `api/spaces`, `api/users/sync-profile`. Do NOT touch `/api/users/location` or knock routes (`SPACE_FULL` etc. are load-bearing).
- `src/lib/api.ts`: use `throwApiError` in `syncUserProfile`, `getCompany` (keep 404→null branch), `getUsersByCompany`, `getSpacesByCompany`, `updateUserStatus`.
- Tests: route envelope for a mocked PostgrestError-shaped 500 (real `code` in server log; **no** `details`/`hint` in the response body in any env); 429 case in `__tests__/auth-session.test.ts`; `__tests__/lib/api-error-parsing.test.ts` for `{error}` / `{message}` / new envelope bodies; new route tests for companies-get / users-by-company / sync-profile; a guard that `client-error.ts` and `error-contract.ts` import nothing from `next/server`.

### WP5 — Bootstrap error state: retention for transient failures ONLY; 401 ends identity

- `CompanyContext` exposes `bootstrapError: { kind: 'unauthenticated' | 'rate-limited' | 'server'; message: string; correlationId?: string } | null` mapped from `ApiError.status/code`.
- **Retention policy (replaces the destructive catch reset at lines 109-113):**
  - `429` / `5xx` / network (`rate-limited`, `server`): retain already-confirmed state (profile/company/users/spaces) **only while the authenticated UID is unchanged** (WP3 generation guard); Presence stays subscribed through the transient failure.
  - `401` (`unauthenticated`): **full identity teardown** — clear `currentUserProfile`, company, users, spaces (Presence tears down naturally via `PresenceContext.tsx:19-24`), show the re-auth state. Never keep Presence/messaging alive on an invalid session.
  - The logged-out reset in the effect (lines 137-143) stays as-is.
- `refreshCompanyData` clears `bootstrapError` before reloading (retry path).
- `src/components/floor-plan/floor-plan.tsx` state machine after the existing loading gate: (1) `bootstrapError && spaces.length === 0` → full-panel error by kind (unauthenticated → "session expired" + Sign in; rate-limited → wait + Retry; server → message + correlationId + Retry); (2) `bootstrapError && spaces.length > 0` (transient kinds only, by construction) → floor plan from retained data + non-blocking Alert banner with Retry; (3) no error and empty → genuine empty state.
- `src/components/floor-plan/modern/ModernFloorPlanGrid.tsx` (31-35, 85-89): optional `emptyState?: ReactNode` prop replacing the hardcoded "No spaces available".
- Tests: 429 retention (state kept — fails on current tree); 401 teardown (state cleared, presence input goes null); `__tests__/components/floor-plan-bootstrap-states.test.tsx` per kind. Presence guard suite: `default-space-assignment`, `space-capacity-handling`, `reconnection-grace`. Run the `presence-safety-reviewer` agent after this WP.

### WP6 — Correlated auth observability + regression tests (replaces module-level counters)

- No in-memory counters (they mix requests/users/HMR/processes and can't see server→Supabase calls from Playwright). Instead: **structured per-request log events**, dev/env-gated (`VO_AUTH_METRICS=1`), one line per auth validation: `{ correlationId, boundary: 'proxy' | 'route', pathname, authMethod: 'getClaims' | 'getUser', authStatus, authErrorCode?, refreshed?: boolean }`. Emitted from `proxy.ts` and `requireAuthUser`. Dormant in production.
- Playwright `__tests__/api/playwright/presence/bootstrap-stability.spec.ts` (password login via `AUTH_E2E_*`, pattern of the existing `auth-flow.spec.ts`): the browser side counts requests **per endpoint** (not a blanket `/api/** ≤ 10`): exactly 1 `POST /api/users/sync-profile`; 1 each of companies-get / users-by-company / spaces per bootstrap (initial budget — tightened after first capture, agreed number recorded in the evidence doc); zero 401/429/500 on `/api/**`; zero "rate limit" bodies. Server-side validations/refreshes are counted from the correlated `VO_AUTH_METRICS` log, joined by `correlationId`.
- Scenario coverage in the same spec (or vitest where feasible): Strict Mode (covered by WP3 unit test), reload (fresh bootstrap → exactly one new sync-profile, per D2's corrected criterion), account switch A→B.

### WP7 — Runtime verification and evidence (user-gated exit gate)

Evidence goes to `docs/presence-remediation/phase-3.5-evidence-<date>.md`. **No new documents in the `docs/` root.**

Presence health is proven by **snapshot, never by `SUBSCRIBED` alone**: `isPresenceReady` true; the current user present in the derived snapshot; admin and member each appear exactly once; rooms/occupants correct after the post-subscribe blind window + reconciliation; no unnecessary channel recreation; no unsubscribe caused by a transient failure.

1. `npm run type-check` + full vitest suite green (including guards).
2. `VO_AUTH_METRICS=1 npm run dev`; cold admin login (Google OAuth) → correlated auth events within budget; exactly one sync-profile; zero rate-limit errors; rooms visible without reload; presence healthy per snapshot criteria.
3. Reload → exactly one fresh sync-profile for the new bootstrap (not zero — D2 corrected criterion); presence resubscribes and reconciles.
4. Member password login in an isolated browser → same rooms; admin+member each exactly once.
5. Admin + member simultaneously → no ghost users, no cross-account state.
6. **A → logout → B in the same browser** → no residual A data, B bootstraps cleanly.
7. Failure drills on `/api/companies/get` via devtools: 401 → re-auth state, presence torn down; 500 → retryable error state with retained data, presence stays subscribed; never "No spaces available".
8. Expired-JWT drill: expire the access token, navigate + fire concurrent API calls → clean refresh, no 401 wave.
9. Log audit: grep dev log for `access_token|refresh_token|eyJ` → zero hits.
10. Staging migration/catalog readback (WP0.4) reviewed before classifying any residual authenticated read failure; if a real RLS/PostgREST failure surfaces, it becomes a separate evidence-backed follow-up.
11. Shared product smoke with Phase 4: admin and member in isolated browsers see the same rooms and both active avatars exactly once; both can move; each can Knock on the other's occupied room; approve and deny reconcile; direct entry never suppresses Knock.
12. Confirm that every migration required by the tested runtime is present in the named environment's history and catalog. Record application/readback commands and results; do not leave an undisclosed migration step to the user.
13. Report `Status: Pending user confirmation`.

## Out of scope

Implementation of Knock/Phase 4; presence files (`useUserPresence`, `useLastSpace`, `presence-utils`, `/api/users/location`, knock routes); authoring DB migrations/RLS changes; TanStack Query migration; disabling Strict Mode; logging framework; JWT signing-key migration (if HS256 blocks `getClaims()`, that is a user decision logged in WP0); converting messaging/knock error envelopes. This scope boundary does **not** waive the shared release smoke: Phase 3.5 may avoid editing Phase 4 code while still refusing to label a broken integrated runtime customer-testable.

## Critical files

`src/contexts/CompanyContext.tsx` · `src/contexts/AuthContext.tsx` · `src/proxy.ts` · `src/lib/api.ts` · `src/lib/auth/session.ts` · `src/hooks/useSession.ts` · `src/components/floor-plan/floor-plan.tsx` · `src/components/floor-plan/modern/ModernFloorPlanGrid.tsx` · new `src/lib/api/error-contract.ts` / `server-error.ts` / `client-error.ts` · new `src/lib/bootstrap/profile-sync.ts`

**Status: Pending user confirmation**
