# Phase 2 Implementation Spec — Per-Tab Connection Leases (2026-07-11)

Authority: `docs/presence-safety-remediation-handoff-2026-07-09.md` (the handoff). This spec fixes
the decisions the handoff leaves open. On any conflict, the handoff wins; stop and flag it.

Normative handoff sections (read them, do not work from this summary alone):

- Lines 548–639: `user_presence_sessions` + `revoked_presence_auth_sessions` exact shapes/indexes/security.
- Lines 641–713: maintenance principal, timing constants, session semantics, `register_presence_session`, cleanup functions, cron ownership table.
- Lines 1137–1165: session endpoints contract (register/heartbeat/disconnect only; logout is Phase 3).
- Lines 1517–1539: Phase 2 checklist + exit gate.

Phase 2 boundaries (hard):

- NO `location_transition_requests`, NO idempotency table, NO knock-expiry cron, NO logout endpoint,
  NO `confirm_presence_auth_session_revoked`, NO snapshot RPC. Those are Phase 3/4.
- `presence-reconcile-placement-v1` cron job is NOT scheduled. Function is created and tested only.
- Legacy `/api/users/location` (incl. its `offline: true` branch) stays untouched server-side.

## 1. Migration — `supabase/migrations/20260711043942_phase2_presence_session_leases.sql`

Style: follow Phase 1 migrations (uppercase SQL keywords, explanatory comments only where a
constraint is invisible in code, REVOKE-then-narrow-GRANT pattern). Everything fully qualified.

Order of sections:

1. `CREATE EXTENSION IF NOT EXISTS pg_cron;`
2. Role (reapplication-safe, verify-don't-alter):
   ```sql
   DO $$
   DECLARE r pg_catalog.pg_roles%ROWTYPE;
   BEGIN
       SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname = 'presence_maintenance_owner';
       IF NOT FOUND THEN
           CREATE ROLE presence_maintenance_owner NOLOGIN NOINHERIT NOBYPASSRLS;
       ELSIF r.rolcanlogin OR r.rolinherit OR r.rolbypassrls OR r.rolsuper
           OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN
           RAISE EXCEPTION 'presence_maintenance_owner exists with unexpected attributes';
       END IF;
   END $$;
   ```
3. Schema/column grants to `presence_maintenance_owner`:
   - `GRANT USAGE ON SCHEMA public, private, auth TO presence_maintenance_owner;`
   - `GRANT SELECT (id, user_id) ON auth.sessions TO presence_maintenance_owner;`
   - users: `GRANT SELECT (id, company_id, supabase_uid, current_space_id, location_version, presence_access_revision), UPDATE (current_space_id, location_version) ON public.users TO presence_maintenance_owner;`
   - spaces: `GRANT SELECT (id, presence_access_revision), UPDATE (updated_at) ON public.spaces TO presence_maintenance_owner;`
     -- UPDATE(updated_at) exists ONLY so reconcile can take FOR SHARE row locks (Postgres requires
     -- UPDATE privilege for row locks); the function never updates spaces. Comment this in SQL.
   - space_presence_log: `GRANT SELECT, UPDATE (exited_at) ON public.space_presence_log TO presence_maintenance_owner;`
   - Named RLS policies for the role on RLS-enabled tables it touches (users, spaces,
     space_presence_log — check `relrowsecurity` first; add policy only where RLS is enabled):
     `presence_maintenance_owner_<table>_<cmd>` USING (true) [WITH CHECK (true)], `TO presence_maintenance_owner`,
     for exactly the commands granted above.
4. Tables: `public.user_presence_sessions` and `public.revoked_presence_auth_sessions` — copy the
   handoff SQL (lines 552–626) VERBATIM, including CHECK constraints and the 5 indexes.
5. Table security:
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;` (both tables)
   - `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated;` (both)
   - `GRANT SELECT ON public.user_presence_sessions TO service_role;`
     `GRANT SELECT ON public.revoked_presence_auth_sessions TO service_role;`
     (service_role has BYPASSRLS; all writes go through functions)
   - presence_maintenance_owner grants + named policies:
     - user_presence_sessions: SELECT, INSERT, UPDATE, DELETE (register/retire/reconcile/purge)
     - revoked_presence_auth_sessions: SELECT, UPDATE (auth_session_absence_confirmed_at, purge_after), DELETE
6. Functions. ALL of them: `SECURITY DEFINER`, `SET search_path = pg_catalog`, fully qualified
   object references, `ALTER FUNCTION ... OWNER TO presence_maintenance_owner;`,
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` then exact grants. plpgsql.

   ### 6a. `public.register_presence_session(p_user_id uuid, p_auth_session_id uuid, p_registration_id uuid) RETURNS jsonb`
   GRANT EXECUTE TO service_role ONLY.
   Exact order (handoff line 676):
   1. `SELECT id, company_id FROM public.users WHERE id = p_user_id FOR NO KEY UPDATE` — not found → `{ok:false, code:'USER_NOT_FOUND'}`.
   2. `company_id IS NULL` → `{ok:false, code:'NO_COMPANY'}`.
   3. Fence: `EXISTS (SELECT 1 FROM public.revoked_presence_auth_sessions WHERE auth_session_id = p_auth_session_id AND user_id = p_user_id)` → `{ok:false, code:'AUTH_SESSION_REVOKED'}`.
   4. `SELECT * FROM public.user_presence_sessions WHERE user_id = p_user_id AND registration_id = p_registration_id FOR UPDATE` (0 or 1 row via unique constraint).
   5. `v_op := pg_catalog.clock_timestamp();` (captured AFTER locks).
   6. Duplicate row exists:
      - `retired_at IS NOT NULL OR expires_at <= v_op` → `{ok:false, code:'SESSION_RETIRED'}` — row UNCHANGED (boundary equality = expired).
      - active AND `auth_session_id <> p_auth_session_id` → `{ok:false, code:'REGISTRATION_CONFLICT'}`.
      - active AND same auth session → idempotent refresh: `last_seen_at = v_op, expires_at = v_op + interval '90 seconds'`; return same id, `refreshed: true`, PRESERVE space/placement/revision fields.
   7. No duplicate: INSERT (server-generated id via default, company_id from step 1, all space/
      placement/revision fields NULL, `connected_at/last_seen_at = v_op`, `expires_at = v_op + interval '90 seconds'`).
   8. Success return: `{ok:true, sessionId, registrationId, sessionSpaceId, expiresAt, refreshed}`
      (jsonb keys exactly these; timestamps as ISO strings via `to_jsonb`).

   ### 6b. `public.heartbeat_presence_session(p_user_id uuid, p_auth_session_id uuid, p_session_id uuid) RETURNS jsonb`
   GRANT EXECUTE TO service_role ONLY.
   1. Fence check (same as above) → `{ok:false, code:'AUTH_SESSION_REVOKED'}`.
   2. `SELECT ... FROM public.user_presence_sessions WHERE id = p_session_id FOR UPDATE`.
   3. Missing row, `user_id <> p_user_id`, or `auth_session_id <> p_auth_session_id` → `{ok:false, code:'SESSION_RETIRED'}` (no info leak, NO mutation).
   4. `v_op := clock_timestamp()`; `retired_at IS NOT NULL OR expires_at <= v_op` → `{ok:false, code:'SESSION_RETIRED'}` — row UNCHANGED (a heartbeat at/after expiry never reactivates or extends).
   5. Else `last_seen_at = v_op, expires_at = v_op + interval '90 seconds'`; return `{ok:true, expiresAt}`.

   ### 6c. `public.disconnect_presence_session(p_user_id uuid, p_auth_session_id uuid, p_session_id uuid) RETURNS jsonb`
   GRANT EXECUTE TO service_role ONLY.
   1. Fence check → AUTH_SESSION_REVOKED.
   2. Lock row; missing/mismatched user or auth session → `{ok:false, code:'SESSION_RETIRED'}`.
   3. `v_op := clock_timestamp()`.
   4. `retired_at IS NOT NULL AND retirement_reason = 'explicit-disconnect'` → `{ok:true, retiredAt: <existing>, alreadyDisconnected: true}` — NOTHING changes.
   5. `retired_at IS NOT NULL` (other reason) OR `expires_at <= v_op` → `{ok:false, code:'SESSION_RETIRED'}` — no timestamp changes (late disconnect cannot stamp new retirement).
   6. Active: `retired_at = v_op, retirement_reason = 'explicit-disconnect', expires_at = v_op`;
      PRESERVE space/placement/revision fields (grace evidence). Return `{ok:true, retiredAt, alreadyDisconnected:false}`.

   ### 6d. `private.is_presence_auth_session_unfenced() RETURNS boolean`
   GRANT EXECUTE TO authenticated, service_role (NOT PUBLIC, NOT anon).
   No arguments. Reads verified request claims only:
   - `v_sub := nullif(auth.jwt() ->> 'sub', '')`; `v_sid_text := nullif(auth.jwt() ->> 'session_id', '')`.
   - Missing either claim → false. Non-UUID `session_id` → false (catch cast exception).
   - Map app user: `SELECT id FROM public.users WHERE supabase_uid = v_sub` — missing → false.
   - Return `NOT EXISTS (SELECT 1 FROM public.revoked_presence_auth_sessions WHERE user_id = <app id> AND auth_session_id = v_sid)`.

   ### 6e. `public.retire_expired_presence_sessions() RETURNS integer`
   GRANT EXECUTE TO postgres ONLY.
   Single statement: `UPDATE public.user_presence_sessions SET retired_at = expires_at, retirement_reason = 'expired' WHERE retired_at IS NULL AND expires_at <= pg_catalog.clock_timestamp();`
   Return affected count. `retired_at = expires_at` exactly — never the cleanup time (bounded evidence).

   ### 6f. `public.reconcile_stale_presence_placements() RETURNS integer`
   GRANT EXECUTE TO postgres ONLY. Created and tested in Phase 2; its cron job is NOT scheduled.
   1. Candidates, NO row locks, `ORDER BY u.id LIMIT 100`: users where `current_space_id IS NOT NULL`
      AND no active session (`retired_at IS NULL AND expires_at > clock_timestamp()`)
      AND no evidence session for the current space:
      ```sql
      NOT EXISTS (SELECT 1 FROM public.user_presence_sessions s
        WHERE s.user_id = u.id AND s.space_id = u.current_space_id
          AND s.placement_version = u.location_version
          AND s.user_access_revision = u.presence_access_revision
          AND s.space_access_revision = sp.presence_access_revision
          AND pg_catalog.coalesce(s.retired_at, s.expires_at) >= pg_catalog.clock_timestamp() - INTERVAL '5 minutes')
      ```
      (`sp` = the user's current space, joined.)
   2. Lock candidate user rows in UUID order (`FOR NO KEY UPDATE`), then referenced space rows in
      UUID order (`FOR SHARE`), then their session rows (`FOR UPDATE`).
   3. `v_op := clock_timestamp()` AFTER all locks; re-evaluate the full predicate per user under locks; SKIP recovered users.
   4. For each still-stale user: `UPDATE public.users SET current_space_id = NULL, location_version = location_version + 1`;
      `UPDATE public.user_presence_sessions SET space_id = NULL, placement_version = NULL, user_access_revision = NULL, space_access_revision = NULL WHERE user_id = u`;
      `UPDATE public.space_presence_log SET exited_at = v_op WHERE user_id = u AND exited_at IS NULL`.
   5. Return count of users cleared.

   ### 6g. `public.purge_presence_history() RETURNS jsonb`
   GRANT EXECUTE TO postgres ONLY. v1: knows ONLY sessions + fences (no transition table).
   Batches of at most 1000 rows per table per invocation, `FOR UPDATE SKIP LOCKED` subselect pattern.
   1. Delete retired sessions: `retired_at IS NOT NULL AND pg_catalog.coalesce(retired_at, expires_at) < v_op - INTERVAL '24 hours'`.
   2. Confirm unconfirmed fences: for each batch row, confirm ONLY when
      `NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = f.auth_session_id AND s.user_id::text = (SELECT u.supabase_uid FROM public.users u WHERE u.id = f.user_id))`
      → `auth_session_absence_confirmed_at = v_op, purge_after = v_op + INTERVAL '1800 seconds' + INTERVAL '7 days'`.
      -- 1800s = configured access-token TTL recorded in Phase 0 catalog (reviewed constant; NOT a parameter).
   3. Delete fences ONLY when `auth_session_absence_confirmed_at IS NOT NULL AND purge_after <= v_op` AND a FRESH `auth.sessions` absence check (same as above) still passes.
   4. Return `{retiredSessionsDeleted, fencesConfirmed, fencesDeleted}`.
   Never delete an unconfirmed fence. Elapsed time alone is never proof.

7. Cron (migration connection = `postgres`; unschedule-before-schedule so reapplication cannot duplicate):
   ```sql
   DO $$
   DECLARE j record;
   BEGIN
       FOR j IN SELECT jobid FROM cron.job WHERE jobname IN
           ('presence-retire-sessions-v1', 'presence-purge-history-v1', 'presence-reconcile-placement-v1')
       LOOP
           PERFORM cron.unschedule(j.jobid);
       END LOOP;
   END $$;
   SELECT cron.schedule('presence-retire-sessions-v1', '* * * * *', 'select public.retire_expired_presence_sessions();');
   SELECT cron.schedule('presence-purge-history-v1', '30 3 * * *', 'select public.purge_presence_history();');
   -- presence-reconcile-placement-v1 is INTENTIONALLY NOT scheduled until Phase 10 (legacy writer still active).
   ```

## 2. Server — verified identity helper, schemas, routes

New folder `src/lib/presence/` (kebab-case files).

### `src/lib/presence/verified-session.ts`
```ts
export interface VerifiedPresenceIdentity {
  appUserId: string;
  companyId: string | null;
  authSessionId: string;
}
export type VerifiedPresenceAuthResult =
  | { ok: true; identity: VerifiedPresenceIdentity; admin: SupabaseClient }
  | { ok: false; status: number; code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED' | 'USER_NOT_FOUND'; error: string };
export async function requireVerifiedPresenceAuth(): Promise<VerifiedPresenceAuthResult>
```
- `const supabase = await createSupabaseServerClient();` + `const admin = await createSupabaseServerClient('service_role');` (parallel, same as location route).
- `const { data, error } = await supabase.auth.getClaims();` — the VERIFIED claims path
  (supabase-js ^2.97 `getClaims()` validates the JWT; never `getSession()` alone, never manual decode).
- Reject when error/no claims → 401 UNAUTHORIZED.
- `sub` = claims.sub; `session_id` = claims.session_id — validate `session_id` with zod `z.string().uuid()`; missing/invalid → 401 UNAUTHORIZED (log an operational warning: verified session claim unavailable).
- App user via `new SupabaseUserRepository(admin).findBySupabaseUid(sub)` → missing → 404 USER_NOT_FOUND.
- Fence pre-check (optimization only; the RPCs re-check transactionally):
  `admin.from('revoked_presence_auth_sessions').select('auth_session_id').eq('user_id', appUser.id).eq('auth_session_id', sessionId).maybeSingle()` → row present → 401 AUTH_SESSION_REVOKED.

### `src/lib/presence/session-schemas.ts`
zod: `registerSessionBodySchema = z.object({ registrationId: z.string().uuid() })` (strict — reject unknown keys, and NEVER accept a `sessionId` key); `sessionIdParamSchema = z.string().uuid()`.
Response types: `RegisterSessionResponse { sessionId, registrationId, expiresAt, sessionSpaceId }`, etc.

### Routes (all POST, all start with `requireVerifiedPresenceAuth()`)
Error shape everywhere: `NextResponse.json({ error, code }, { status })` (project convention).
RPC → HTTP mapping (single shared map):
| RPC code | HTTP |
|---|---|
| ok:true | 200 |
| AUTH_SESSION_REVOKED | 401 |
| NO_COMPANY | 403 |
| USER_NOT_FOUND | 404 |
| SESSION_RETIRED | 409 |
| REGISTRATION_CONFLICT | 409 |
| rpc/transport error | 500 sanitized `{ error:'Presence session operation failed', code:'PRESENCE_SESSION_ERROR' }` |

- `src/app/api/presence/sessions/route.ts` — POST. JSON body → `registerSessionBodySchema` (400 `VALIDATION_ERROR` on failure). `admin.rpc('register_presence_session', { p_user_id, p_auth_session_id, p_registration_id })`. 200 body: `{ sessionId, registrationId, expiresAt, sessionSpaceId }`.
- `src/app/api/presence/sessions/[sessionId]/heartbeat/route.ts` — POST, empty body (ignore any body). Validate `sessionId` param uuid → 400. `admin.rpc('heartbeat_presence_session', ...)`. 200: `{ expiresAt }`.
- `src/app/api/presence/sessions/[sessionId]/disconnect/route.ts` — POST. MUST accept `text/plain` and empty bodies (sendBeacon cannot set content-type; never call `request.json()` unguarded — the body content is irrelevant, identity comes from cookies + path param). `admin.rpc('disconnect_presence_session', ...)`. 200: `{ retiredAt, alreadyDisconnected }`.
- Next.js 15: `params` is a Promise — `const { sessionId } = await params;`.

## 3. Client — `usePresenceSession`

### `src/hooks/usePresenceSession.ts` (new)
Signature: `usePresenceSession(currentUserId: string | null): { sessionId: string | null }`.
State machine held in refs + one `sessionId` state. Rules:

- `registrationIdRef`: lazily initialized with `crypto.randomUUID()` on first register attempt.
  NEVER stored in localStorage/sessionStorage. Rotation = assign a new `crypto.randomUUID()`.
- Register: `POST /api/presence/sessions` `{ registrationId }`. On 200 → store `sessionId`, start
  heartbeat interval (30_000 ms). On 409 `SESSION_RETIRED` → rotate nonce ONCE and retry ONCE per
  rotation cycle (a second consecutive `SESSION_RETIRED` stops with a console.warn — no loop).
  On other errors → retry with backoff (5s, 15s, 30s, then every 60s); no heartbeat until success.
- Heartbeat starts ONLY after successful registration. Every 30s: `POST /api/presence/sessions/{id}/heartbeat`.
  On 409 `SESSION_RETIRED` → stop interval, clear sessionId, rotate nonce, re-register (one cycle).
  On network failure → keep interval running (lease survives up to 90s).
- Listeners (window/document, added once while a user is signed in):
  - `visibilitychange` → visible, `pageshow`, `online`: immediate heartbeat (if registered) and
    `queryClient.invalidateQueries({ queryKey: ['user-presence'] })` as reconciliation.
    `pageshow` with `event.persisted` (bfcache): heartbeat; if it returns `SESSION_RETIRED`, rotate + re-register.
  - `pagehide` and `beforeunload`: send disconnect beacon
    `navigator.sendBeacon('/api/presence/sessions/${sessionId}/disconnect', '{}')`;
    if it returns false → `fetch(url, { method:'POST', keepalive:true })` (fire-and-forget).
    Do NOT clear local state (bfcache may restore the page).
- `currentUserId` becomes null → stop interval, remove listeners, clear sessionId (no beacon).
- React Strict Mode safe: double mount must NOT create two sessions or a rotation loop — the
  server's idempotent same-nonce refresh handles re-register; unmount cleanup only clears
  interval/listeners (never disconnects the session).
- No `Date.now()`-based authority decisions; the server owns expiry.

### `src/contexts/PresenceContext.tsx`
Call `usePresenceSession(currentUserId)` inside `PresenceProvider`, alongside `useUserPresence`.
Do not change the exposed context value shape.

### `src/hooks/useUserPresence.ts`
DELETE `sendUnloadPresenceUpdate` (lines ~28–45) and its call inside the `beforeunload` handler.
KEEP the `vo-disconnect-timestamp` localStorage writes and everything else (grace window is
untouched in Phase 2). The `offline: true` branch on the server stays (legacy clients).

## 4. Tests

### DB (`__tests__/presence-db/`, runs via `npm run test:presence-db`, real local Postgres)
Follow existing patterns: `fixtures.ts` (postgres pg client + namespace cleanup), `auth-clients.ts`
(real auth users + JWTs). Extend fixtures cleanup to delete `user_presence_sessions` and
`revoked_presence_auth_sessions` rows for namespaced users (FK order: sessions/fences before users).

New file `session-leases.test.ts`:
- RLS/priv: anon + authenticated clients cannot SELECT/INSERT/UPDATE/DELETE either new table;
  authenticated cannot EXECUTE any of the 6 new public functions (rpc → error); anon cannot execute
  `private.is_presence_auth_session_unfenced`.
- register (via service client rpc): creates row w/ server id + company + NULL space fields + ~90s
  expiry; client-supplied space/timestamps impossible (no such params — assert row values);
  active same-nonce re-register → same sessionId, `refreshed:true`, placement fields preserved;
  different auth_session_id (forge row as postgres, then rpc) → REGISTRATION_CONFLICT;
  fenced (insert fence as postgres) → AUTH_SESSION_REVOKED; retired duplicate → SESSION_RETIRED and
  row byte-identical (compare full row before/after).
- heartbeat: extends expires_at ~90s; boundary: `UPDATE ... SET expires_at = clock_timestamp()` as
  postgres → rpc → SESSION_RETIRED + row unchanged; cross-user (user B ids against user A session)
  → SESSION_RETIRED + row unchanged; retired row can never return to active.
- disconnect: retires with `explicit-disconnect`, `expires_at = retired_at`, placement preserved;
  repeat → `alreadyDisconnected:true` + original retirement time; late (already expired/cron-retired)
  → SESSION_RETIRED + timestamps unchanged.
- TWO-TAB EXIT GATE: register two sessions (same user + auth session, different registrationIds),
  disconnect one → the other still `retired_at IS NULL AND expires_at > now()`; count active = 1.
- retire fn (as postgres): expired rows get `retired_at = expires_at` EXACTLY (assert equality);
  active rows untouched; expired session stops counting as active WITHOUT running the fn
  (query by predicate `expires_at > clock_timestamp()`).
- reconcile fn (as postgres): stale placed user (current_space_id set, only old mismatched sessions)
  → placement cleared, location_version +1, session placement fields nulled, open log closed;
  recovered user (active matching session) skipped; user with 4-minute-old retired matching-space
  evidence NOT cleared (5-min window).
- purge fn (as postgres): retired session >24h deleted, recent retained; fence with live
  auth.sessions row NOT confirmed; fence for deleted auth session confirmed with
  `purge_after = confirmed + 1800s + 7d`; confirmed fence not deleted before purge_after; deleted
  after (manipulate purge_after as postgres).
- `is_presence_auth_session_unfenced` via pg: `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '<json>'`
  → true for valid unfenced pair; false for fenced / missing claim / malformed uuid / unknown sub.
- Catalog assertions: role attrs (NOLOGIN NOINHERIT NOBYPASSRLS, no memberships); each function
  owner = presence_maintenance_owner, `prosecdef`, `proconfig` contains `search_path=pg_catalog`;
  EXECUTE grants exactly as spec; cron.job rows: retire `* * * * *` + purge `30 3 * * *`, username
  `postgres`, exact command strings, and `presence-reconcile-placement-v1` ABSENT.

### API route tests (`__tests__/api/presence-sessions-route.test.ts`)
Mock `createSupabaseServerClient` following `users-location-route.test.ts` conventions (mock
`auth.getClaims`, repository, and `rpc`). Cases: 401 no auth; 401 missing/malformed `session_id`
claim; 400 invalid registrationId; 400 body with `sessionId` key (strict schema); fence pre-check
→ 401; rpc code mapping (each → status per table); disconnect accepts `text/plain` and empty body;
heartbeat ignores request body entirely; 500 sanitized on rpc failure (no db details leak).

### Hook tests (`__tests__/presence-session-hook.test.tsx`)
Testing Library + fake timers + mocked fetch/sendBeacon. Cases: no heartbeat before register
success; heartbeat at 30s cadence after success; SESSION_RETIRED heartbeat → exactly ONE rotation
(new registrationId ≠ old, single re-register); double SESSION_RETIRED → stops (no loop);
Strict Mode double mount → no rotation loop, one active registration; pagehide fires beacon with
current sessionId; sendBeacon returns false → keepalive fetch fallback; `visibilitychange` visible
→ immediate heartbeat; userId → null cleans up interval/listeners.

### Regression
`useUserPresence` no longer sends `offline:true` beacon — update any existing test that asserted
it (do NOT delete assertions without replacing with the new expectation). Full `npm run test` must pass.

## 5. Exit-gate evidence (captured to `docs/presence-remediation/phase-2-evidence-2026-07-11.md`)
Map each handoff exit-gate bullet (lines 1531–1539) to a passing test name + red→green proof.
