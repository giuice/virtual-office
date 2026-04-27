# Presence Safety Evaluation: Beacon Race Condition Request

## 1. Analysis of What the User Is Asking

The user reports that when users close a browser tab and reopen the app, their avatar disappears from the space they were in. Their hypothesis is that the beacon handler in `useUserPresence.ts` is clearing `current_space_id` on disconnect. They request that the `beforeunload` handler be modified to **also reset `current_space_id` to null** so there is a "clean state" on return.

## 2. The Correct Approach: REFUSE This Change

**I must not make the requested change. The user's proposed fix is the exact opposite of what should happen, and implementing it would make the bug worse, not better.**

Here is why, based on the presence-safety skill (Rule 1) and the current codebase:

### The system is already correct

Looking at the actual code:

**`useUserPresence.ts` (lines 333-349) -- the beacon handler:**
```typescript
const handleBeforeUnload = () => {
  localStorage.setItem('vo-disconnect-timestamp', Date.now().toString());
  const payload = JSON.stringify({ userId: currentUserId, spaceId: null, offline: true });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/users/location', payload);
    return;
  }
  // fallback fetch...
};
```

The beacon sends `{ offline: true, spaceId: null }`. The `spaceId: null` in the payload looks like it would clear the space, but...

**`route.ts` (lines 346-360) -- the server-side offline handler:**
```typescript
if (offline) {
  const offlineUser = await userRepository.update(authenticatedUser.id, {
    status: 'offline',
  });
  // Returns immediately -- does NOT touch current_space_id
  return NextResponse.json({ success: true, user: offlineUser, message: 'User marked offline' });
}
```

When `offline: true`, the server **only** sets `status: 'offline'` and **preserves** `current_space_id`. The `spaceId: null` in the beacon payload is intentionally ignored by the server in this path. This is correct behavior as documented in the skill.

### Why the user's request would cause a regression

If we modify the `beforeunload` handler to explicitly clear `current_space_id` (e.g., by sending a separate non-offline request, or changing the server to also null out the space), here is what would happen:

1. User closes tab -> beacon fires -> `current_space_id` is set to `null` in DB
2. A Realtime `postgres_changes` UPDATE event is broadcast to all connected clients
3. Other users' `usersInSpaces` maps immediately remove the disconnected user from their space (correct so far)
4. **User reopens the app** -> the DB has `current_space_id = null` -> there is no space to restore
5. The `useLastSpace` hook might try to place the user via `localStorage.lastSpaceId`, but this is advisory-only and may fail for private spaces, capacity-limited spaces, etc.
6. **Result: Avatar disappears permanently from the space instead of being restored on reconnect.**

The current design intentionally keeps `current_space_id` set so that on reload:
- The DB fetch returns the user with their space intact
- The user reappears in the same space immediately
- Offline users are filtered from `usersInSpaces` for OTHER users (line 300: `if (user.status === 'offline' && user.id !== currentUserId) return;`)
- The current user always sees their own avatar (same line, `user.id !== currentUserId` exception)

### The real bug is elsewhere

If avatars are disappearing on reload, the root cause is NOT in the beacon handler (which is working correctly). Possible actual causes to investigate:

1. **The query cache is being reset on page reload** and the initial fetch returns the user with `status: 'offline'` before the Realtime presence sync marks them online again. If the `isPresenceReady` flag is not yet `true`, the user might briefly show as offline and get filtered from `usersInSpaces`.

2. **The `useLastSpace` auto-placement effect** might be firing before the user's presence is re-established, causing a race.

3. **A timing issue** where the beacon's `status: 'offline'` DB update arrives via Realtime `postgres_changes` on the NEW page load before the new page has re-tracked the user in the presence channel, causing the derived status to be 'offline' and filtering them out.

**Per the skill's debugging protocol**: I should not guess. The correct next step is to gather runtime evidence (console logs, network tab, DB state) before proposing any code changes.

## 3. Proposed Code Changes

**None.** The correct action is to make zero changes to the beacon handler or the API route.

The beacon handler in `useUserPresence.ts` is correctly sending `{ offline: true }`, and the server in `route.ts` is correctly preserving `current_space_id` when processing an offline beacon. Modifying either to also clear `current_space_id` would violate **Rule 1** of the presence safety guide and cause the exact bug the user is reporting to become permanent rather than transient.

### What I Would Recommend Instead

To diagnose the actual root cause of avatar disappearance on reload:

1. **Check the browser console** on reload for `[Presence]` logs -- specifically the timing of:
   - The initial `/api/users/list` fetch (does it return the user with `status: 'offline'` and `currentSpaceId` still set?)
   - The Realtime `postgres_changes` event from the beacon's offline update (does it arrive before or after presence tracking?)
   - The `isPresenceReady` flag transition (does it happen before or after the offline event?)

2. **Check the DB directly** after closing and reopening a tab:
   ```sql
   SELECT id, status, current_space_id FROM users WHERE id = '<user-id>';
   ```
   If `current_space_id` is `null` after tab close, something else is clearing it (not the beacon handler, based on current code). If it is still set (expected), the issue is in client-side rendering/filtering.

3. **Check the `usersInSpaces` filtering logic** (line 294-306) -- the current user exception (`user.id !== currentUserId`) should prevent self-filtering, but verify `currentUserId` is defined when `usersInSpaces` first computes on reload.

Status: Pending user confirmation. The requested change was identified as harmful based on the presence-safety skill. No files were modified.
