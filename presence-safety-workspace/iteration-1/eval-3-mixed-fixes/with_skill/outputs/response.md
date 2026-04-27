# Presence Safety Analysis: Mixed Fixes Request

## What the User Asked

The user reported two issues and requested fixes for both:

1. **Bug: Offline users showing as avatars in spaces.** The user says `usersInSpaces` in `useUserPresence.ts` does not filter by status.
2. **Feature: Use `currentUserProfile` from `CompanyContext` to check if the current user is already in a space before letting them join another one.**

## Analysis

### Fix 1: Offline users in `usersInSpaces` -- Already Fixed

After reading the current code in `useUserPresence.ts` (lines 294-306), the offline filter **already exists**:

```typescript
const usersInSpaces = useMemo(() => {
  const map = new Map<string | null, UserPresenceData[]>();
  (presenceAwareUsers ?? []).forEach((user) => {
    // Offline users should not appear in spaces -- their avatar is hidden.
    // Always include the current user so they see their own avatar immediately
    // (before Realtime presence overrides their DB status from offline to online).
    if (user.status === 'offline' && user.id !== currentUserId) return;
    const key = user.currentSpaceId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(user);
  });
  return map;
}, [presenceAwareUsers, currentUserId]);
```

This correctly:
- Filters out users whose derived status is `'offline'` (line 300)
- Keeps the current user even if briefly offline (the exception on line 300)
- Uses `presenceAwareUsers` (which derives status from Realtime presence), not `rawUsers`

**No code change is needed for this fix.** The filter is already in place. If offline users are still appearing as ghosts, the root cause is elsewhere -- likely in the `presenceAwareUsers` derivation or the `isPresenceReady` flag timing. Per the skill's debugging protocol (and CLAUDE.md's bug fixing rules), we should NOT guess at a fix without runtime evidence confirming the actual root cause.

**Recommendation:** If the user is still seeing ghost avatars, we need to debug with runtime evidence:
- Check the browser console for `[Presence]` logs to see what `presenceAwareUsers` derives for the ghost users
- Check if `isPresenceReady` is `true` when ghosts appear
- Check if the ghost users have status `'away'` or `'busy'` in the DB (these are intentionally NOT overridden to offline -- see `presenceAwareUsers` derivation at lines 146-156)

### Fix 2: Using `currentUserProfile` for "already in space" guard -- MUST NOT DO THIS

The skill document explicitly forbids this in **Rule 5**:

> **Rule 5: Never use `CompanyContext.currentUserProfile` for reactive guards**
>
> `currentUserProfile` is loaded once and NEVER updated when Realtime events change the user's DB row.
>
> **Use `presenceAwareUsers` (from query cache) for:**
> - Checking if user is already in a space
> - Determining online/offline status
> - Any guard condition that depends on current space or status

And in the **Common Mistakes by AI Agents** section:

> **3. Using `currentUserProfile.currentSpaceId` in an effect guard** -- This is stale. Use `presenceAwareUsers`.

The reason is clear: `currentUserProfile` in `CompanyContext` is loaded once during `loadCompanyData()` (line 83 of CompanyContext.tsx) and is never updated by Realtime events. If the user moves spaces, `currentUserProfile.currentSpaceId` remains stale at whatever value it had on initial load. Using it as a guard would:

- Allow users to "join" a space they're already in (because the stale value doesn't reflect the move)
- Block users from joining spaces they should be able to join (because the stale value thinks they're still in an old space)

**Furthermore, this guard already exists using the correct data source.** In `ModernFloorPlan.tsx` (lines 398-414):

```typescript
const currentUser = users?.find(u => u.id === currentUserProfile.id);
const isAlreadyInSpace = currentUser?.currentSpaceId === spaceId;

// ... later:
if (isAlreadyInSpace) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`User already in space ${spaceId}`);
  }
  return;
}
```

Here, `users` comes from `presenceAwareUsers` (the query-cache-derived, Realtime-updated list), which is the correct and reactive source. The check at line 401 already prevents re-entering the same space.

Additionally, `safeUpdateLocation` in `useUserPresence.ts` (lines 262-267) has a second guard:

```typescript
if (currentUser && currentUser.currentSpaceId === spaceId && spaceId !== null) {
  console.log('[Presence] User already in this space, skipping update');
  lastUpdateRef.current = updateKey;
  return;
}
```

This uses `currentUser` derived from `rawUsers` (the query cache), which is also reactive.

**No code change is needed for this fix either.** The "already in space" guard exists in two places, both using the correct reactive data source.

## Correct Approach

**Neither change should be implemented.** Here is why:

| Request | Status | Reason |
|---------|--------|--------|
| Filter offline users from `usersInSpaces` | Already implemented (line 300) | Code already filters `user.status === 'offline'` for non-current users |
| Use `currentUserProfile` for "already in space" check | MUST NOT DO | Violates Rule 5 of the presence-safety skill; `currentUserProfile` is stale; the guard already exists using `presenceAwareUsers` |

## If Ghost Avatars Are Actually Appearing

If the user genuinely sees offline users rendered in spaces despite the existing filter, the bug is not in `usersInSpaces`. Possible root causes to investigate with runtime evidence:

1. **`isPresenceReady` is false** -- meaning `presenceAwareUsers` keeps the DB status as-is, and if DB has `status: 'online'` for a disconnected user, they won't be filtered. Check console for `[Presence] Supabase subscription status: SUBSCRIBED` and whether the current user appears in `presenceState`.

2. **Users have `status: 'away'` or `'busy'` in DB** -- these are intentional statuses that are NOT overridden to `'offline'` even when the user is not in Realtime presence. This is by design (lines 150-155). If these users also have `current_space_id` set, they will appear in spaces.

3. **The beacon handler is not firing** -- if `beforeunload` doesn't fire (e.g., browser crash), the user's DB status stays `'online'` and `current_space_id` stays set. The Realtime presence `leave` event should eventually mark them offline via `presenceAwareUsers`, but only after `isPresenceReady` is true.

**Debugging steps before any code change:**
```
// In browser console, check:
// 1. Is presence ready?
// 2. What does presenceAwareUsers show for the ghost user?
// 3. Is the ghost user in onlineUserIds?
// 4. What is their DB status?
```

## Summary

Both requested changes are either already implemented or would violate the presence system's safety rules. No code changes are proposed. If the ghost avatar bug persists, runtime debugging is needed to identify the actual root cause before any code is modified.

Status: Pending user confirmation.
