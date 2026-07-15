# Presence runtime debug report — 2026-07-14

## Status

**Status: Pending user confirmation**

This report covers the current `staging` branch at commit `00ee8d0` (`feat: Implement phase 3 atomic transition for user location management`). No production code, database state, or Supabase configuration was changed during this investigation.

The floor plan failure is reproduced with one admin browser session. A second user is not required to trigger it and was intentionally not used: a single cold login already exhausts/authenticates enough requests to break the page, and another login would add noise to the rate-limit evidence.

## Executive summary

The UI is not loading an empty office. It loses the authenticated company read model and then renders the fallback empty state.

There are two runtime failures, one proven and one still masked:

1. **Proven primary failure:** the app creates an authentication request storm during login/bootstrap. Supabase Auth returns `AuthApiError: Request rate limit reached`. The affected API requests then return a mix of 500 and 401 responses, `CompanyContext` clears the company/spaces/current-user state, and Presence unsubscribes.
2. **Unresolved authenticated data-read failure:** in an earlier run, `/api/users/list` returned six users while company and conversation reads failed before the first visible rate-limit log. The real PostgREST error is lost by current error serialization, so RLS/schema drift cannot yet be confirmed or excluded.

There is also an independent **critical credential-logging defect**: `useSession` logs the complete Supabase session object. The local Next.js development log currently contains live bearer/refresh credentials and user metadata. The credentials are deliberately omitted from this report.

Phase 4 should not start on top of this state. Add a short runtime stabilization gate (suggested “Phase 3.5”) to stop the auth storm, remove credential logging, preserve actionable server errors, and prove the authenticated read model with admin and member sessions.

## Reproduction and observed sequence

### Browser state

1. Complete Google OAuth as the admin.
2. Callback redirects to `/floor-plan`.
3. The page displays `0 spaces`, `0 online`, and `No spaces available`.
4. The Next.js overlay shows five issues:
   - messaging fetch error;
   - `Failed to load authenticated user profile`;
   - `/api/users/list` → 500 `Failed to fetch users`;
   - `Failed to get company`;
   - `/api/users/list` retry → 401 `UNAUTHORIZED`.
5. Presence initially reaches `SUBSCRIBED`, then is explicitly unsubscribed after `CompanyContext` clears the current user.

### Server/runtime evidence

On the clean login captured at approximately `00:08:20–00:08:23`:

- `CompanyContext` starts the same data load twice, 75 ms apart.
- Each load calls `syncUserProfile`.
- `AuthContext` independently calls `syncUserProfile` for the Google avatar.
- In development/Strict Mode this produced four `sync-profile` calls during the same bootstrap.
- The global Next proxy validates each request with `auth.getUser()`.
- Each authenticated route validates again with its own `auth.getUser()` / `requireAuthUser()`.
- After those profile calls, company, presence-users, and conversations requests fan out concurrently.
- Supabase Auth emits `Request rate limit reached` twice during the first failure wave and twice again during the retry wave.

The captured log contains eight rate-limit errors across two login/bootstrap attempts.

## Findings

### VO-RUNTIME-001 — P0 — Supabase session credentials are persisted in development logs

**Evidence**

`src/hooks/useSession.ts:81` logs `session` wholesale on every changed access token:

```ts
console.log(`Auth state changed: ${event}`, session);
```

The Next development log captured the access token, refresh token, session ID, provider identity, email, and user metadata. This is a real credential exposure even in local development because logs are persistent and may be copied into bug reports or agent/tool output.

**Impact**

- session/account takeover while the credentials remain valid;
- accidental credential disclosure in support/debug artifacts;
- violation of the remediation requirement for redacted structured observability.

**Required before further runtime work**

1. Revoke/rotate the exposed admin session (sign out all affected sessions is the safest option).
2. Remove the full-session log; allow only a redacted event name and opaque request/session correlation if needed.
3. Remove or securely scrub the contaminated local development log after preserving only sanitized evidence.
4. Add an automated guard that rejects logging fields such as `access_token`, `refresh_token`, JWTs, and auth-session IDs.

### VO-RUNTIME-002 — P0 — Login/bootstrap creates an Auth `getUser()` storm and hits the rate limit

**Evidence in code**

- `src/proxy.ts:39` calls `auth.getUser()` for every matched request.
- `src/proxy.ts:80` matches essentially every application and API path; `/api/**` is not excluded.
- `src/lib/auth/session.ts:67` calls `auth.getUser()` again inside authenticated routes.
- `src/app/api/users/sync-profile/route.ts:50` also calls `auth.getUser()` after the proxy already did so.
- `src/contexts/CompanyContext.tsx:126-134` starts company loading from an effect.
- `src/contexts/CompanyContext.tsx:70` performs profile sync as the first company-load step.
- `src/contexts/AuthContext.tsx:54-56` independently performs another Google profile sync.
- Development/Strict Mode executes the bootstrap effects twice, which is visible in the runtime log.

**Conservative lower-bound for the captured bootstrap**

- four `sync-profile` calls × proxy validation + route validation = eight Auth validations;
- two company requests × proxy + route = four validations;
- presence users + conversations × proxy + route = four validations;
- at least 16 Auth validations in roughly two seconds, excluding callback/proxy work and retries.

**Impact**

- valid users become transiently unauthorized;
- route failures alternate between 500 and 401;
- the company read model disappears;
- Presence unsubscribes and the floor plan becomes unusable;
- retries worsen the overload instead of recovering.

**Root-cause confidence:** high. The rate-limit error is explicit in the server log and aligns exactly with the request fan-out.

### VO-RUNTIME-003 — P1 — A company-read failure is converted into a false “empty office” state

**Evidence**

`CompanyContext` treats any error in the sequential company → users → spaces chain as total failure and resets:

- `company = null`;
- `currentUserProfile = null`;
- `companyUsers = []`;
- `spaces = []`.

The floor plan then renders `No spaces available` instead of an authentication/data-load error. Presence also loses `currentUserId` and unsubscribes.

In the first captured attempt, Presence had already loaded six users while the company request failed; the UI still showed zero spaces and discarded the usable partial state.

**Impact**

- misleading user-facing diagnosis;
- no retry/re-auth affordance;
- one auxiliary failure (for example conversations) can coincide with and obscure the floor-plan failure;
- the UI cannot distinguish “company has no rooms” from “company could not be loaded”.

### VO-RUNTIME-004 — P1 — Server and client error handling destroys the root PostgREST/Auth error

**Evidence**

- Supabase `PostgrestError` values are plain structured objects, but multiple routes only preserve the message when `error instanceof Error`; otherwise they return a generic error.
- `/api/users/list` therefore returns only `Failed to fetch users` for structured Supabase failures.
- `/api/companies/get` returns `{ error: ... }`, while `getCompany()` reads `errorData.message`; the client always falls back to `Failed to get company`.
- Next's current object logging renders the relevant server errors as `{}`.

**Impact**

The earlier company/conversation failures cannot be classified from the existing evidence. Possible causes include session/cookie concurrency, RLS, PostgREST permissions, or live-schema drift. None should be claimed as root cause until the structured `code/message/details/hint/status` values are captured safely.

### VO-RUNTIME-005 — P1 — Current tests pass while the real bootstrap is broken

Focused verification result:

- 3 test files passed;
- 12 tests passed (`auth-session`, `users-list-route`, `spaces-get-route`).

These tests mock `requireAuthUser`, the Supabase server client, or the repository. They do not execute:

- proxy + route double validation;
- React Strict Mode bootstrap;
- duplicate profile synchronization;
- real Supabase Auth rate limits;
- authenticated company/users/spaces reads against the intended staging schema.

No matching test was found for the duplicate `loadCompanyData`/`syncUserProfile` behavior.

### VO-RUNTIME-006 — P2 — Duplicate profile synchronization is an unnecessary write/read dependency in page bootstrap

Both `AuthContext` and `CompanyContext` synchronize the same profile on login. Profile synchronization is also on the critical path before company/spaces can render.

Even without the global proxy duplication, this design increases Auth calls and makes the read-only floor-plan bootstrap depend on a service-role-backed profile mutation endpoint. It should be idempotent and deduplicated at the client/session boundary, and ordinary page rendering should use an authenticated read path after profile provisioning has completed once.

## Relationship to Phase 3

The Phase 3 commit adds the atomic transition/write-gate infrastructure and keeps the new movement path inactive by design. The failing browser paths are the legacy company, users-list, conversations, and session bootstrap paths.

Static diff review found:

- Phase 3 did **not** add the global proxy, `useSession`, `AuthContext`, `CompanyContext`, or `sync-profile` behavior.
- The Phase 3 change to `requireAuthUser` only added an optional pre-database-operation callback; existing callers without that callback retain the same flow.
- No new Phase 3 presence location/snapshot endpoint was observed in the failing UI bootstrap.

Therefore Phase 3 is not proven to be the direct origin of VO-RUNTIME-001/002/003/006. The failures are pre-existing bootstrap/auth architecture exposed during Phase 3 runtime verification. Phase 3 should remain `pending user confirmation` because its runtime acceptance evidence is not valid while the app cannot load the authenticated floor plan.

## Required stabilization gate before Phase 4

Suggested “Phase 3.5 — authenticated bootstrap and read-model stabilization” exit gate:

1. Remove credential/session-object logging and rotate the exposed session.
2. Ensure one server-side Auth validation per incoming request boundary; do not validate the same API request independently in both global proxy and route without a documented reason.
3. Deduplicate profile provisioning/synchronization across Auth and Company contexts and prove Strict Mode behavior.
4. Decouple floor-plan reads from repeated profile mutation.
5. Preserve structured, redacted Auth/PostgREST errors server-side and normalize the API error envelope (`error`, `code`, `details`, correlation ID).
6. Make the UI distinguish unauthenticated, rate-limited, company-load error, and genuinely empty-company states.
7. Against the intended staging project, capture one admin and one member bootstrap with:
   - Auth request count;
   - endpoint status and correlation IDs;
   - company/users/spaces counts;
   - session/channel state;
   - zero credentials in logs.
8. Add an integration/E2E regression that fails if a single login triggers duplicate profile sync or exceeds the agreed Auth-validation budget.
9. Read back the staging migration/catalog state before interpreting any remaining data-read error as RLS. The Phase 0 handoff already records unresolved live migration-history reconciliation.

## Acceptance scenarios to run after stabilization

1. Admin cold login → floor plan shows the existing rooms without manual reload.
2. Admin reload → no duplicate profile sync; no Auth rate limit; Presence remains subscribed.
3. Member password login in an isolated browser → same company rooms visible.
4. Admin + member simultaneously → each appears once; no ghost users; no cross-account state.
5. Force company endpoint 401 → explicit re-auth state, not `No spaces available`.
6. Force company endpoint 500 → explicit retryable data error; Presence state is not silently reclassified as an empty office.
7. Inspect browser and server logs → no access token, refresh token, JWT, auth-session ID, password, or user metadata dump.

## Current conclusion

The current blocker is upstream of Knock/Phase 4. The app must first regain a stable authenticated bootstrap and trustworthy read-model/error evidence. Continuing to Phase 4 now would make Knock diagnostics unreliable and would likely add more authenticated fan-out to an already rate-limited path.

**Status: Pending user confirmation**
