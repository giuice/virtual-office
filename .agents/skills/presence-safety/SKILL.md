---
name: presence-safety
description: >
  Mandatory safety guide for the Virtual Office presence, realtime, space placement, and knock system.
  This skill MUST be consulted for any change in the presence/space subsystem.
  Use when editing: useUserPresence, useLastSpace, presence-utils, PresenceContext,
  location/route.ts, ModernFloorPlan, useModernFloorPlanKnock, floor-plan.tsx,
  usersInSpaces, or presenceAwareUsers.
  Also use for code involving current_space_id, sendBeacon, Realtime presence channels,
  reconnection logic, online/offline derivation, knock requests, private space access,
  or space_presence_log, and when debugging avatar disappearance, ghost users in spaces,
  double API calls, snap-back-to-home-space, or stuck-offline bugs.
  Even if the change looks small, consult this skill -- the system has 4 interacting sources of truth
  and every past "simple fix" has created cascading regressions.
---

# Presence & Space System Safety Guide

**How to use this guide:**
1. ALWAYS read: "Sources of Truth", "Two Status Fields", and "The Critical Rules". Never skip these.
2. Then open the **Change Playbook** matching your task and follow it exactly.
3. Before committing, run the **Checklist** and the tests listed in your playbook.

Violating the rules below WILL cause regressions that are hard to diagnose.

---

## The 4 Sources of Truth

| Source | What it holds | Trust level |
|--------|--------------|-------------|
| **Database** (`users.current_space_id`, `users.status`, `users.last_active`, `space_presence_log`) | Authoritative position & status | Server-side authority |
| **TanStack Query cache** (`['user-presence']`) | Client mirror of DB, updated by Realtime `postgres_changes` | Reflects DB with lag |
| **Supabase Realtime presence** (`presenceState` on channel `user-presence-channel`) | Who is currently connected | Ephemeral, derives online/offline |
| **localStorage** | Reconnection hints (see keys below) | Advisory only, NEVER authoritative |

**localStorage keys (all advisory):**

| Key | Written by | Meaning |
|-----|-----------|---------|
| `lastSpaceId` | `useLastSpace.saveLastSpace` | Last space for grace rejoin |
| `vo-disconnect-timestamp` | `useUserPresence` (beforeunload + visibilitychange) AND `useLastSpace` (beforeunload + pagehide) | Start of the 5-min grace window |
| `vo-first-login-done` | `useLastSpace.markFirstLoginComplete` | Suppresses first-time placement. Clearing it re-triggers "first login" placement |

**Core rule: DB is truth for position. Realtime presence is truth for online/offline. Query cache mirrors DB. localStorage is advisory.**

---

## Two Status Fields: `status` vs `dbStatus` (read this — frequent confusion)

`presenceAwareUsers` (in `useUserPresence.ts`) **overwrites** `user.status` with a *derived* value
and preserves the raw DB value in `user.dbStatus`:

```typescript
return { ...user, dbStatus: user.status, status: derivedStatus, isOnline };
```

- `status` on a presence-aware user = **derived** (Realtime presence + staleness heuristics). Use for rendering and online/offline checks.
- `dbStatus` = what the DB row says. Use when you need the persisted state — e.g. `useLastSpace` checks `dbStatus === 'offline'` to refresh a stale offline row after reload.
- Derivation lives in `src/hooks/presence-utils.ts` → `derivePresenceStatus()`. **Do not inline or "simplify" it** (see Rule 6).

---

## Component Responsibility Map

| Component | File | Does | MUST NOT do |
|-----------|------|------|-------------|
| `handleEnterSpace` | `src/components/floor-plan/modern/useModernFloorPlanKnock.ts` (NOT ModernFloorPlan.tsx — the component only consumes this hook) | Validate (capacity, status, private access/knock) + call `updateLocation(spaceId)` once + notify parent | Make a second API call, modify localStorage |
| `FloorPlan.handleSpaceSelect` | `src/components/floor-plan/floor-plan.tsx` | Set UI state (`selectedSpace`, `highlightedSpaceId`) + call `saveLastSpace(space.id)` | Call `updateLocation` (already done upstream) |
| `FloorPlan` hydration effect | `src/components/floor-plan/floor-plan.tsx` (~line 110) | Visual selection on load + `saveLastSpace(id, { markManualChange: false })` | Call any location API; set `markManualChange: true` |
| `useLastSpace` | `src/hooks/useLastSpace.ts` | Auto-placement on load/reconnect, grace-rejoin, SPACE_FULL fallback, localStorage persistence; direct API exception for automatic placement only | Override a manual click, make duplicate API calls, read current space from `currentUserProfile` |
| `useUserPresence.safeUpdateLocation` | `src/hooks/useUserPresence.ts` | Single debounced API call to `/api/users/location` for manual movement; optimistic cache update on success | Be called from multiple paths for the same click |
| `derivePresenceStatus` | `src/hooks/presence-utils.ts` | Pure derivation of online/offline/away/busy from DB status + Realtime presence + `lastActive` staleness | Side effects of any kind |
| `CompanyContext.currentUserProfile` | `src/contexts/CompanyContext.tsx` | Initial user profile from DB (loaded once) | Be treated as live/reactive state |
| `presenceAwareUsers` | `src/hooks/useUserPresence.ts` | Map users adding derived `status`, raw `dbStatus`, `isOnline` | Mutate DB or query cache directly |
| `usersInSpaces` | `src/hooks/useUserPresence.ts` | Map users to space buckets for rendering | Include offline users (except current user) |
| `PresenceContext` | `src/contexts/PresenceContext.tsx` | Thin wrapper exposing `useUserPresence` as `usePresence()` | Add logic |

### API Call Decision Steps (use this sequence)

1. **Manual click on a space card?** → goes through `handleEnterSpace(spaceId)` (knock hook).
2. **Need to move user from that click?** → `handleEnterSpace` calls `updateLocation` (= `safeUpdateLocation`) exactly once.
3. **Updating UI selection state after move?** → `FloorPlan.handleSpaceSelect` — UI state only.
4. **Persisting last selected space?** → `saveLastSpace(space.id)` (localStorage only, no API).
5. **Automatic placement/rejoin (not manual click)?** → `useLastSpace.updateUserLocation` is the ONLY direct `/api/users/location` exception.
6. **Leaving a space?** → `handleLeaveSpace` → `updateLocation(null)`.

---

## The Critical Rules (violating ANY causes bugs)

### Rule 1: Never clear `current_space_id` in cleanup/disconnect paths

The beacon handler (`beforeunload`) sends a POST to `/api/users/location` on page close.
**What the beacon MUST do:** only set `status: 'offline'`. Preserve `current_space_id`.
**What the route does:** when `offline: true`, it updates `status: 'offline'` and does NOT touch `current_space_id`. The `spaceId: null` in the beacon payload is intentionally IGNORED by the server.

**Why:** On reload, the beacon races the new page's data fetch. If it cleared the space, the Realtime `postgres_changes` event would arrive on the new page and wipe the user from their space in the query cache (avatars disappear on reload).

### Rule 2: Only ONE location API call per manual user action

The click flow is:
```
User clicks space card
  -> handleEnterSpace(spaceId)               [useModernFloorPlanKnock.ts]
     -> validates (capacity, status, private access/knock)
     -> await updateLocation(spaceId)        <-- THE ONLY API CALL (safeUpdateLocation)
     -> onSpaceSelect(space) -> FloorPlan.handleSpaceSelect(space)
           -> setSelectedSpace, setHighlightedSpaceId   <-- UI state only
           -> saveLastSpace(space.id)                   <-- localStorage only
     -> onOpenChat(space)
```

- `handleSpaceSelect` MUST NEVER call `updateLocation` — it's already done.
- `saveLastSpace` MUST NEVER trigger an API call — localStorage only.
- Any NEW manual entry point that moves users must go through `handleEnterSpace` (or at minimum `safeUpdateLocation`) and nothing else.
- `useLastSpace.updateUserLocation` is the ONLY direct `/api/users/location` exception, and only for automatic first-load, grace-rejoin, stale-offline refresh, and home/default placement.
- The auto-placement exception MUST receive query-derived current user state from `usePresence().users`, not `CompanyContext.currentUserProfile`, because it checks `currentSpaceId` and `dbStatus`.

### Rule 3: Filter offline users from `usersInSpaces`

Users who disconnect keep `current_space_id` set (intentionally, for reload recovery). Their avatars must NOT appear in spaces.

```typescript
// In useUserPresence.ts — usersInSpaces derivation:
if (user.status === 'offline' && user.id !== currentUserId) return;
// Always include current user (may briefly be 'offline' before presence sync)
```

**Also enforced in 3 more places — keep ALL of them in sync:**
- Server capacity check in `route.ts`: `.neq('status', 'offline')`
- Client capacity pre-check in `handleEnterSpace`: filters `status !== 'offline'`
- Knock responder availability (`hasOnlineResponder`) and knock recipient routes: exclude offline users

### Rule 4: The `manualChangeRef` guard and the `markManualChange` option

`useLastSpace` has an auto-placement effect that fires on mount/reconnect. Without the guard, it overwrites manual space clicks with the home/default space.

`saveLastSpace(spaceId, options)` has TWO modes:

```typescript
saveLastSpace(spaceId)                              // manual click: sets manualChangeRef = true FIRST, then localStorage
saveLastSpace(spaceId, { markManualChange: false }) // automatic placement / hydration: localStorage only, guard untouched
```

- Manual actions MUST use the default (guard set) — otherwise auto-placement snaps the user back to home space.
- Automatic placements (inside `updateUserLocation`, the FloorPlan hydration effect) MUST pass `{ markManualChange: false }` — otherwise the guard gets consumed by the wrong run and a later legit auto-placement is skipped.
- The auto-placement effect checks `manualChangeRef` FIRST and consumes it (sets it back to false).
- Never call `setLastSpaceId` directly **to set a space**; always go through `saveLastSpace`. Exception: **clearing** to `null` MUST use `setLastSpaceId(null)` directly — `saveLastSpace(spaceId: string)` is non-nullable by design. The four existing `setLastSpaceId(null)` calls inside `useLastSpace` (SPACE_FULL dead-end, retry-exhausted, network catch, `clearLastSpace`) are intentional, not violations.

The auto-placement effect also has guards you must NOT remove: `isUpdatingRef`/`isRejoinInProgress`, the `lastUpdateRef` dedup key (`${userId}-${spaceId}`), the "user already in a different space" skip, and the stale-offline refresh branch (`dbStatus === 'offline' && currentSpaceId` → re-PUT the SAME space to flip status back to online).

### Rule 5: Never use `CompanyContext.currentUserProfile` for reactive guards

`currentUserProfile` is loaded once and NEVER updated when Realtime events change the user's DB row.

**Use `usePresence().users` (query-derived) for:** current space checks, online/offline, any reactive guard, the user passed into `useLastSpace`.
**`currentUserProfile` is OK for:** user ID, company ID, role, email, displayName (rarely change). That is why `getReconnectionContext(currentUserProfile, ...)` in the hydration effect is acceptable — it only reads `.id`.

### Rule 6: `derivePresenceStatus` has a stale-record guard — do not "simplify" it

The derivation is NOT just "in presence = online, else offline":

```typescript
// src/hooks/presence-utils.ts
if (isOnline) return !user.status || user.status === 'offline' ? 'online' : currentStatus;

// Stale guard: DB rows that still say 'online' + have currentSpaceId but whose
// lastActive is older than ACTIVE_PRESENCE_WINDOW_MS (2 min) render as offline
// EVEN BEFORE isPresenceReady. Removing this re-introduces ghost avatars on cold load.
if (user.currentSpaceId && (!user.status || user.status === 'online') && isStalePresenceRecord(user.lastActive, now)) return 'offline';

// Only after first presence sync: override 'online' -> 'offline'. Keep 'away'/'busy' (intentional DB statuses).
if (isPresenceReady && (!user.status || user.status === 'online')) return 'offline';
```

- The `isPresenceReady` flag prevents premature offline derivation; it only becomes true once the CURRENT user appears in the presence snapshot.
- `away`/`busy` are intentional user-set statuses — never auto-override them to offline.

### Rule 7: The server reactivates offline users on movement — keep it

In `route.ts`, after a successful location update, if the user's DB status was `offline` the server flips it to `online`. This is what un-ghosts a user who reloaded (beacon marked them offline, then they moved/rejoined). Removing it leaves users invisible in spaces until they manually change status.

---

## Hidden Couplings (invariants that span files)

| Invariant | Where | Breaks if violated |
|-----------|-------|-------------------|
| `GRACE_PERIOD_MS` (client, `useLastSpace.ts`) === `SPACE_REJOIN_GRACE_MS` (server, `route.ts`) === 5 min | Duplicated constants | Client offers grace rejoin the server rejects (403), or vice versa |
| `ACTIVE_PRESENCE_WINDOW_MS` (2 min) used in BOTH the query-fetch filter and `derivePresenceStatus` | `useUserPresence.ts` + `presence-utils.ts` | Users fetched but rendered inconsistently |
| `debouncedUpdateLocation` uses `{ leading: true, trailing: false }`, 250ms | `useUserPresence.ts` | Changing to trailing delays every move; known tradeoff: a second click on a DIFFERENT space within 250ms is dropped while the cache is optimistically updated — do not change casually |
| Presence channel name `user-presence-channel`, presence key = `currentUserId` | `useUserPresence.ts` | Knock signaling and presence sync assume one channel per app |
| `postgres_changes` listener covers the whole `users` table, no filter | `useUserPresence.ts` | Adding a filter silently stops peer updates |
| TWO independent dedup keys `${userId}-${spaceId}` (`safeUpdateLocation.lastUpdateRef` and `useLastSpace.lastUpdateRef`) | Both hooks | They are NOT shared; don't merge or remove either |
| `lastSpaceId` must stay aligned whether placement came from UI or auto-placement | floor-plan hydration effect + `updateUserLocation` | Grace rejoin targets the wrong space |
| ⚠️ **Joinable-status MISMATCH (latent bug):** `useLastSpace.JOINABLE_STATUSES` = `active/available/in_use`, but the server (`route.ts`) and manual entry (`handleEnterSpace`) accept only `active/available` | `useLastSpace.ts` vs `route.ts` + `useModernFloorPlanKnock.ts` | Auto-placement/grace-rejoin can target an `in_use` space → server returns 409 `SPACE_UNAVAILABLE`, which has NO special branch in `updateUserLocation` (only `SPACE_FULL` does) → generic 2s/4s/8s retry loop → 3 failures → `lastSpaceId` cleared + "Rejoin Failed" toast, user placed nowhere. When fixing: either drop `in_use` from `JOINABLE_STATUSES` or add a `SPACE_UNAVAILABLE` fallback branch mirroring `SPACE_FULL` |

---

## Server Route Behavior (`/api/users/location`, PUT and POST → same handler)

Order matters. The handler:

1. Authenticates via `getUser()` and resolves the app user by `supabase_uid` (uses service-role client for data).
2. Rejects if body `userId !== authenticatedUser.id` (`USER_MISMATCH`, 403). Parses `text/plain` bodies (beacon).
3. **`offline: true` branch:** sets `status: 'offline'` ONLY, returns. Never touches `current_space_id` (Rule 1).
4. For a target space: cross-company guard (403) → capacity excluding offline users and self (409 `SPACE_FULL`) → space status must be `active`/`available` (409 `SPACE_UNAVAILABLE`).
5. **Private space (`access_control.isPublic === false`)** entry allowed by ANY of: direct access (admin/owner/allowedUsers/allowedRoles) · already in space · grace rejoin via `space_presence_log.exited_at` < 5 min · grace via `users.last_active` < 5 min · an OPEN presence log row (no `exited_at`) · an approved knock. Otherwise 403 `SPACE_ACCESS_DENIED`.

   > ⚠️ **KNOWN SECURITY BUG — do NOT preserve as-is.** The `last_active` grace check (`hasGraceRejoinByLastActive`) checks ONLY the user's own activity recency — it never verifies the user was ever in THIS space (the inline code comment claims it does; the code does not). Since `SupabaseUserRepository` refreshes `last_active` on every update, **any recently-active user bypasses the knock gate for any private space**. The knock gate only holds for users idle > 5 min. Intended design: it exists to cover the beacon race for a user rejoining THEIR OWN recent space. Correct fix when touching this route: scope the check by also requiring an open or recently-exited `space_presence_log` row for the same `space_id` (or `authenticatedUser.currentSpaceId === spaceId`). Do not treat this branch as load-bearing authorization for strangers.
6. Updates location; if user was `offline`, reactivates to `online` (Rule 7).
7. On space change, syncs `space_presence_log` (closes previous row, inserts new one with `authorized_by`).
8. If entry was authorized by a knock, **deletes the consumed `knock_requests` row** (single-use approval).

Client error contract `useLastSpace` depends on: 409 + `code: 'SPACE_FULL'` triggers fallback placement to home/default space. Changing error codes breaks the fallback chain.

---

## Knock Flow (private spaces) — intertwined with placement

`handleEnterSpace` lives in `useModernFloorPlanKnock.ts` because entering and knocking share validation:

- Requester: `handleKnock` → broadcast via `useKnockSignaling` → on APPROVE, sets `approvedKnockSpaceIdRef` and calls `handleEnterSpace(spaceId, { allowPrivateBypass: true })`. The ref is cleared after successful entry.
- Occupants: receive knock → banner (30s auto-expire) → approve/deny via `respondToKnock`.
- A knock approval is **single-use**: the server deletes the `knock_requests` row when consumed. Do not "re-use" approvals client-side.
- `hasOnlineResponder`: knocking is only offered when a NON-offline occupant is present — offline occupants (Rule 3) must never count as responders, client or server side.

---

## Change Playbooks

### A. Adding a new way for users to enter/leave a space (button, command, drag…)
1. Route the action through `handleEnterSpace` / `handleLeaveSpace`. Do NOT call fetch or `updateLocation` directly.
2. Trace the full flow and confirm exactly ONE `/api/users/location` request fires (Network tab).
3. If the entry point lives outside the floor plan, you still need `saveLastSpace` (manual mode) for grace rejoin.
4. Tests: `npx vitest run __tests__/api/users-location-route.test.ts __tests__/space-capacity-handling.test.tsx`

### B. Changing disconnect/offline/beacon behavior
1. Re-read Rules 1, 3, 6, 7. The words "preserve current_space_id" are the whole design.
2. Remember there are MULTIPLE writers of `vo-disconnect-timestamp` (useUserPresence + useLastSpace) — keep them consistent.
3. Tests: `npx vitest run __tests__/api/users-location-route.test.ts __tests__/presence-utils.test.ts __tests__/realtime-presence.test.ts __tests__/presence-animation.test.tsx`

### C. Changing auto-placement / reconnection / grace rejoin
1. Re-read Rule 4 entirely, including `markManualChange` semantics.
2. Keep client `GRACE_PERIOD_MS` and server `SPACE_REJOIN_GRACE_MS` in sync.
3. Verify the SPACE_FULL fallback chain (409 → home/default placement) still works.
4. Tests: `npx vitest run __tests__/default-space-assignment.test.tsx __tests__/company-settings-default-space.test.tsx __tests__/api/users-location-route.test.ts`

### D. Changing presence derivation / avatar rendering
1. Re-read "Two Status Fields" and Rule 6. Never read `dbStatus` for rendering; never read derived `status` for persistence decisions.
2. Any new filter on who renders in a space goes in `usersInSpaces`, nowhere else.
3. Tests: `npx vitest run __tests__/presence-utils.test.ts __tests__/user-avatar-presence-v2.test.tsx __tests__/presence-animation.test.tsx __tests__/space-detail-hover-panel.test.tsx`

### E. Changing the API route or knock endpoints
1. Re-read "Server Route Behavior". Order of checks is load-bearing (e.g., capacity before private-access).
2. Do not change error codes (`SPACE_FULL`, `SPACE_UNAVAILABLE`, `SPACE_ACCESS_DENIED`, `USER_MISMATCH`) — clients branch on them.
3. Tests: `npx vitest run __tests__/api/users-location-route.test.ts __tests__/api/spaces-knock-request-route.test.ts __tests__/api/spaces-knock-respond-route.test.ts __tests__/knock-auto-join.test.tsx __tests__/knock-banner.test.tsx`

---

## Query Cache Keys

| Key | What it caches | Updated by |
|-----|---------------|------------|
| `['user-presence']` | All users with presence data | Realtime `postgres_changes` on `users` table; optimistic updates from `safeUpdateLocation` and `useLastSpace.updateUserLocation` |

**Do NOT** invalidate the query unnecessarily — the Realtime subscription handles updates. `useLastSpace` may invalidate only as a fallback when the query data is not loaded yet.

---

## Before You Code: Checklist

- [ ] **Single API call**: Trace the full click/action flow. Confirm only one `updateLocation` fires.
- [ ] **No beacon race**: The `beforeunload` beacon does NOT clear `current_space_id`.
- [ ] **Offline filter**: `usersInSpaces` excludes offline users (except current user) — and the 3 sibling checks (server capacity, client capacity, knock responders) still agree.
- [ ] **Manual click guard**: manual paths use `saveLastSpace(id)` (guard set); automatic paths use `{ markManualChange: false }`.
- [ ] **No stale state**: reactive guards use `usePresence().users`, not CompanyContext.
- [ ] **Status fields**: rendering reads derived `status`; persistence decisions read `dbStatus`.
- [ ] **Constants in sync**: grace periods (client/server) and staleness window untouched or updated in ALL places.
- [ ] **Error codes intact**: `SPACE_FULL` & friends unchanged.
- [ ] **Tests pass**: run the playbook's test list; when in doubt run all of:
  `npx vitest run __tests__/api/users-location-route.test.ts __tests__/presence-utils.test.ts __tests__/realtime-presence.test.ts __tests__/space-capacity-handling.test.tsx __tests__/default-space-assignment.test.tsx`

---

## Debugging Protocol

When investigating a presence/space bug:

1. **Check DB state** — What do `users.current_space_id`, `users.status`, `users.last_active`, and `space_presence_log` say?
2. **Check console logs** — Filter for `[useLastSpace]`, `[Presence]`, `[updateLocation]`
3. **Check Network tab** — How many `/api/users/location` requests fire per action? PUT (app) vs POST (beacon)?
4. **Check Realtime events** — Are `postgres_changes` events arriving? Is the user in `presenceState`?
5. **Check localStorage** — `lastSpaceId`, `vo-disconnect-timestamp`, `vo-first-login-done` (a missing first-login key triggers first-time placement).
6. **NEVER guess the root cause** — Prove it with runtime evidence before editing code.

### Realtime `postgres_changes` infrastructure gotchas (verified 2026-06-12)

- **A table only emits `postgres_changes` events if it is in the `supabase_realtime` publication.** A channel on a non-published table still reports `SUBSCRIBED` and `"Subscribed to PostgreSQL" status:ok` — the subscription is a **silent no-op** (zero events, no error). This was the root cause of the messaging realtime miss (fixed by migration `20260612130141`, which added the messaging tables).
- **`users` and `spaces` ARE in the publication** (probe-verified: UPDATE events delivered to a service_role subscriber). The presence `postgres_changes` listener and `useSpaceRealtime` have working infrastructure — do NOT add these tables to a publication migration again.
- **Post-SUBSCRIBED blind window:** the `SUBSCRIBED` ack arrives before the realtime poller activates the subscription server-side. Events fired within the first ~1–2 s after the ack can be dropped with no replay. Don't treat `SUBSCRIBED` as "delivery guaranteed from this instant"; after (re)subscribing, reconcile with a refetch if missing an event would matter.
- **How to probe delivery end-to-end** (no SQL access needed): node script with `@supabase/supabase-js` — subscribe with the service_role key (bypasses RLS), wait for `SUBSCRIBED`, wait a few seconds, mutate the row via service_role (a same-value UPDATE still emits an event), allow a 10–20 s window. Service_role subscriber receiving events but a user-JWT subscriber not = RLS SELECT policy problem; neither receiving = publication problem.

---

## File Quick Reference

| File | What to look for |
|------|-----------------|
| `src/hooks/useUserPresence.ts` | `safeUpdateLocation`, `presenceAwareUsers`, `usersInSpaces`, beacon handler, Realtime subscription, `isPresenceReady` |
| `src/hooks/presence-utils.ts` | `derivePresenceStatus`, `ACTIVE_PRESENCE_WINDOW_MS`, stale-record guard |
| `src/hooks/useLastSpace.ts` | `manualChangeRef`, `saveLastSpace` + `markManualChange`, auto-placement effect, `getReconnectionContext`, SPACE_FULL fallback |
| `src/app/api/users/location/route.ts` | `offline` flag handling, capacity/access checks, grace rejoin (3 mechanisms), `syncSpacePresenceLog`, knock consumption, offline→online reactivation |
| `src/components/floor-plan/modern/useModernFloorPlanKnock.ts` | `handleEnterSpace` / `handleLeaveSpace` — the ONLY manual `updateLocation` callers; knock state machine |
| `src/components/floor-plan/modern/ModernFloorPlan.tsx` | Consumes the knock hook; rendering only |
| `src/components/floor-plan/floor-plan.tsx` | `handleSpaceSelect` (UI + `saveLastSpace` only, NO API), hydration effect (`markManualChange: false`) |
| `src/contexts/PresenceContext.tsx` | Thin wrapper exposing `useUserPresence` |
| `src/contexts/CompanyContext.tsx` | `currentUserProfile` — stale for space/status, OK for ID/role |

---

## Common Mistakes by AI Agents

These have caused real regressions. If you find yourself doing any of these, STOP:

1. **Adding `updateLocation` to `handleSpaceSelect`** — already called by `handleEnterSpace`. Double API calls.
2. **Clearing `current_space_id` in the beacon handler or offline branch** — beacon race; avatars disappear on reload.
3. **Using `currentUserProfile.currentSpaceId` in an effect guard** — stale. Use `usePresence().users`.
4. **Including offline users in `usersInSpaces`** — ghost avatars.
5. **Calling `setLastSpaceId(someSpaceId)` without going through `saveLastSpace`** — auto-placement snaps the user to home space. (Clearing with `setLastSpaceId(null)` is the sanctioned exception — see Rule 4.)
6. **Passing `currentUserProfile` into `useLastSpace`** — stale `currentSpaceId`/`dbStatus` overrides live state.
7. **Adding a new Realtime subscription for the same data** — use the existing `postgres_changes` listener. Don't add another.
8. **Mutating `rawUsers` query data in the presence leave handler** — breaks derivation; users appear permanently offline. Let `onlineUserIds` handle it.
9. **Removing the `isPresenceReady` guard or the stale-record guard in `derivePresenceStatus`** — everyone appears offline (or ghosts appear) around load.
10. **Editing SKILL's old memory: looking for `handleEnterSpace` in `ModernFloorPlan.tsx`** — it lives in `useModernFloorPlanKnock.ts`. Don't re-implement it because you "couldn't find it".
11. **Calling `saveLastSpace` with the guard (default) from an automatic path** — consumes `manualChangeRef` and breaks the NEXT legit auto-placement skip.
12. **Removing the offline→online reactivation in route.ts** — reloaded users stay invisible.
13. **Changing the 409 `SPACE_FULL` code/shape** — silently kills the client fallback-placement chain.
14. **"Deduplicating" the two `${userId}-${spaceId}` dedup refs into one** — they guard different flows (manual vs automatic) and are intentionally separate.
15. **Auto-overriding `away`/`busy` to `offline`** — those are intentional user-set statuses; only `online` may be derived down to `offline`.
