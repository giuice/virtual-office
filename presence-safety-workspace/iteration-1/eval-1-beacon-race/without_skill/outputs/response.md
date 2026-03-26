# Analysis: Beacon Handler and Space Persistence on Tab Close/Reopen

## 1. What the User is Asking

The user reports that when a user closes their browser tab and reopens the app, their avatar disappears from the space they were in. They believe the beacon handler in `useUserPresence.ts` is clearing `current_space_id` on disconnect, and they want the `beforeunload` handler modified to "reset current_space_id to null so we have a clean state when they come back."

## 2. Why the User's Proposed Fix is Wrong (and Would Make Things Worse)

**The user's diagnosis is partially correct but their proposed solution is backwards.** Let me explain:

### Current behavior (already correct in the server route)

Looking at `src/app/api/users/location/route.ts` lines 342-359, the `offline` branch **already preserves `current_space_id`** -- it only sets `status: 'offline'`:

```typescript
// Offline beacon (tab close / reload): only mark status offline, preserve space.
// The user's current_space_id stays set so they reappear in the same space on
// reload (no grace-rejoin race). Offline users are filtered from space avatars
// on the client, so stale positions don't affect other users' views.
if (offline) {
  const offlineUser = await userRepository.update(authenticatedUser.id, {
    status: 'offline',
  });
  // ...
}
```

This is the **intentional, correct** design. The comment explicitly explains why: keeping `current_space_id` set means the user can reappear in the same space on reload without needing to race through the grace-rejoin flow.

### The client-side beacon payload is misleading

In `useUserPresence.ts` lines 333-349, the `beforeunload` handler sends:

```typescript
const payload = JSON.stringify({ userId: currentUserId, spaceId: null, offline: true });
navigator.sendBeacon('/api/users/location', payload);
```

The payload includes `spaceId: null`, but this is **irrelevant** because the server-side route's `offline` branch (lines 346-359) short-circuits **before** it ever uses `spaceId`. It only calls `userRepository.update(id, { status: 'offline' })` and returns. The `spaceId: null` in the payload is dead data -- it never gets applied to the database.

### What the user is actually proposing

The user wants to add `current_space_id = null` to the beforeunload flow. This would **cause the exact problem they're trying to fix**:

1. User closes tab
2. Beacon fires, clears `current_space_id` to `null` in DB
3. User reopens app
4. App loads user from DB -- `current_space_id` is `null`
5. User has no space, avatar disappears

The current design intentionally keeps `current_space_id` set so that step 4 returns the user to their space. **Clearing it would break the reload recovery.**

## 3. The Real Root Cause

The avatar disappearing is caused by a **different mechanism entirely**. After analyzing the full flow, the real problems are:

### Problem A: Client-side filtering of offline users from space avatars

In `useUserPresence.ts` lines 294-306, the `usersInSpaces` memo filters out offline users:

```typescript
const usersInSpaces = useMemo(() => {
  const map = new Map<string | null, UserPresenceData[]>();
  (presenceAwareUsers ?? []).forEach((user) => {
    if (user.status === 'offline' && user.id !== currentUserId) return;
    // ...
  });
  return map;
}, [presenceAwareUsers, currentUserId]);
```

Note: it exempts the current user (`user.id !== currentUserId`). So the current user always sees themselves. But **other users** viewing the floor plan will filter out the reloading user because:
- The beacon sets `status = 'offline'` in the DB
- The postgres_changes realtime event propagates this to all connected clients
- Those clients filter the user out of `usersInSpaces`

This is actually **expected behavior** -- the user IS offline during the reload window. The issue is how quickly the user comes back online.

### Problem B: The `presenceAwareUsers` derivation overrides DB status

In `useUserPresence.ts` lines 135-164, when `isPresenceReady` is true and a user is not in the Supabase Realtime presence state, their status is derived as `'offline'` (line 152), even if the DB says they have a `current_space_id`. Since `usersInSpaces` filters by `status === 'offline'`, the user disappears from the floor plan even though their `current_space_id` is still set in the DB.

### Problem C: Race between reload and presence re-establishment

The sequence on tab close + reopen:
1. Tab closes -- beacon marks user `status: 'offline'` (space preserved in DB)
2. New tab opens -- React initializes, queries `/api/users/list` (user has `current_space_id` set, `status: 'offline'`)
3. Supabase Realtime channel subscribes, presence tracks
4. `useLastSpace` placement effect runs -- but the user already has `currentSpaceId` in the query data (from step 2), so it may skip the update (line 375: `if (currentUser.currentSpaceId === context.spaceId)`)
5. The user's status remains `'offline'` in the DB until something explicitly sets it to `'online'`

**The missing piece**: Nothing in the reload flow sets `status` back to `'online'`. The beacon sets it to `'offline'`, but the reconnection only updates `current_space_id` (via `updateLocation`), and the Realtime presence `track()` only updates the ephemeral presence state, not the DB `status` column.

## 4. The Correct Fix

The fix should NOT clear `current_space_id` on disconnect. Instead, it should ensure the user's `status` is set back to `'online'` when they reconnect. Here are the specific changes:

### Change 1: Set user status to 'online' when Realtime presence is established

In `src/hooks/useUserPresence.ts`, when the channel subscription is established and the user tracks their presence, also update their DB status to 'online':

```diff
--- a/src/hooks/useUserPresence.ts
+++ b/src/hooks/useUserPresence.ts
@@ -493,6 +493,16 @@
         case 'SUBSCRIBED': {
           setConnectionStatus('subscribed');
           setIsInitialized(true);
           handlePresenceSnapshot();

+          // If user was previously offline (e.g., after a reload), mark them
+          // online in the DB so other clients' usersInSpaces stops filtering
+          // them out. This closes the gap where the beacon sets status=offline
+          // but nothing sets it back to online on reconnection.
+          void fetch('/api/users/status', {
+            method: 'PUT',
+            headers: { 'Content-Type': 'application/json' },
+            body: JSON.stringify({ userId: currentUserId, status: 'online' }),
+          }).catch((err) => {
+            console.error('[Presence] Failed to restore online status after reconnect:', err);
+          });
+
           const payload = buildPresencePayload();
           const signature = computePresenceSignature(payload);
```

However, if there is no `/api/users/status` endpoint, a simpler approach is to incorporate the status update into the existing location update flow. Since the `useLastSpace` hook's `updateUserLocation` already calls `/api/users/location` on reconnect, we should ensure that call also sets `status: 'online'`.

### Change 2 (alternative, simpler): Update the location route to set status='online' on non-offline updates

In `src/app/api/users/location/route.ts`, when a normal (non-offline) location update comes in, also set the user's status to 'online':

```diff
--- a/src/app/api/users/location/route.ts
+++ b/src/app/api/users/location/route.ts
@@ -388,6 +388,13 @@

     const updatedUser = await userRepository.updateLocation(authenticatedUser.id, spaceId);

+    // If the user was offline (e.g., reconnecting after tab close), restore
+    // their status to 'online'. This ensures other clients stop filtering
+    // them out of usersInSpaces.
+    if (authenticatedUser.status === 'offline') {
+      await userRepository.update(authenticatedUser.id, { status: 'online' });
+    }
+
     if (!updatedUser) {
       return NextResponse.json({ error: 'Failed to update user location' }, { status: 500 });
     }
```

### Change 3: Ensure the useLastSpace placement effect handles the "already in space" case on reload

In `src/hooks/useLastSpace.ts`, when the user already has `currentSpaceId` matching the target (line 375), still ensure their status is updated to 'online' by making a lightweight status-only API call:

```diff
--- a/src/hooks/useLastSpace.ts
+++ b/src/hooks/useLastSpace.ts
@@ -373,6 +373,15 @@
     if (currentUser.currentSpaceId === context.spaceId) {
       console.log('[useLastSpace] Already in target space, setting updateKey only');
       lastUpdateRef.current = updateKey;
       setLastSpaceId(context.spaceId);
+
+      // The user's current_space_id is correct (preserved by the beacon's
+      // offline-only update), but their status may still be 'offline' from
+      // the beacon. Ensure we update location to trigger status='online'.
+      if (currentUser.status === 'offline') {
+        void updateUserLocation(currentUser.id, context.spaceId, {
+          contextType: context.type,
+          spaceName: context.spaceName,
+        });
+      }
+
       if (context.type === 'first-time') {
         markFirstLoginComplete();
       }
```

## 5. Summary

| What | Details |
|------|---------|
| User's diagnosis | Partially correct -- the beacon handler IS involved, but it already preserves `current_space_id` |
| User's proposed fix | **Wrong** -- clearing `current_space_id` to null on disconnect would make the problem worse, not better |
| Actual root cause | After the beacon sets `status='offline'`, nothing sets it back to `'online'` on reconnect. Other clients filter offline users out of space views. |
| Correct fix | Ensure the reconnection flow restores `status='online'` in the DB, either in the location route (for all non-offline updates) or in the useLastSpace placement logic when detecting the user is already in the correct space but still marked offline |

The existing design of preserving `current_space_id` while only setting `status='offline'` on disconnect is architecturally sound. The gap is the missing status restoration on the return path.
