# Knock-to-Enter Implementation Plan (Story 3.16)

## Status: Implementation Complete — Pending Migration & Manual Testing

---

## Architecture Evolution

### Phase 1: Broadcast Channels (FAILED)
The initial implementation used Supabase Realtime **broadcast** channels:
- Server-side SSR clients attempted subscribe → broadcast → teardown per request
- Broadcast channels consistently hit `TIMED_OUT` status
- Aggressive retry logic (250ms base, exponential backoff) flooded the shared websocket
- Cascade failure: destroyed ALL realtime features (presence, messaging)

### Phase 2: Client-Side Broadcast (FAILED)
Moved broadcast from server to persistent browser client singleton:
- Matched working `useAudioSignaling` pattern
- Added `{ broadcast: { self: false } }` config
- Removed retry logic (fixed presence regression)
- **Still TIMED_OUT** — broadcast-only channels unreliable in this environment

### Phase 3: DB-Backed postgres_changes (CURRENT)
Replaced broadcast with `knock_requests` database table + `postgres_changes` listeners:
- Same proven mechanism that powers presence tracking (which works reliably)
- Server routes INSERT/UPDATE rows → clients receive events via `postgres_changes`
- No broadcast channels, no retry loops, no websocket flooding

---

## Architecture Flow

### Knock Request (User A → Occupants)
```
User A clicks "Knock" → POST /api/spaces/knock/request
  → Server validates (auth, company, space, occupants)
  → Server INSERTs into knock_requests (status: 'pending')
  → Server cleans up stale rows > 2 minutes old
  → postgres_changes fires INSERT event to occupant's listener
  → Occupant's useKnockSignaling receives event → shows KnockToast + plays sound
```

### Knock Response (Occupant → User A)
```
Occupant clicks Approve/Deny → POST /api/spaces/knock/respond
  → Server validates (auth, occupant check, company)
  → Server UPDATEs knock_requests (decision, responder, status)
  → Server logs system message in room conversation
  → postgres_changes fires UPDATE event to knocker's listener
  → User A's useKnockSignaling receives event → triggers approval/denial flow
```

---

## Database Schema

### Table: `knock_requests`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | Client-generated UUID (`crypto.randomUUID`) |
| `space_id` | UUID (FK → spaces) | Target space being knocked on |
| `requester_id` | UUID (FK → users) | Who is knocking (app user ID) |
| `requester_name` | TEXT | Display name of knocker |
| `requester_avatar_url` | TEXT (nullable) | Avatar URL |
| `responder_id` | UUID (FK → users, nullable) | Who responded |
| `responder_name` | TEXT (nullable) | Responder display name |
| `decision` | TEXT (nullable) | `'APPROVE'` or `'DENY'` |
| `status` | TEXT | `'pending'`, `'approved'`, `'denied'`, `'expired'` |
| `created_at` | TIMESTAMPTZ | Auto-set on insert |
| `updated_at` | TIMESTAMPTZ | Auto-set, updated on response |

### RLS Policies
- **INSERT**: User can only create requests where `requester_id` matches their own user ID
- **SELECT**: User can see their own requests OR requests for spaces they currently occupy
- **UPDATE**: Only occupants of the target space can update (respond to) requests
- **DELETE**: Requester can delete own; occupants can delete for their space

### Realtime Publication
Table added to `supabase_realtime` publication for `postgres_changes` events.

### Migration File
`migrations/20260209_knock_requests_table.sql`

---

## Files Changed (from main)

| File | Status | Change |
|------|--------|--------|
| `migrations/20260209_knock_requests_table.sql` | **NEW** | Table, indexes, RLS, realtime publication |
| `src/hooks/realtime/useKnockSignaling.ts` | **REWRITTEN** | broadcast → `postgres_changes` listeners (INSERT for requests, UPDATE for responses) |
| `src/app/api/spaces/knock/request/route.ts` | **UPDATED** | INSERT into `knock_requests` + stale row cleanup |
| `src/app/api/spaces/knock/respond/route.ts` | **UPDATED** | UPDATE `knock_requests` with decision/responder |
| `src/components/floor-plan/modern/ModernFloorPlan.tsx` | **UPDATED** | AudioContext pre-warming on first user gesture |
| `src/hooks/useKnock.ts` | Unchanged | State machine (idle→knocking→approved/denied/timeout) |
| `src/components/floor-plan/modern/KnockToast.tsx` | Unchanged | Toast UI for occupants (approve/deny buttons) |

---

## Root Causes Fixed

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Server-side SSR broadcast unreliable | Critical | Replaced with DB INSERT/UPDATE + `postgres_changes` |
| 2 | Broadcast channels TIMED_OUT | Critical | Eliminated broadcast entirely |
| 3 | Retry loop destroyed shared websocket | Critical | Removed all retry logic |
| 4 | AudioContext autoplay blocked | Medium | Pre-warmed on first user gesture |
| 5 | `refreshRealtimeAuth` killed websocket | Medium | Removed dead code |

---

## Remaining Tasks

- [ ] **🚨 CRITICAL**: Run migration SQL in Supabase Dashboard → SQL Editor
  - File: `migrations/20260209_knock_requests_table.sql`
  - Creates table, RLS policies, indexes, and realtime publication
- [ ] Two-user manual testing after migration:
  - User A knocks on space where User B sits → User B sees toast + sound → Approve → User A auto-joins
  - Test deny flow + 60s cooldown
  - Test timeout (30s) flow
  - Verify presence (online icons) still works
- [ ] Update `migrations/database-structure.md` with `knock_requests` table
- [ ] Verify stale row cleanup works (rows > 2min auto-deleted on new requests)

---

## Validation Status

- **Type-check**: ✅ passes
- **Tests**: ✅ 25/25 pass (useKnock 11, KnockToast 10, SpaceActionButtons 4)
- **Presence regression**: ✅ Fixed (retry loop removal restored presence)
- **Manual test**: ⏳ Pending migration