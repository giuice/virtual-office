---
phase: 03-video-and-screen-sharing
plan: 09
subsystem: api
tags: [nextjs, supabase, presence, webrtc, zod, screen-sharing]

requires:
  - phase: 03-video-and-screen-sharing
    plan: 08
    provides: base screen-share lease and private media RLS contract
provides:
  - strict Zod validation for screen-share HTTP, RPC, and Realtime signaling boundaries
  - authenticated claim, release, and active screen-share API routes over observed lease RPCs
  - PostgreSQL-compatible Unicode code-point presenter-name decoding
  - sanitized canonical presenter responses with stable conflict and retry contracts
affects: [screen-share-client, realtime-signaling, floor-plan-stage]
tech-stack:
  added: [zod@4.4.3]
  patterns:
    - validate path, body, query, RPC result, and signaling payloads at each untrusted boundary
    - derive Auth subject, application user, company, and session fencing from verified server state
    - use one locked observed RPC as the sole presenter-name authority for each claim or active response
    - trim and count presenter names as Unicode code points to match PostgreSQL char_length
    - retry only one exact strict RETRY_LOCK_SET result in a fresh PostgREST transaction
key-files:
  created:
    - src/lib/webrtc/screen-share-contract.ts
    - src/app/api/spaces/[id]/screen-share/claim/route.ts
    - src/app/api/spaces/[id]/screen-share/release/route.ts
    - src/app/api/spaces/[id]/screen-share/active/route.ts
    - __tests__/api/screen-share-routes.test.ts
    - __tests__/api/verified-presence-session.test.ts
  modified:
    - src/lib/presence/verified-session.ts
    - package.json
    - package-lock.json
key-decisions:
  - Claim and active presenterName values come only from their single locked observed RPC result; routes perform no service-role users lookup or final enrichment RPC.
  - Presenter-name validation trims and enforces one through 100 Unicode code points, matching PostgreSQL char_length rather than UTF-16 code units.
  - A static companyId:null is pre-RPC MEMBERSHIP_SCOPE_INVALID (403); a membership or session change after the verified snapshot is a locked SESSION_INVALID (409).
  - Retry exactly one fully strict RETRY_LOCK_SET structural result; provider errors and malformed payloads are never retried.
metrics:
  completed: 2026-07-23
status: complete
---

# Phase 03 Plan 09: Validated Screen-share API Boundary Summary

**Screen-share routes decode canonical names from one locked RPC and use the same Unicode code-point limit as PostgreSQL.**

## What Changed

### Application

- The shared presenter-name schema trims input, rejects empty values, and limits `Array.from(name).length` to 100. It has no conflicting UTF-16 `.max(100)` check.
- Claim and active responses consume `presenterName` from one locked observed RPC result. Neither route uses a service-role `users` lookup or a final enrichment/reauthorization RPC.
- The bounded retry utility retries only the exact strict `{ok:false,code:'RETRY_LOCK_SET'}` result once in a fresh transaction. A second structural result is sanitized `SERVICE_UNAVAILABLE` (503); malformed payloads and provider errors do not retry.
- The static no-company identity path returns `MEMBERSHIP_SCOPE_INVALID` (403) before any RPC. A post-snapshot locked membership or session invalidation returns `SESSION_INVALID` (409).

### Database

- Migration `20260723224547_screen_share_atomic_presenter_contract.sql` was written and applied/read back only on disposable local Supabase. Local migration history therefore changed.
- This correction does not edit SQL or migration files. The already-written migration changed local history when it was applied; no migration history was altered during this correction.
- No online database target was queried or changed.

### Deployment

- No deployment occurred.
- The application must not be deployed to a target until both screen-share migrations, including `20260723224547`, are applied to that target and read back there.

## Evidence and Scope

- HTTP contract evidence covers canonical ASCII/whitespace boundaries plus 51, 100, and 101 astral-emoji presenter names. A successful 100-code-point RPC payload decodes and returns publicly; 101 code points fail closed as `DATABASE_CONTRACT_INCOMPATIBLE` (426).
- Real local Postgres evidence covers atomic presenter-name lock ordering and profile boundaries: a held invalid rename yields `PRESENTER_PROFILE_INVALID` with no live lease, a held active rename returns the canonical committed name, 100 emoji claims succeed, and 101 emoji claims return `PRESENTER_PROFILE_INVALID` with no live lease.
- The local real-Postgres suite does not prove repeated two-claim convergence or deadlock freedom. Wave 5 / 03-02 owns repeated barrier and fresh-transaction evidence for that behavior.
- Mocked route tests prove HTTP parsing, strict decode, identity derivation, invariant checks, retry classification, and error sanitization. They do not prove RLS, database concurrency, Realtime delivery, P2P media, an online database, or a deployment.

## Verification

Focused checks currently retained for this correction:

- `npm test -- --run __tests__/api/screen-share-routes.test.ts __tests__/api/verified-presence-session.test.ts` — 81 tests passed (80 route plus one verified-session).
- `npm run test:presence:db -- __tests__/presence-db/screen-share-lease.test.ts` — 9 local real-Postgres tests passed.

- `npm test -- --run __tests__/api/screen-share-routes.test.ts __tests__/api/verified-presence-session.test.ts __tests__/api/presence-location-route.test.ts __tests__/api/presence-logout-route.test.ts __tests__/api/presence-sessions-route.test.ts __tests__/api/presence-snapshot-route.test.ts` — 158 affected Presence API tests passed.
- `npm run type-check` — passed.
- Focused ESLint for the changed TypeScript files — passed.
- `npm run presence:gate` — passed.

- Primary-checkout `npm run build` — passed with all three screen-share routes in the Next.js production output.
- Primary-checkout `npm test` — 103 test files and 1,133 tests passed.
- Final independent Presence Safety, Supabase/RLS, and Sol adversarial reviews — no material findings after the Unicode/dependency corrections.
- Wave capability gates — schema drift and UI safety passed; codebase drift emitted a non-blocking advisory because no current mapping baseline covers 1,654 structural elements, with no mapper requested.

## Decisions Made

- Original server-verified Auth subjects remain distinct from application user IDs and are passed to the observed RPC boundary without client-selected authority.
- A schema-valid RPC result with a mismatched `shareId` or `spaceId` must reach the explicit route invariant and return sanitized compatibility failure; fixtures that omit `presenterName` only test schema rejection and are not substitutes.

## Deviations from Plan

### Corrections

- Corrected stale documentation that described a service-role presenter lookup/final enrichment and an unchanged local migration history. The current implementation has neither lookup path, and migration `20260723224547` was applied/read back locally only.
- Removed any implication that current real-Postgres tests establish the repeated two-claim Wave 5 convergence/deadlock proof.

## Known Stubs

None.

## Next Phase Readiness

- Screen-share clients can rely on strict claim/release/active response contracts once the target database has both required migrations.
- Repeated two-claim barrier/fresh-transaction convergence and deadlock evidence remains required before closing Wave 5.
