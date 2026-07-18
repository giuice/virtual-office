# Phase 4 evidence — social Knock delivery and retention (2026-07-16)

## Scope and baseline

This continuation starts from the user-confirmed linked-environment state:

- `20260716143115_phase4_social_knock_server_contract.sql` was applied, registered in migration history, and read back.
- An admin and a member confirmed the shared product smoke: rooms, single avatars, movement, bidirectional Knock, and Knock reconciliation were working.
- Restored functionality must remain enabled.

The work in this evidence slice addresses the remaining formal Phase 4 gaps: classify current browser errors, add scheduled expiry and 30-day retention, add minimal private Knock invalidation, and add focused contract coverage. It does not promote Phase 4 and does not replace polling as the authoritative delivery path.

## Runtime capture and classification

A controlled member-session reload at `http://localhost:3000/floor-plan` produced:

- **0 console errors**, and no observed 401, 429, or 500 response symptom.
- **1 non-blocking warning:** the `/images/virtual-office.png` `next/image` aspect-ratio warning. Source is the navigation logo (`src/components/nav.tsx`); unrelated to Presence/Knock and deferred to UI cleanup.
- A bootstrap Presence `CLOSED` → resubscribe → `SUBSCRIBED` sequence. This is the already-known subscription-churn/RT-01 work, outside Phase 4; no functionality was disabled or changed for it.
- Repetitive debug logging containing user identifiers and emails. Classified as observability/privacy debt; no functional Phase 4 failure was inferred from it.

The post-change DOM still showed 8 spaces, 6 online users, 2 users in meetings, the member avatar once in QA, the admin avatar once in Admins Room, and the Knock action on the occupied Admins Room.

## Implemented formal contract

### Scheduled expiry and retention

New local migration: `20260716175515_phase4_knock_delivery_and_retention.sql`.

It adds:

- a non-login-owner `SECURITY DEFINER` worker with fixed `search_path`;
- bounded `FOR UPDATE SKIP LOCKED` batches for live-row expiry and terminal-row deletion;
- 30-day retention for `expired`, `denied`, and `consumed` rows;
- partial indexes matching both scheduled queues;
- a `presence-expire-knocks-v1` pg_cron job every minute;
- browser/service execution revocation, with only `postgres` explicitly granted execution.

### Minimal private invalidation

The canonical pending/status API polling remains unchanged and authoritative. A best-effort acceleration path now:

- emits only `{ kind: "knock-invalidated" }`, with no request, user, room, or decision data;
- uses the private topic `company:<company-id>:knock`;
- lets authenticated clients receive only their own company topic and only while the existing Presence auth session is unfenced;
- gives browser roles no Broadcast INSERT policy;
- triggers both existing canonical reconcilers on receipt;
- silently falls back to polling if Realtime authentication/subscription/delivery is unavailable.

The design follows Supabase's documented private-channel RLS model for `realtime.messages`, server-side Broadcast, and pg_cron scheduling:

- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart)

## Local database gate continuation (2026-07-17)

Docker Desktop was healthy; the missing step was starting and aligning the local Supabase stack. The local configuration now uses PostgreSQL 15, matching the linked project's read-back version (`15.8`), and disables the absent optional seed file while leaving migration execution enabled.

The first clean migration replay exposed a PostgreSQL ownership precondition in `20260716175515`: `presence_maintenance_owner` needed temporary `CREATE` on the containing schemas before the functions could be reassigned. The migration now grants that privilege only inside its transaction and revokes it before revoking the transient role membership. A subsequent `supabase db reset --local --no-seed` replayed all 17 local migrations successfully.

Local catalog read-back confirmed:

- `phase4_knock_broadcast_receive` is a `SELECT` policy for `authenticated` only;
- `private.current_presence_company_id()` and `public.expire_knock_requests()` are owned by `presence_maintenance_owner` with `search_path=pg_catalog`;
- `presence-expire-knocks-v1` is active on `* * * * *`;
- both Phase 4 partial queue indexes exist;
- `postgres` does not retain membership in `presence_maintenance_owner`;
- the maintenance owner does not retain `CREATE` on `public` or `private`.

After explicit user authorization on 2026-07-17, `20260716175515` was applied as the single SQL file to the linked project and then registered as applied. A broad `db push` was deliberately not used because the project has older migration-history divergence outside this Phase 4 slice.

Linked catalog read-back confirmed PostgreSQL 15.8, the authenticated-only Broadcast receive policy, both dedicated-owner functions with `search_path=pg_catalog`, the active every-minute cron job owned by `postgres`, both partial indexes, zero `anon`/`authenticated` policies on `public.knock_requests`, no members in `presence_maintenance_owner`, no retained `postgres` membership, and no retained schema `CREATE` privilege. Linked database advisors returned no error-level findings; their warnings concern pre-existing objects and do not name the new Phase 4 functions, policy, indexes, or cron job.

The dedicated Supabase RLS review found no blocker in the new migration's grants, revokes, ownership, RLS, fixed search paths, or `users.supabase_uid` identity mapping. Its privilege-cleanup observation was converted into a regression assertion and the focused Phase 4 DB contract remained green (2/2). The remaining review risk is behavioral proof that a JWT from company B cannot subscribe to company A's private Knock topic; that probe belongs to the linked post-migration two-user gate.

## Post-review broadcast latency hardening (2026-07-18)

The user-approved post-migration smoke confirmed the admin/member rooms, avatars, movement, and Knock flow. A subsequent independent review found no high- or medium-priority issue, but correctly identified that both Knock routes await the best-effort Broadcast before returning the canonical RPC result. With the installed Realtime client, the implicit HTTP timeout was 10 seconds.

The Broadcast helper now passes an explicit 2-second timeout to `httpSend`, while preserving the awaited call, swallowed delivery failure, channel cleanup, and authoritative polling fallback. A direct helper test covers the private company topic, minimal payload, timeout option, failure absorption, cleanup, and absent-company no-op. The Vitest-only `server-only` alias points to Next's bundled empty test stub and does not affect production resolution. The mandatory Presence safety review found no blocker and confirmed that authorization, placement, Presence derivation, and polling were unchanged.

## Verification evidence

| Gate | Result | Evidence |
|---|---|---|
| TypeScript | Pass | `npm.cmd run type-check` |
| Changed-file lint | Pass | ESLint over routes, hooks, helpers, and new tests |
| Focused unit/component tests | Pass, 41/41 | Broadcast helper, request/respond routes, private invalidation hook, Knock auto-join, and banner |
| Browser runtime | Pass for captured state | 0 errors; existing image warning only; rooms/avatars/Knock retained |
| Shared admin/member smoke | User-approved post-migration | Rooms, avatars, movement, approve/deny, and Knock reconciliation retained after the linked migration |
| Migration reset + DB integration | Pass, 61/61 | Clean local reset replayed all 17 migrations; all 8 Presence DB files passed, including the Phase 4 contract (2/2) |
| Local catalog read-back | Pass | PostgreSQL 15.8; receive policy, owners, fixed search paths, cron, indexes, and privilege cleanup verified |
| Linked migration application + history | Pass | `20260716175515` applied as the single authorized file and registered without broad-pushing older divergence |
| Linked catalog read-back | Pass | Policy, functions, cron, indexes, absence of browser Knock policies, and privilege cleanup verified |
| Supabase database advisors | Pass at error gate | Exit 0 with no error-level findings; warnings are pre-existing policy/index/search-path debt and do not name the new Phase 4 objects |
| Full unit suite | Inconclusive | Runner executed tests but did not terminate within 300 seconds, including after excluding the remote integration test |
| Automated two-user Playwright | Not run | Separate admin/member `AUTH_E2E_*` credentials are not configured; the user-confirmed isolated-browser smoke is the current runtime evidence |

The new DB contract test covers worker ownership/grants/search path, removal of transient role/schema privileges, private receive-policy shape, cron registration, queue indexes, expiry, 30-day deletion, and retention of recent terminal rows. It passed 2/2 inside the full Presence DB run (61/61), then passed 2/2 again after the privilege-cleanup assertion was added.

## Test-harness incident discovered during the full-suite gate

`__tests__/messaging/pin_star_integration.test.ts` is included by the nominal unit-suite command but loads `.env.local`, writes to the linked Supabase, and has an incorrect Auth teardown (it overwrites the Auth user ID with `public.users.id`). Three executions in this continuation created three isolated `test_pin_star_*` users, conversations, and messages.

Those three exact sets were removed in dependency-safe order. Readback confirmed:

- `auth_remaining = 0`
- `app_users_remaining = 0`
- `conversations_remaining = 0`

Older `test_pin_star_*` residue predating this continuation was observed but deliberately left untouched. Repairing or reclassifying that messaging test is outside the Phase 4 change set and remains separate test-hygiene debt.

## Remaining formal gates

1. Run a two-company JWT probe proving that company B cannot subscribe to company A's private Knock topic, while retaining polling fallback. The post-migration same-company admin/member smoke is user-approved; the independent review verified the cross-company policy structurally but did not replace the behavioral probe.
2. Obtain a terminating full-suite result after isolating the remote messaging integration and remaining open handles.
3. Obtain final explicit user confirmation after the remaining automated gates before changing the phase status.

**Status: Pending user confirmation**
