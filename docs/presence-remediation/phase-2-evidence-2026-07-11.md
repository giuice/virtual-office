# Phase 2 evidence — Per-tab connection leases (2026-07-11)

Status: **Pending user confirmation.**
Implementation spec: `phase-2-implementation-spec-2026-07-11.md` (decisions layer over the handoff).

## What shipped

### Migration (canonical, `supabase/migrations/`)
`20260711043942_phase2_presence_session_leases.sql`:

- `pg_cron` extension installed (local PG 15.8, preloaded in the Supabase image).
- Role `presence_maintenance_owner NOLOGIN NOINHERIT NOBYPASSRLS` — reapplication verifies
  attributes and raises instead of altering an unexpected existing role. Memberships used only
  transiently inside the migration (see "Platform findings").
- `public.user_presence_sessions` + 5 indexes and `public.revoked_presence_auth_sessions` —
  handoff shapes verbatim (lines 552–626), ENABLE + FORCE RLS, `REVOKE ALL` from
  PUBLIC/anon/authenticated, `SELECT`-only grant to `service_role`, named
  `presence_maintenance_owner` policies per command.
- Narrow column grants to the role: users SELECT(id, company_id, supabase_uid, current_space_id,
  location_version, presence_access_revision) + UPDATE(current_space_id, location_version);
  spaces SELECT(id, presence_access_revision) + UPDATE(updated_at) (row-lock capability only,
  never written); space_presence_log SELECT + UPDATE(exited_at). Named policies on each
  RLS-enabled table.
- Functions (all SECURITY DEFINER, `search_path = pg_catalog`, fully qualified, owned by
  `presence_maintenance_owner`, REVOKE-then-narrow-GRANT):
  - `public.register_presence_session(user, auth_session, registration)` → service_role only.
    User-first `FOR NO KEY UPDATE` lock, fence check, duplicate `(user, registration_id)` lock,
    op time captured after locks, idempotent active same-auth-session refresh, retired/expired
    duplicate → `SESSION_RETIRED` unchanged, cross-auth-session duplicate →
    `REGISTRATION_CONFLICT`. New rows: server-generated id, company from the locked user row,
    NULL placement/revision fields, 90-second expiry.
  - `public.heartbeat_presence_session` / `public.disconnect_presence_session` → service_role
    only. Fence check, session-row lock, user+auth-session match (mismatch and missing are the
    same `SESSION_RETIRED` — no enumeration side channel), boundary equality = expired, retired
    rows never reactivate. Disconnect stamps `retired_at = expires_at = op`, reason
    `explicit-disconnect`, preserves placement fields; replay returns `alreadyDisconnected: true`
    with the original time; late disconnect after expiry changes nothing.
  - `private.is_presence_auth_session_unfenced()` → authenticated + service_role. Reads verified
    request claims via `current_setting('request.jwt.claims', true)` (same source `auth.jwt()`
    wraps — see "Platform findings"), validates `session_id` as UUID, maps `sub` → app user by
    `supabase_uid`, false-closed on any missing/malformed input.
  - `public.retire_expired_presence_sessions()` → postgres only. Sets `retired_at = expires_at`
    exactly (bounded evidence; never cleanup time).
  - `public.reconcile_stale_presence_placements()` → postgres only. Candidate select without
    locks (≤100, UUID order) → user locks → space `FOR SHARE` locks → session locks → op time →
    re-evaluation of every active/evidence predicate under locks → clears placement, bumps
    location_version, nulls session placement fields, closes open logs. **Created and tested;
    its cron job is intentionally NOT scheduled** (legacy writer still creates placements
    without lease evidence).
  - `public.purge_presence_history()` v1 → postgres only. SKIP LOCKED batches ≤1000; deletes
    retired sessions >24h; confirms a fence only on verified `auth.sessions` absence
    (`purge_after = confirmation + 1800s token TTL + 7 days`); deletes a fence only when
    confirmed, past `purge_after`, AND a fresh absence check passes. Session/fence retention
    only — no Phase 3 tables referenced.
  - `private.presence_auth_session_absent(auth_session_id, app_user_id)` → boolean bridge to
    `auth.sessions` (see "Platform findings").
- Cron (unschedule-before-schedule; username `postgres`; constant fully-qualified commands):
  `presence-retire-sessions-v1` every minute, `presence-purge-history-v1` daily 03:30 UTC.
  `presence-reconcile-placement-v1` absent by design until Phase 10.

### Server
- `src/lib/presence/verified-session.ts` — `requireVerifiedPresenceAuth()`: verified claims via
  `supabase.auth.getClaims()` (supabase-js ^2.97), `session_id` claim validated as UUID
  (missing/malformed → 401, operational warn), app user via
  `SupabaseUserRepository(admin).findBySupabaseUid(sub)`, fence pre-check (optimization; RPCs
  re-check transactionally).
- `src/lib/presence/session-schemas.ts` — strict zod bodies (a `sessionId` key in the register
  body is rejected) + RPC result schemas + RPC→HTTP map (401 revoked / 403 no-company /
  404 user / 409 retired-conflict / 500 sanitized).
- Routes: `POST /api/presence/sessions`, `POST /api/presence/sessions/[sessionId]/heartbeat`
  (ignores body), `POST /api/presence/sessions/[sessionId]/disconnect` (never reads the body —
  sendBeacon `text/plain` and empty bodies trivially accepted). All errors sanitized
  (`PRESENCE_SESSION_ERROR`), no DB details leak.

### Client
- `src/hooks/usePresenceSession.ts` (new) — lazy `crypto.randomUUID()` registration nonce (never
  persisted), register on auth, 30s heartbeat **only after** registration success,
  `SESSION_RETIRED` → exactly one nonce rotation per cycle (double retirement stops with a
  warning; Strict-Mode-safe via persistent refs + in-flight guards), visible/`pageshow`/`online`
  → immediate heartbeat + `['user-presence']` invalidation (handoff-mandated reconciliation),
  `pagehide`/`beforeunload` → session-scoped disconnect beacon with `fetch keepalive` fallback,
  unmount cleanup never disconnects, user-switch/logout clears state without a beacon.
- `src/contexts/PresenceContext.tsx` — `usePresenceSession(currentUserId)` mounted in the root
  `PresenceProvider` (layout-level: every authenticated route participates). Context value shape
  unchanged.
- `src/hooks/useUserPresence.ts` — whole-user `offline: true` beacon (`sendUnloadPresenceUpdate`)
  DELETED. `vo-disconnect-timestamp` writes and all other behavior preserved.

### Tests
- `__tests__/presence-db/session-leases.test.ts` (real local Postgres + real GoTrue JWTs):
  RLS/priv denials (anon + authenticated on both tables; authenticated cannot execute any of the
  7 functions), register/heartbeat/disconnect semantics incl. boundary equality and byte-identical
  no-mutation checks, retire/reconcile/purge behavior as postgres, fence confirm/delete paths
  against real `auth.sessions`, `is_presence_auth_session_unfenced` under
  `SET LOCAL ROLE authenticated` + injected claims, catalog assertions (role attrs, zero
  memberships in both directions, owner/prosecdef/search_path/EXECUTE grants per function, cron
  rows exact incl. reconcile-job absence).
- `__tests__/api/presence-sessions-route.test.ts` — 28 tests (auth, claim validation, strict
  schema, fence pre-check, full RPC→HTTP map, text/plain disconnect, sanitized 500s).
- `__tests__/presence-session-hook.test.tsx` — fake-timer hook tests (heartbeat gating/cadence,
  single rotation cycle, Strict Mode, beacon + keepalive fallback, visibility reconciliation,
  cleanup).
- `__tests__/presence-db/harness.test.ts` updated: policy count 7 → 13 and a new assertion that
  all 6 added policies are scoped to `presence_maintenance_owner` (no browser-facing policy came
  back).
- `__tests__/presence-db/fixtures.ts` — cleanup extended to sessions/fences in FK order; namespace
  tag pattern fixed to match mid-string tags.

## Exit-gate readback (handoff lines 1531–1539)

| Exit-gate requirement | Proof (test in `session-leases.test.ts` unless noted) |
|---|---|
| Two-tab test: closing one session leaves the other active | case f (two sessions, same user+auth session, different nonces; disconnect one → other still active, active count = 1) |
| Expired session no longer counts without cleanup job execution | case e (predicate `expires_at > clock_timestamp()` excludes the row before `retire_expired_presence_sessions()` runs) |
| Client cannot register/heartbeat/disconnect another user's session | cases b/c (cross-user heartbeat/disconnect → `SESSION_RETIRED`, row byte-identical); route layer derives ids from verified claims only (API tests) |
| Session creation cannot choose server id/space/company/user/auth binding/timestamps | case a (RPC has no such params; row values asserted server-generated); strict zod body rejects `sessionId` (API test) |
| Re-register/heartbeat at expiry boundary does not refresh the retired row or extend evidence | cases b/d (boundary `expires_at = now` → `SESSION_RETIRED`, row unchanged; retired duplicate registration unchanged, rotation required) |
| Late disconnect after expiry does not stamp a new retirement time | case c (expired row → `SESSION_RETIRED`, timestamps unchanged; cron-retired row keeps `retired_at = expires_at`) |
| Fenced auth session cannot register/heartbeat; unfenced sessions for the same user independent | case h (fence row → `AUTH_SESSION_REVOKED` on register+heartbeat; second unfenced auth session for the same user registers and heartbeats normally) |

Red→green: with the Phase 2 migration removed and a clean `db reset`, the presence-db suite
fails (3 files failed: harness policy counts revert, session-leases setup cannot find the
tables/functions — 2 explicit failures + 19 unable to run). With the migration restored and a
clean `db reset` from the committed set: **3 files, 21/21 pass** (bootstrap-from-clean proven).

Full verification: `npm run test:presence-db` 21/21 · targeted presence regression sweep
(location route, presence-utils, realtime-presence, presence-animation, knock-auto-join, new API
+ hook suites) 90/90 · `npm run type-check` clean · `npm run lint` 0 errors (571 pre-existing
warnings elsewhere) · full unit suite run (excl. playwright) — see final report.

## Platform findings (deviations from the handoff's letter, with rationale)

1. **`postgres` is not superuser (local and hosted).** Function ownership transfer to
   `presence_maintenance_owner` requires (a) transient role membership and (b) transient
   `CREATE` on the target schemas. Both are granted at the top/middle of the migration and
   revoked in the same migration; final state is asserted by catalog tests (zero memberships in
   both directions, no schema CREATE).
2. **`postgres` cannot grant `USAGE` on schema `auth`** (holds it without grant option), so the
   handoff's direct `auth.sessions` SELECT grant to the maintenance role cannot be installed.
   Platform-specific narrow design instead: `private.presence_auth_session_absent(uuid, uuid)`,
   SECURITY DEFINER **owned by postgres** (which holds grantable SELECT on `auth.sessions`),
   returns only a boolean, EXECUTE granted only to `presence_maintenance_owner`. Strictly
   narrower than the mandated grant (no row data ever crosses); not a BYPASSRLS role, login
   role, inline dynamic SQL, or broad service-role grant. Same reason
   `is_presence_auth_session_unfenced` reads `request.jwt.claims` directly instead of calling
   `auth.jwt()`.
3. **Policy identifier length**: `presence_maintenance_owner_revoked_presence_auth_sessions_*`
   exceeds 63 chars; shortened to `pmo_revoked_auth_sessions_{select,update,delete}`.

**Staging validation required before `db push`** (from the RLS review): confirm hosted `postgres`
can read `auth.sessions`, or nightly purge will fail silently and fences will never purge:

```sql
select has_table_privilege('postgres', 'auth.sessions', 'SELECT');
-- then exercise: insert a dummy fence and call public.purge_presence_history();
```

## Accepted interim tradeoffs (flagged for explicit user sign-off)

1. **Legacy capacity ghost window (Phase 2 → Phase 3).** The handoff's Phase 2 checklist
   explicitly removes the whole-user `offline: true` beacon, but the legacy
   `/api/users/location` capacity check (intentionally untouched until Phase 3) still counts
   occupants by `current_space_id + status <> 'offline'`. With the beacon gone, a tab closed
   without explicit leave/sign-out keeps `status='online'` in the DB, so the legacy capacity
   count can accumulate ghosts until Phase 3 moves capacity into the atomic transaction counting
   **active leases**. Client-side rendering is unaffected (derived status). Explicit sign-out
   still writes offline via AuthContext. This window is inherent to the handoff's phase
   ordering; deploying Phase 2 to production without Phase 3 widens ghost-capacity exposure —
   recommendation: keep staging-only until Phase 3 lands.
2. **`db reset` local flakiness**: `supabase db reset` intermittently fails with
   `error running container: exit 1` (~50%) and succeeds on retry; also Kong occasionally needs
   a restart after reset before GoTrue admin calls succeed (502s otherwise). Infra quirk of the
   local stack, not migration-related (migrations apply identically on the successful run).

## Review trail

- Codex adversarial review (medium effort): 1 major finding — permanent
  `GRANT presence_maintenance_owner TO postgres` violated the handoff's no-login-role rule →
  fixed (transient grant + revoke, new both-directions membership catalog assertion). All other
  attack angles (lease extension, browser boundary, lock order, HTTP identity, client loop)
  reported sound.
- `supabase-rls-reviewer`: no exploitable findings; confirmed id-vs-supabase_uid mapping, RLS
  completeness, definer hygiene, cron hygiene. Raised the staging `auth.sessions` validation
  above and noted `migrations/database-structure.md` is stale (predates Phase 0/1 columns).
- `presence-safety-reviewer`: blocker = interim tradeoff #1 above (documented, not code-fixable
  in Phase 2 scope); risk fix applied (`ensureRegistrationId()` moved inside try so a
  `crypto.randomUUID` throw cannot permanently wedge registration); noted the new
  focus-reconciliation invalidation is handoff-mandated and supersedes the legacy skill's
  "don't invalidate" guidance.
