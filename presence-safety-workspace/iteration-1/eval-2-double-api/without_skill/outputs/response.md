# Analysis: Adding `updateLocation` to `handleSpaceSelect`

## What the User Is Asking

The user reports that clicking a space in the floor plan feels laggy and traced the issue to `handleSpaceSelect` in `floor-plan.tsx`, which only sets UI state. They request adding an `updateLocation(space.id)` call inside `handleSpaceSelect` to ensure the DB gets updated immediately when the user clicks.

## Why This Change Must NOT Be Made

**This is a textbook instance of Pitfall 3 ("The Double-Call Trap") documented in `docs/presence-space-pitfalls-guide.md`.**

### The Existing Click Flow (Correct, Single API Call)

The full click chain already works like this:

1. User clicks a space card in `ModernSpaceCard`
2. `ModernSpaceCard` calls `onEnterSpace(space.id)` (line 213/221 of `ModernSpaceCard.tsx`)
3. This invokes `ModernFloorPlan.handleEnterSpace(spaceId)` (line 375 of `ModernFloorPlan.tsx`)
4. `handleEnterSpace` validates capacity, access control, status, and duplicate entry
5. `handleEnterSpace` calls `await updateLocation(spaceId)` (line 419) -- **this is THE API call**
6. After the API call succeeds, `handleEnterSpace` calls `onSpaceSelect?.(selectedSpace)` (line 434)
7. This invokes `FloorPlan.handleSpaceSelect(space)` (line 205 of `floor-plan.tsx`)
8. `handleSpaceSelect` sets UI state and saves to localStorage

```
User clicks space card
  -> ModernSpaceCard.onEnterSpace(spaceId)
     -> ModernFloorPlan.handleEnterSpace(spaceId)
        -> validates (capacity, access, status, duplicate)
        -> await updateLocation(spaceId)           <-- THE ONLY API CALL
        -> onSpaceSelect(space)
           -> FloorPlan.handleSpaceSelect(space)
              -> setSelectedSpace, setHighlightedSpaceId   <-- UI state only
              -> saveLastSpace(space.id)                   <-- localStorage only
```

### What Would Go Wrong If We Add `updateLocation` to `handleSpaceSelect`

Adding `updateLocation(space.id)` to `handleSpaceSelect` would cause:

1. **Double API call**: Every space click would fire TWO `PUT /api/users/location` requests -- one from `handleEnterSpace` and one from `handleSpaceSelect`. The `safeUpdateLocation` function in `useUserPresence.ts` has a debounce guard and a duplicate-detection check (`lastUpdateRef`), but the first call already mutates state, and the second call would either:
   - Be silently skipped (wasting a function call and confusing debugging)
   - Race with the first call if timing is unlucky, causing inconsistent state

2. **Bypass of validation**: `handleEnterSpace` performs critical checks before calling `updateLocation`:
   - Capacity check (is the space full?)
   - Status check (is the space available/active?)
   - Access control check (is the space private? does the user have permission?)
   - Duplicate entry check (is the user already in this space?)

   If `handleSpaceSelect` independently calls `updateLocation`, it bypasses ALL of these validations.

3. **Breaking the architecture**: The existing comment in `handleSpaceSelect` (lines 208-211) explicitly documents this design:
   ```typescript
   // Only persist to localStorage for reconnection recovery.
   // The actual API call (updateLocation) is already handled by
   // ModernFloorPlan.handleEnterSpace BEFORE this callback fires.
   ```

4. **Conflict with recent fixes**: The most recent commits (`9adf3e2`, `ac5c7bd`) specifically fixed a double `updateLocation` bug. Adding it back would reintroduce the exact issue that was just resolved.

## The Correct Approach: Investigate the Perceived Lag

The user's perception of lag is real, but the root cause is NOT a missing API call. Possible actual causes:

### Likely Cause: The `updateLocation` debounce (250ms)

In `useUserPresence.ts` (line 236), `debouncedUpdateLocation` has a 250ms debounce:
```typescript
debounce(async (spaceId: string | null) => {
  // ...API call...
}, 250, { leading: true, trailing: false })
```

With `leading: true`, the first call fires immediately, but `safeUpdateLocation` wraps it with additional checks and an `updateInProgress` guard that could delay the visual feedback.

### Likely Cause: Optimistic update timing

After the API call succeeds, `safeUpdateLocation` does an optimistic query cache update (line 284). But the `handleEnterSpace` function `await`s the `updateLocation` call before calling `onSpaceSelect`. This means the UI state (highlighted card, selected space) only updates AFTER the network round-trip completes.

### Recommended Fix: Optimistic UI Update Before API Call

Instead of adding a duplicate API call, the fix should move the UI feedback to happen BEFORE the API call completes. Here is the proposed change:

#### Option A: Move `onSpaceSelect` before `await updateLocation` in `ModernFloorPlan.tsx`

```diff
--- a/src/components/floor-plan/modern/ModernFloorPlan.tsx
+++ b/src/components/floor-plan/modern/ModernFloorPlan.tsx
@@ -414,6 +414,10 @@
       setError(null);

+      // Optimistic UI feedback: update parent state immediately so the
+      // selection highlight and sidebar feel instant.
+      onSpaceSelect?.(selectedSpace);
+
       try {
         await updateLocation(spaceId);
         if (approvedKnockSpaceIdRef.current === spaceId) {
@@ -429,10 +433,8 @@
         }
       }

-      if (selectedSpace) {
-        onSpaceSelect?.(selectedSpace);
-        onOpenChat?.(selectedSpace);
-      }
+      // Open chat after the location update succeeds (requires DB state)
+      onOpenChat?.(selectedSpace);
     } catch (error) {
       if (error instanceof Error) {
         console.error('Space transition failed:', error.message);
```

This way, the UI highlights the space immediately (optimistic), while the API call runs in the background. If the API call fails, the error is displayed and the user can retry.

#### Option B: Keep the flow as-is but add optimistic cache update earlier

The existing `safeUpdateLocation` already does an optimistic query cache update, but it happens after the debounced API call resolves. Moving it before the fetch would also help:

```diff
--- a/src/hooks/useUserPresence.ts
+++ b/src/hooks/useUserPresence.ts
@@ -271,13 +271,13 @@
     setUpdateInProgress(true);

     try {
-      // Update immediately (apply debounce internally)
-      await debouncedUpdateLocation(spaceId);
-
-      // Mark this update as completed
-      lastUpdateRef.current = updateKey;
-
-      // Manually update local state to show immediate feedback
+      // Optimistic: update local state immediately for instant visual feedback
       if (currentUser) {
         queryClient.setQueryData<UserPresenceData[]>(PRESENCE_QUERY_KEY, (old) => {
           if (!old) return old;
           return old.map(u => u.id === currentUserId ? {...u, currentSpaceId: spaceId} : u);
         });
       }
+
+      // Then fire the actual API call
+      await debouncedUpdateLocation(spaceId);
+
+      // Mark this update as completed
+      lastUpdateRef.current = updateKey;
     } finally {
       setUpdateInProgress(false);
     }
```

## Summary

| Action | Verdict |
|--------|---------|
| Add `updateLocation` to `handleSpaceSelect` | **REJECT** -- causes double API call, bypasses validation, contradicts architecture |
| Investigate perceived lag | **CORRECT** approach |
| Move `onSpaceSelect` before `await updateLocation` | **RECOMMENDED** -- gives instant UI feedback |
| Move optimistic cache update before API fetch | **RECOMMENDED** -- makes avatar appear instantly |

The user's instinct (something feels laggy) is valid. The proposed fix (add another API call) would introduce a regression that was specifically debugged and fixed in recent commits. The correct fix is to make the existing single-API-call flow provide faster visual feedback through optimistic updates.
