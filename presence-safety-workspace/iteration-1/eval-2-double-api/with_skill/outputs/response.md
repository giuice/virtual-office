# Presence Safety Analysis: Adding `updateLocation` to `handleSpaceSelect`

## 1. What the User Is Asking

The user observed that clicking a space in the floor plan feels laggy, traced the issue to `handleSpaceSelect` in `floor-plan.tsx`, and noticed it only sets UI state without calling the API. They request adding `updateLocation(space.id)` inside `handleSpaceSelect` to ensure the database is updated immediately when the user clicks.

## 2. Why This Request MUST Be Rejected

**This is explicitly documented as Common Mistake #1 in the Presence Safety Skill.**

From the skill document (line 238):

> 1. **Adding `updateLocation` to `handleSpaceSelect`** -- It's already called by `handleEnterSpace`. This creates double API calls.

### The Actual Call Flow (Already Correct)

The click flow, as documented in Rule 2 and confirmed by reading the source code:

```
User clicks space card
  -> ModernFloorPlan.handleEnterSpace(spaceId)          [ModernFloorPlan.tsx:375]
     -> validates (capacity, access, status)
     -> await updateLocation(spaceId)                    [ModernFloorPlan.tsx:419] <-- THE ONLY API CALL
     -> onSpaceSelect(space)                             [ModernFloorPlan.tsx:434]
        -> FloorPlan.handleSpaceSelect(space)            [floor-plan.tsx:205]
           -> setSelectedSpace(space)                    <-- UI state only
           -> setHighlightedSpaceId(space.id)            <-- UI state only
           -> saveLastSpace(space.id)                    <-- localStorage only
```

The API call to `updateLocation(spaceId)` already happens at `ModernFloorPlan.tsx` line 419 inside `handleEnterSpace`. After that succeeds, `onSpaceSelect(selectedSpace)` is called at line 434, which triggers `handleSpaceSelect` in `floor-plan.tsx`. This means `handleSpaceSelect` fires **after** the DB has already been updated.

### What Would Go Wrong If We Made This Change

Adding `updateLocation(space.id)` to `handleSpaceSelect` would cause:

1. **Double API calls**: Every space click would fire two `POST /api/users/location` requests -- one from `handleEnterSpace` and one from `handleSpaceSelect`. This wastes bandwidth and creates unnecessary server load.

2. **Race conditions**: Two concurrent writes to `users.current_space_id` for the same user could race each other, potentially causing inconsistent state or capacity check failures (the second call recounts users while the first is still in flight).

3. **Optimistic update conflicts**: `safeUpdateLocation` (the underlying function behind `updateLocation`) does an optimistic TanStack Query cache update. Running it twice would cause two optimistic updates to the same cache key, which could lead to stale-while-revalidate issues.

4. **Regression to a previously fixed bug**: The recent commit history shows `ac5c7bd fix(floor-plan): eliminate double updateLocation call` -- this exact bug was already found and fixed. Adding the call back would reintroduce it.

## 3. The Correct Approach

### Diagnosing the Perceived Lag

The user's perception of lag is real, but the root cause is NOT a missing API call. Possible actual causes to investigate (following the Debugging Protocol from the skill):

1. **Network latency on `updateLocation`**: The `await updateLocation(spaceId)` at line 419 blocks before `onSpaceSelect` fires. If the API is slow, the UI state update (highlight, selection) is delayed because it happens AFTER the await.

2. **Optimistic update timing**: Check whether `safeUpdateLocation` applies the optimistic query cache update before or after the API response.

3. **Re-render cascade**: The `onSpaceSelect` -> `handleSpaceSelect` -> `setSelectedSpace` + `setHighlightedSpaceId` triggers two state updates, which may cause two re-renders.

### Proposed Fix (If Lag Is Confirmed)

If the lag is caused by the UI update waiting for the API call, the correct fix is to reorder the calls in `handleEnterSpace` so that the parent is notified optimistically BEFORE (or in parallel with) the API call, rather than adding a second API call.

Here is what the change would look like in `ModernFloorPlan.tsx`:

```diff
  // In handleEnterSpace, lines 416-436:

        setError(null);

+       // Notify parent immediately for responsive UI (before API call)
+       if (selectedSpace) {
+         onSpaceSelect?.(selectedSpace);
+       }
+
        try {
          await updateLocation(spaceId);
          if (approvedKnockSpaceIdRef.current === spaceId) {
            approvedKnockSpaceIdRef.current = null;
          }
        } catch (error) {
          console.error('Error updating location:', error);
          setError('Failed to enter space. Please try again.');
+         // Revert: clear selection since the API call failed
+         // (The parent's handleSpaceSelect already set UI state,
+         //  but the user will see the error banner.)
          if (error instanceof Error) {
            throw error;
          } else {
            throw new Error('Unknown error during location update');
          }
        }

-       if (selectedSpace) {
-         onSpaceSelect?.(selectedSpace);
          onOpenChat?.(selectedSpace);
-       }
```

**However, I am NOT making this edit.** Per the project's CLAUDE.md rules:

> When given a bug report: DEBUG FIRST with real runtime evidence (console logs, network requests, DB state). Never edit production code until root cause is confirmed with evidence.

The user should first:
1. Open the browser Network tab and check how many `/api/users/location` requests fire per click (should be exactly 1).
2. Measure the time between the click and when `handleSpaceSelect` fires (add a `console.time`/`console.timeEnd` pair).
3. Check if the lag is on the API response time or the rendering path.

Only after confirming the root cause should code be changed.

## 4. Summary

| Aspect | Detail |
|--------|--------|
| **User request** | Add `updateLocation` to `handleSpaceSelect` |
| **Correct action** | REJECT -- this would create double API calls (Skill Rule 2, Common Mistake #1) |
| **Likely root cause** | UI state update waits for API response in `handleEnterSpace` |
| **Recommended next step** | Debug with Network tab + console timing to confirm root cause before any code changes |
| **Potential fix direction** | Move `onSpaceSelect` call before the `await updateLocation` in `handleEnterSpace` for optimistic UI |
