# Analysis and Proposed Fixes

## What the User Is Asking

Two separate issues:

1. **Offline users showing as avatars in spaces**: The user reports that `usersInSpaces` in `useUserPresence.ts` does not filter by status, so offline users still appear in space avatar groups on the floor plan.

2. **Prevent joining a second space without leaving the first**: The user wants to use `currentUserProfile` from `CompanyContext` to check if the current user is already in a different space before allowing them to join another one.

---

## Issue 1: Offline Users in `usersInSpaces`

### Analysis

**The user's diagnosis is incorrect.** Looking at the actual code in `useUserPresence.ts` (lines 294-306), the `usersInSpaces` memo already filters out offline users:

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

The filter `if (user.status === 'offline' && user.id !== currentUserId) return;` explicitly skips offline users. The bug is therefore **not** a missing filter in `usersInSpaces`, but rather that users who are truly offline still have `status !== 'offline'` when they reach this memo.

### Root Cause

The real issue is in the `presenceAwareUsers` derivation (lines 135-164). The status override logic has a nuance:

```typescript
if (isPresenceReady && (!user.status || user.status === 'online')) {
  derivedStatus = 'offline';
}
```

This only overrides to `'offline'` if the presence system is ready AND the user's DB status is `'online'` (or empty). But there are two scenarios where offline users slip through:

1. **Before `isPresenceReady` is true**: All DB statuses are trusted as-is, so a user with DB status `'online'` and a non-null `currentSpaceId` in the database will appear in the space even if they are actually offline. This is a deliberate tradeoff (to avoid flashing everyone as offline on initial load), but it can persist if the presence system takes time to initialize.

2. **Users with stale `currentSpaceId` in the database**: When a user closes their browser, the `beforeunload` handler fires a beacon to `/api/users/location` to set `spaceId: null`. If that beacon fails (e.g., network dropped, browser killed), the user's `current_space_id` remains set in the DB while their status eventually gets derived as `'offline'`. The `usersInSpaces` filter catches this case correctly. However, if the DB `status` column itself was never updated to `'offline'` (e.g., only the presence channel detected the departure, but no DB write happened), the user may appear with `status: 'away'` or `status: 'busy'` (which are intentionally preserved), and they'll pass through the offline filter since they're not `'offline'`.

### Correct Approach

The proper fix is to add an additional guard in `usersInSpaces`: **users who have a non-null `currentSpaceId` but are NOT in the Realtime presence state** (and the presence system is ready) should be excluded. This catches stale DB records.

Additionally, we should filter users with `currentSpaceId === null` out of the space map entries entirely (they should only appear in the `null` key group, representing "not in any space").

### Proposed Code Change for `useUserPresence.ts`

```diff
 const usersInSpaces = useMemo(() => {
   const map = new Map<string | null, UserPresenceData[]>();
   (presenceAwareUsers ?? []).forEach((user) => {
     // Offline users should not appear in spaces -- their avatar is hidden.
     // Always include the current user so they see their own avatar immediately
     // (before Realtime presence overrides their DB status from offline to online).
     if (user.status === 'offline' && user.id !== currentUserId) return;
+
+    // Additional guard: if presence system is ready and user is NOT in the
+    // Realtime presence state, they are likely stale DB records. Exclude them
+    // from appearing in spaces (but always keep the current user).
+    if (
+      isPresenceReady &&
+      user.id !== currentUserId &&
+      user.currentSpaceId !== null &&
+      !onlineUserIds.has(user.id)
+    ) {
+      return;
+    }
+
     const key = user.currentSpaceId ?? null;
     if (!map.has(key)) map.set(key, []);
     map.get(key)!.push(user);
   });
   return map;
- }, [presenceAwareUsers, currentUserId]);
+ }, [presenceAwareUsers, currentUserId, isPresenceReady, onlineUserIds]);
```

This ensures that once the presence system has synced, any user who claims to be in a space (via `currentSpaceId`) but is not actually tracked in the Realtime presence channel will be excluded from the floor plan avatar display. The current user is always exempt to preserve the "instant feedback" UX.

---

## Issue 2: Prevent Joining a Second Space

### Analysis

The user wants to use `currentUserProfile` from `CompanyContext` to check if the current user is already in a space. However, `currentUserProfile` (type `User`) has a `currentSpaceId` field, but this value is **loaded once on initial data fetch** from `CompanyContext.loadCompanyData()` and is **never updated in real-time**. It will be stale after the first space change.

The correct source of truth for the current user's space is the **presence system** -- specifically `currentUser?.currentSpaceId` derived from `useUserPresence`, which is kept up-to-date via Realtime subscriptions and optimistic updates.

Looking at `ModernFloorPlan.tsx`, the `handleEnterSpace` function (lines 375-446) already has a check:

```typescript
const isAlreadyInSpace = currentUser?.currentSpaceId === spaceId;
// ...
if (isAlreadyInSpace) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`User already in space ${spaceId}`);
  }
  return;
}
```

But this only prevents re-entering the *same* space. It does NOT prevent entering a *different* space while already in one. The user's request is: "check if the current user is already in a space before letting them join another one."

### Correct Approach

There are two reasonable behaviors:
- **A) Block the join** and show an error: "You must leave your current space first."
- **B) Auto-leave the current space** and then join the new one (implicit transition).

The existing `safeUpdateLocation` in `useUserPresence.ts` already handles the API call to set the new `spaceId`, which implicitly replaces the old one server-side. The system already supports moving between spaces without explicitly leaving first. So the question is whether we want to **prevent** this or **warn/confirm**.

Given the user's phrasing ("check if the current user is already in a space before letting them join another one"), I'll implement **option A with a toast notification** telling the user they need to leave their current space first. This gives explicit control.

However, I'll also note that using `currentUserProfile` from CompanyContext is the **wrong** source of truth for this check. The right source is the presence-aware user data. I'll use the presence data but I'll show the user how this integrates with CompanyContext if they specifically want to reference it.

### Proposed Code Change for `ModernFloorPlan.tsx`

In `handleEnterSpace`, add a check after the "already in same space" guard:

```diff
 const handleEnterSpace = async (spaceId: string, options?: { allowPrivateBypass?: boolean }) => {
   try {
     if (!currentUserProfile?.id) {
       throw new Error('Cannot update location: user ID missing');
     }

     const selectedSpace = spaces.find(s => s.id === spaceId);
     if (!selectedSpace) {
       throw new Error('Space not found');
     }

     // Space validation checks
     // Story 3.12 - AC3: Client-side check for full capacity
     if (selectedSpace.capacity && (usersInSpaces.get(spaceId)?.length || 0) >= selectedSpace.capacity) {
       setError('Cannot join - space is full');
       return;
     }

     if (selectedSpace.status !== 'available' && selectedSpace.status !== 'active') {
       setError(`This space is currently ${selectedSpace.status}`);
       return;
     }

     const currentUser = users?.find(u => u.id === currentUserProfile.id);
     const isRestrictedSpace = selectedSpace.accessControl?.isPublic === false;
     const hasApprovedKnock = approvedKnockSpaceIdRef.current === spaceId;
     const isAlreadyInSpace = currentUser?.currentSpaceId === spaceId;
     const canDirectEnter = Boolean(isAdmin || options?.allowPrivateBypass || hasApprovedKnock || isAlreadyInSpace);

     if (isRestrictedSpace && !canDirectEnter) {
       setError('This space is private. Please knock to request access.');
       return;
     }

     if (isAlreadyInSpace) {
       if (process.env.NODE_ENV === 'development') {
         console.log(`User already in space ${spaceId}`);
       }
       return;
     }

+    // Prevent joining a new space while already occupying a different one.
+    // The user must explicitly leave their current space first.
+    if (currentUser?.currentSpaceId && currentUser.currentSpaceId !== spaceId) {
+      const currentSpaceName = spaces.find(s => s.id === currentUser.currentSpaceId)?.name || 'another space';
+      setError(`You are currently in "${currentSpaceName}". Please leave it before joining a new space.`);
+      toast.warning('Already in a space', {
+        description: `Leave "${currentSpaceName}" first to join this space.`,
+      });
+      return;
+    }
+
     setError(null);

     try {
       await updateLocation(spaceId);
```

### Why NOT `currentUserProfile` from CompanyContext

The `currentUserProfile` from CompanyContext is fetched once during initialization and updated only via explicit `refreshCompanyData()` calls or `updateUserProfile()`. It does NOT reflect real-time space changes. Using it would cause:

- **False negatives**: User moves to space A, `currentUserProfile.currentSpaceId` is still `null` (stale), so the guard fails to block a second join.
- **False positives**: User leaves a space, but `currentUserProfile.currentSpaceId` still shows the old space, blocking them from joining any space.

The `users` array from `usePresence()` is kept current via Realtime postgres_changes subscriptions and optimistic updates, making it the correct source of truth.

If the user still wants a `CompanyContext`-based fallback (e.g., for the initial render before presence loads), a safe hybrid approach would be:

```typescript
// Use presence data as primary, fall back to CompanyContext profile
const currentOccupiedSpaceId = currentUser?.currentSpaceId ?? currentUserProfile?.currentSpaceId ?? null;
```

But I recommend against this because it introduces a secondary source of truth that can conflict.

---

## Summary of All Changes

### File: `src/hooks/useUserPresence.ts`

**Change**: Add a secondary guard in `usersInSpaces` to exclude users who have a stale `currentSpaceId` in the DB but are not present in the Realtime presence channel.

```typescript
// Lines 294-306, replace the usersInSpaces memo with:
const usersInSpaces = useMemo(() => {
  const map = new Map<string | null, UserPresenceData[]>();
  (presenceAwareUsers ?? []).forEach((user) => {
    // Offline users should not appear in spaces -- their avatar is hidden.
    // Always include the current user so they see their own avatar immediately
    // (before Realtime presence overrides their DB status from offline to online).
    if (user.status === 'offline' && user.id !== currentUserId) return;

    // Additional guard: if presence system is ready and user is NOT in the
    // Realtime presence state, they are likely stale DB records. Exclude them
    // from appearing in spaces (but always keep the current user).
    if (
      isPresenceReady &&
      user.id !== currentUserId &&
      user.currentSpaceId !== null &&
      !onlineUserIds.has(user.id)
    ) {
      return;
    }

    const key = user.currentSpaceId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(user);
  });
  return map;
}, [presenceAwareUsers, currentUserId, isPresenceReady, onlineUserIds]);
```

### File: `src/components/floor-plan/modern/ModernFloorPlan.tsx`

**Change**: In `handleEnterSpace`, after the "already in same space" early return, add a guard that blocks entering a new space if the user already occupies a different one.

```typescript
// After line 414 (after the isAlreadyInSpace check), insert:

    // Prevent joining a new space while already occupying a different one.
    // The user must explicitly leave their current space first.
    if (currentUser?.currentSpaceId && currentUser.currentSpaceId !== spaceId) {
      const currentSpaceName = spaces.find(s => s.id === currentUser.currentSpaceId)?.name || 'another space';
      setError(`You are currently in "${currentSpaceName}". Please leave it before joining a new space.`);
      toast.warning('Already in a space', {
        description: `Leave "${currentSpaceName}" first to join this space.`,
      });
      return;
    }
```

---

## Risk Assessment

- **Issue 1 fix**: Low risk. The additional guard only excludes users who are (a) not the current user, (b) claim to be in a space via DB, and (c) are not tracked in Realtime presence. This is a strict subset of "stale ghost" records. The `isPresenceReady` gate ensures we don't prematurely exclude everyone on initial load.

- **Issue 2 fix**: Medium risk. This is a UX behavior change. Currently, users can freely hop between spaces (the system implicitly moves them). Blocking this requires that the "Leave Space" action is easily accessible and reliable. If the leave button is broken or hidden, users would be stuck. Verify that the `handleLeaveSpace` function and its UI trigger in `ModernSpaceCard` work correctly before shipping this change.

Status: Pending user confirmation.
