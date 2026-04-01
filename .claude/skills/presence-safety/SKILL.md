---
name: presence-safety
description: >
  Mandatory safety guide for the Virtual Office presence, realtime, and space placement system.
  This skill MUST be consulted before making ANY changes to presence hooks, realtime subscriptions,
  space placement logic, user location APIs, floor plan components, or beacon/disconnect handling.
  Use when: editing useUserPresence, useLastSpace, PresenceContext, location/route.ts,
  ModernFloorPlan, floor-plan.tsx, usersInSpaces, presenceAwareUsers, or any code involving
  current_space_id, sendBeacon, Realtime presence channels, space placement, reconnection logic,
  or online/offline status derivation. Also use when debugging avatar disappearance, ghost users
  in spaces, double API calls, or snap-back-to-home-space bugs.
  Even if the change looks small, consult this skill -- the system has 4 interacting sources of truth
  and every past "simple fix" has created cascading regressions.
---

# Presence & Space System Safety Guide

This system has 4 interacting sources of truth and tightly coupled hooks. A week of debugging produced these rules. Violating any one of them WILL cause regressions that are hard to diagnose.

**Read this ENTIRE document before writing any code. Do not skim.**

---

## The 4 Sources of Truth

| Source | What it holds | Trust level |
|--------|--------------|-------------|
| **Database** (`users.current_space_id`, `users.status`) | Authoritative position & status | Server-side authority |
| **TanStack Query cache** (`['user-presence']`) | Client mirror of DB, updated by Realtime | Reflects DB with lag |
| **Supabase Realtime presence** (`presenceState`) | Who is currently connected | Ephemeral, derives online/offline |
| **localStorage** (`lastSpaceId`, `vo-disconnect-timestamp`) | Reconnection hints | Advisory only, NEVER authoritative |

**Core rule: DB is truth for position. Realtime presence is truth for online/offline. Query cache mirrors DB. localStorage is advisory.**

---

## Component Responsibility Map

Understanding who does what prevents the most common bug: duplicate API calls.

| Component | File | Does | MUST NOT do |
|-----------|------|------|-------------|
| `ModernFloorPlan.handleEnterSpace` | `src/components/floor-plan/modern/ModernFloorPlan.tsx` | Validate + call `updateLocation(spaceId)` + notify parent | Make a second API call, modify localStorage |
| `FloorPlan.handleSpaceSelect` | `src/components/floor-plan/floor-plan.tsx` | Set UI state (`selectedSpace`, `highlightedSpaceId`) + call `saveLastSpace` | Call `updateLocation` (already done upstream) |
| `useLastSpace` | `src/hooks/useLastSpace.ts` | Auto-placement on load/reconnect, grace-rejoin, localStorage persistence | Override a manual click, make duplicate API calls |
| `useUserPresence.safeUpdateLocation` | `src/hooks/useUserPresence.ts` | Single debounced API call to `/api/users/location` | Be called from multiple paths for the same click |
| `CompanyContext.currentUserProfile` | `src/contexts/CompanyContext.tsx` | Initial user profile from DB (loaded once) | Be treated as live/reactive state |
| `presenceAwareUsers` | `src/hooks/useUserPresence.ts` | Derive online/offline from Realtime presence state | Mutate DB or query cache directly |
| `usersInSpaces` | `src/hooks/useUserPresence.ts` | Map users to space buckets for rendering | Include offline users (except current user) |

---

## The 5 Critical Rules (Violating ANY causes bugs)

### Rule 1: Never clear `current_space_id` in cleanup/disconnect paths

The beacon handler (`beforeunload`) sends a POST to `/api/users/location` on page close. If this clears `current_space_id`, it races with the new page's data fetch and causes avatars to disappear.

**What the beacon MUST do:** Only set `status: 'offline'`. Preserve `current_space_id`.
**What the API route does:** When `offline: true`, it updates `status: 'offline'` and does NOT touch `current_space_id`.

```
// In route.ts — the offline beacon path:
if (offline) {
  await userRepository.update(userId, { status: 'offline' });
  // DO NOT update current_space_id here
  return;
}
```

**Why:** On reload, the beacon races the new page. If it clears the space, the Realtime `postgres_changes` event arrives on the new page and wipes the user from their space in the query cache.

### Rule 2: Only ONE `updateLocation` call per user action

The click flow is:
```
User clicks space card
  -> ModernFloorPlan.handleEnterSpace(spaceId)
     -> validates (capacity, access, status)
     -> await safeUpdateLocation(spaceId)       <-- THE ONLY API CALL
     -> onSpaceSelect(space)
        -> FloorPlan.handleSpaceSelect(space)
           -> setSelectedSpace, setHighlightedSpaceId  <-- UI state only
           -> saveLastSpace(space.id)                   <-- localStorage only
```

**Rules:**
- `handleSpaceSelect` MUST NEVER call `updateLocation` -- it's already done
- `saveLastSpace` MUST NEVER trigger an API call -- it only updates localStorage
- If you add a new entry point that moves users, it must go through `safeUpdateLocation` and nothing else

### Rule 3: Filter offline users from `usersInSpaces`

Users who disconnect keep `current_space_id` set (intentionally, for reload recovery). Their avatars must NOT appear in spaces.

```typescript
// In useUserPresence.ts — usersInSpaces derivation:
if (user.status === 'offline' && user.id !== currentUserId) return;
// Always include current user (may briefly be 'offline' before presence sync)
```

**Also applies server-side:** Capacity checks must exclude offline users (`.neq('status', 'offline')`).

### Rule 4: The `manualChangeRef` guard is sacred

`useLastSpace` has an auto-placement effect that fires on mount/reconnect. Without the guard, it overwrites manual space clicks with the home/default space.

```typescript
// In saveLastSpace():
manualChangeRef.current = true;  // MUST be set BEFORE updating localStorage
setLastSpaceId(spaceId);

// In the auto-placement effect:
if (manualChangeRef.current) {
  manualChangeRef.current = false;
  return; // Skip — user clicked manually
}
```

**Rules:**
- Any function that updates `lastSpaceId` for a manual action MUST set `manualChangeRef.current = true` first
- The auto-placement effect MUST check `manualChangeRef` before doing anything
- Never add new callers of `setLastSpaceId` without going through `saveLastSpace`

### Rule 5: Never use `CompanyContext.currentUserProfile` for reactive guards

`currentUserProfile` is loaded once and NEVER updated when Realtime events change the user's DB row.

**Use `presenceAwareUsers` (from query cache) for:**
- Checking if user is already in a space
- Determining online/offline status
- Any guard condition that depends on current space or status

**`currentUserProfile` is OK for:** user ID, company ID, role, email (rarely change).

---

## Derived Status Logic (do not break this)

```typescript
// In presenceAwareUsers derivation:
const isOnline = onlineUserIds.has(user.id); // From Realtime presence

if (isOnline) {
  // User is in Realtime presence -> they're online
  derivedStatus = user.status === 'offline' ? 'online' : user.status;
} else if (isPresenceReady) {
  // Presence has synced and user is NOT in it
  // Only override 'online' -> 'offline'. Keep 'away'/'busy' (intentional DB statuses)
  if (!user.status || user.status === 'online') derivedStatus = 'offline';
}
```

The `isPresenceReady` flag prevents premature offline derivation before the first presence sync completes.

---

## Query Cache Keys

| Key | What it caches | Updated by |
|-----|---------------|------------|
| `['user-presence']` | All users with presence data | Realtime `postgres_changes` on `users` table |

Optimistic updates after `safeUpdateLocation` success:
```typescript
queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
  if (!old) return old;
  return old.map(u => u.id === currentUserId ? {...u, currentSpaceId: spaceId} : u);
});
```

**Do NOT** invalidate the query unnecessarily — the Realtime subscription handles updates.

---

## Beacon Handler Details

In `useUserPresence.ts`, the `beforeunload` handler:
1. Saves disconnect timestamp to localStorage
2. Sends `sendBeacon('/api/users/location', { userId, spaceId: null, offline: true })`

In `route.ts`, the POST handler (beacon path):
1. Parses `text/plain` body (beacon sends as text)
2. When `offline: true`: ONLY sets `status: 'offline'`, preserves `current_space_id`
3. Returns 200

**The `spaceId: null` in the beacon payload is intentionally IGNORED by the server when `offline: true`.**

---

## Before You Code: Checklist

Run through this before every change:

- [ ] **Single API call**: Trace the full click/action flow. Confirm only one `updateLocation` fires.
- [ ] **No beacon race**: The `beforeunload` beacon does NOT clear `current_space_id`.
- [ ] **Offline filter**: `usersInSpaces` excludes offline users (except current user).
- [ ] **Capacity check**: Server-side capacity excludes offline users.
- [ ] **Manual click guard**: `saveLastSpace` sets `manualChangeRef` before localStorage update.
- [ ] **No stale state**: Effects checking `currentSpaceId` use query-derived values, not CompanyContext.
- [ ] **Tests pass**: Run `npx vitest run __tests__/api/users-location-route.test.ts`
- [ ] **Presence derivation intact**: `presenceAwareUsers` logic unchanged or correctly extended.

---

## Debugging Protocol

When investigating a presence/space bug:

1. **Check DB state** — What does `users.current_space_id` and `users.status` say?
2. **Check console logs** — Filter for `[useLastSpace]`, `[Presence]`, `[updateLocation]`
3. **Check Network tab** — How many `/api/users/location` requests fire per action?
4. **Check Realtime events** — Are `postgres_changes` events arriving as expected?
5. **NEVER guess the root cause** — Prove it with runtime evidence before editing code.

---

## File Quick Reference

For detailed code, read these files using the Read tool:

| File | What to look for |
|------|-----------------|
| `src/hooks/useUserPresence.ts` | `safeUpdateLocation`, `presenceAwareUsers`, `usersInSpaces`, beacon handler, Realtime subscription |
| `src/hooks/useLastSpace.ts` | `manualChangeRef`, `saveLastSpace`, auto-placement effect, `getReconnectionContext` |
| `src/app/api/users/location/route.ts` | `offline` flag handling, capacity check, `syncSpacePresenceLog` |
| `src/components/floor-plan/modern/ModernFloorPlan.tsx` | `handleEnterSpace` — the ONLY place that calls `updateLocation` on click |
| `src/components/floor-plan/floor-plan.tsx` | `handleSpaceSelect` — UI state + `saveLastSpace` only, NO API calls |
| `src/contexts/PresenceContext.tsx` | Thin wrapper exposing `useUserPresence` |
| `src/contexts/CompanyContext.tsx` | `currentUserProfile` — stale for space/status, OK for ID/role |

---

## Common Mistakes by AI Agents

These are patterns that have caused regressions in the past. If you find yourself doing any of these, STOP:

1. **Adding `updateLocation` to `handleSpaceSelect`** — It's already called by `handleEnterSpace`. This creates double API calls.
2. **Clearing `current_space_id` in the beacon handler** — This causes the beacon race condition (avatars disappear on reload).
3. **Using `currentUserProfile.currentSpaceId` in an effect guard** — This is stale. Use `presenceAwareUsers`.
4. **Including offline users in `usersInSpaces`** — Creates ghost avatars in spaces.
5. **Calling `setLastSpaceId` without setting `manualChangeRef` first** — The auto-placement effect will snap the user to their home space.
6. **Adding a new Realtime subscription for the same data** — Use the existing `postgres_changes` listener in `useUserPresence`. Don't add another.
7. **Mutating `rawUsers` query data in the presence leave handler** — This breaks the derivation logic. Let `presenceAwareUsers` handle it through `onlineUserIds`.
8. **Removing the `isPresenceReady` guard** — Without it, everyone appears offline until the first presence sync.
