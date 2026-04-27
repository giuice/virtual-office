# Presence & Space System Pitfalls Guide

> This document captures hard-won lessons from a week-long debugging effort on the enter-space / reload / offline avatar system. Read this BEFORE touching any presence, space placement, or user status code.

## Architecture Overview

### The 4 Sources of Truth (and which to trust)

| Source | What it holds | Lifetime | Trust level |
|--------|--------------|----------|-------------|
| **Database** (`users.current_space_id`, `users.status`) | Authoritative position & status | Persistent | Server-side authority |
| **TanStack Query cache** (`['user-presence']`) | Client mirror of DB, updated by Realtime | Per-session | Reflects DB with lag |
| **Supabase Realtime presence** (`presenceState`) | Who is currently connected | Per-connection | Ephemeral, derives online/offline |
| **localStorage** (`lastSpaceId`, `vo-disconnect-timestamp`) | Reconnection hints | Cross-session | Advisory only, never authoritative |

**Rule: DB is the single source of truth for position. Realtime presence is the single source of truth for online/offline. Query cache mirrors DB. localStorage is advisory.**

### Key Components and Their Responsibilities

| Component | Responsibility | MUST NOT do |
|-----------|---------------|-------------|
| `ModernFloorPlan.handleEnterSpace` | Validate + call `updateLocation(spaceId)` + notify parent | Make a second API call, modify localStorage |
| `FloorPlan.handleSpaceSelect` | Set UI state (`selectedSpace`, `highlightedSpaceId`) + call `saveLastSpace` | Call `updateLocation` (already done by ModernFloorPlan) |
| `useLastSpace` | Auto-placement on load/reconnect, grace-rejoin, localStorage persistence | Override a manual click, make duplicate API calls |
| `useUserPresence.safeUpdateLocation` | Single debounced API call to `/api/users/location` | Be called from multiple paths for the same click |
| `CompanyContext.currentUserProfile` | Initial user profile from DB (loaded once) | Be treated as live/reactive state |
| `presenceAwareUsers` | Derive online/offline from Realtime presence state | Mutate DB or query cache directly |
| `usersInSpaces` | Map users to space buckets for rendering | Include offline users |

---

## The 5 Critical Pitfalls

### Pitfall 1: The Beacon Race Condition

**What happens:** On page reload, `beforeunload` fires a `sendBeacon` POST to `/api/users/location`. This beacon races with the new page's data fetching.

**The trap:** If the beacon modifies DB state (e.g., clears `current_space_id`), the Realtime `postgres_changes` event can arrive on the NEW page and overwrite the query cache, causing avatars to disappear.

**Timeline of a race:**
```
Tab reload begins
  |-- beforeunload fires -> sendBeacon({ spaceId: null, offline: true })
  |-- New page starts loading
  |-- Query fetches /api/users/list (user still has old space)
  |-- Page renders with user in correct space
  |-- Beacon arrives at server -> DB updated -> Realtime fires
  |-- Query cache updated -> user.currentSpaceId = null
  |-- Avatar disappears!
```

**Solution:** The beacon should ONLY set `status: 'offline'`. It must NOT clear `current_space_id`. The space position persists across reloads. Offline users are filtered from space avatars on the client.

**Rule: Never clear `current_space_id` in cleanup/disconnect paths. Only clear it when the user explicitly moves to a different space or leaves.**

### Pitfall 2: Stale CompanyContext

**What happens:** `CompanyContext.currentUserProfile` is loaded once during `loadCompanyData` and NEVER updated when Realtime events change the user's DB row.

**The trap:** Any code that uses `currentUserProfile.currentSpaceId` or `currentUserProfile.status` as a guard condition will make decisions based on stale data. This includes `useLastSpace`'s auto-placement effect.

**Example of the bug:**
```typescript
// useLastSpace effect uses currentUser from CompanyContext
if (currentUser.currentSpaceId === context.spaceId) {
  // This comparison uses STALE data!
  // If a Realtime event changed the DB, this won't reflect it
}
```

**Rules:**
- For reactive UI decisions, use `presenceAwareUsers` from the query cache (updated by Realtime)
- `currentUserProfile` is OK for: user ID, company ID, role, email (rarely change)
- `currentUserProfile` is NOT OK for: `currentSpaceId`, `status` (change frequently)
- If you add a new effect that depends on the user's current space or status, use the query-derived value, not CompanyContext

### Pitfall 3: The Double-Call Trap

**What happens:** Multiple code paths independently call `updateLocation` for the same user action.

**The trap:** The click flow passes through multiple layers. If more than one layer calls the API, you get duplicate requests, race conditions, and guards that fire incorrectly.

**Correct click flow (single API call):**
```
User clicks space card
  -> ModernFloorPlan.handleEnterSpace(spaceId)
     -> validates (capacity, access, status)
     -> await updateLocation(spaceId)         <-- THE ONLY API CALL
     -> onSpaceSelect(space)
        -> FloorPlan.handleSpaceSelect(space)
           -> setSelectedSpace, setHighlightedSpaceId  <-- UI state only
           -> saveLastSpace(space.id)                   <-- localStorage only
```

**Rules:**
- `handleSpaceSelect` must NEVER call `updateLocation` -- it's already done
- `saveLastSpace` must NEVER trigger an API call -- it only updates localStorage
- The `manualChangeRef` guard in `useLastSpace` prevents the auto-placement effect from overwriting a manual click

### Pitfall 4: Offline Users in Space Buckets

**What happens:** Users who disconnect keep their `current_space_id` set in DB (intentionally, for reload recovery). But their avatars should not appear in spaces.

**The trap:** The `usersInSpaces` map includes ALL users with a `currentSpaceId`, regardless of status. Offline users show as ghosts in spaces.

**Rules:**
- `usersInSpaces` must filter out users where `status === 'offline'`
- Exception: always include the current user (they may briefly be `offline` in DB before Realtime presence marks them online)
- Server-side capacity checks must also exclude offline users (`.neq('status', 'offline')`)
- The `presenceAwareUsers` derivation handles online/offline correctly via Realtime presence state -- trust it

### Pitfall 5: The useLastSpace Auto-Placement Hijack

**What happens:** `useLastSpace` has an effect that auto-places the user on page load. It calls `getReconnectionContext()` which returns the grace-rejoin space, home space, or default space. When `saveLastSpace(spaceId)` is called (from a manual click), it updates localStorage, which re-triggers this effect.

**The trap:** The effect fires, calls `getReconnectionContext()` which -- outside the grace period -- returns the HOME space, not the space the user just clicked. The user's avatar snaps back to their home space.

**Solution:** `manualChangeRef` is set by `saveLastSpace()` before updating localStorage. The auto-placement effect checks this ref first and skips if set.

**Rules:**
- Any function that updates `lastSpaceId` for a manual action MUST set `manualChangeRef.current = true` first
- The auto-placement effect MUST check `manualChangeRef` before doing anything
- Never add new callers of `setLastSpaceId` without going through `saveLastSpace`

---

## Debugging Protocol

When a space/presence bug is reported, follow this exact sequence:

### Step 1: Check DB State
```sql
SELECT id, display_name, current_space_id, status, last_active
FROM users WHERE company_id = '<company_id>'
ORDER BY last_active DESC;
```

### Step 2: Check Company Settings
```sql
SELECT settings FROM companies WHERE id = '<company_id>';
-- Look at: settings.defaultSpaceId, settings.homeSpaces
```

### Step 3: Check Console Logs (browser)
Filter for these prefixes:
- `[useLastSpace]` -- auto-placement decisions, skips, API calls
- `[Presence]` -- Realtime subscription, location updates, query fetches
- `[updateLocation]` -- server-side DB updates

### Step 4: Check Network Tab
- Look for `PUT/POST /api/users/location` requests
- Check: how many fire per click? What's the payload? What's the response?
- Look for `sendBeacon` requests on page unload

### Step 5: Check Realtime Events
- In Supabase dashboard, check `postgres_changes` events on the `users` table
- Verify the event sequence matches expectations

**CRITICAL: Never attempt a fix based on code reading alone. Prove the root cause with runtime evidence first.**

---

## Change Checklist

Before modifying any presence/space code, verify:

- [ ] **Single API call per action**: Trace the full click flow and confirm only one `updateLocation` call fires
- [ ] **No beacon race**: The `beforeunload` beacon does NOT clear `current_space_id`
- [ ] **Offline filter**: `usersInSpaces` excludes offline users (except current user)
- [ ] **Capacity check**: Server-side capacity excludes offline users
- [ ] **Manual click guard**: `saveLastSpace` sets `manualChangeRef` before updating localStorage
- [ ] **No stale state in guards**: Effects that check `currentSpaceId` use query-derived values, not CompanyContext
- [ ] **Tests pass**: `npx vitest run __tests__/api/users-location-route.test.ts`

---

## File Map

| File | Contains | Touch with caution |
|------|----------|--------------------|
| `src/hooks/useLastSpace.ts` | Auto-placement logic, grace-rejoin, `manualChangeRef` guard | Any change to the effect can break placement |
| `src/hooks/useUserPresence.ts` | Realtime subscription, `safeUpdateLocation`, `presenceAwareUsers`, `usersInSpaces`, beacon handler | Central to all presence behavior |
| `src/app/api/users/location/route.ts` | Server-side location update, capacity check, access control, offline beacon handling | Beacon path must not clear space |
| `src/components/floor-plan/floor-plan.tsx` | `handleSpaceSelect` (UI state + `saveLastSpace`), hydration effect | Must not call `updateLocation` |
| `src/components/floor-plan/modern/ModernFloorPlan.tsx` | `handleEnterSpace` (validation + single `updateLocation` call) | The ONLY place that calls `updateLocation` on click |
| `src/contexts/PresenceContext.tsx` | Thin wrapper exposing `useUserPresence` | Rarely needs changes |
| `src/contexts/CompanyContext.tsx` | `currentUserProfile` (loaded once, stale for space/status) | Don't rely on it for reactive guards |

---

## Known Limitations

1. **DB status stays `offline` after reload**: The beacon sets `status: 'offline'`. On reload, the user connects to Realtime and is derived as `online` on the client, but the DB isn't updated back to `online`. This is cosmetic -- the client-side derivation is correct. A future improvement could set the DB status to `online` when the Realtime subscription connects.

2. **Stale test users**: Users who registered weeks ago and never came back still have `status: 'online'` and `current_space_id` set in DB. They are correctly derived as `offline` by the Realtime presence system (not in presence state). A periodic server-side cleanup job could clear stale spaces.
