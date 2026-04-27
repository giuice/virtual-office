---
status: diagnosed
trigger: "When a user reloads their browser window, they go offline and disappear from their space on the floor plan"
created: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:00:00Z
---

## Current Focus

hypothesis: Reload triggers beacon that marks user offline (spaceId=null, status=offline), then re-initialization fails to rejoin because safeUpdateLocation deduplication skips the rejoin call, and the presence channel leave event from OTHER clients further sets the user offline in the query cache.
test: Traced all code paths from beforeunload through rejoin logic
expecting: Confirmed - multiple compounding issues identified
next_action: Return diagnosis to caller

## Symptoms

expected: User reloads page and reappears in their space within the grace period
actual: User goes offline and disappears from space on floor plan; they appear as offline to all other users
errors: None (silent failure)
reproduction: Be in a space, reload the browser window
started: Likely always broken; grace-period rejoin logic has never fully worked

## Eliminated

- hypothesis: Supabase Realtime channel teardown alone causes the issue
  evidence: Channel teardown does cause a presence leave event, but the real problem is what happens AFTER reload during re-initialization
  timestamp: 2026-03-19

- hypothesis: The issue is only in the API route
  evidence: The API route correctly handles the beacon cleanup. The problem is primarily in the client-side re-initialization path
  timestamp: 2026-03-19

## Evidence

- timestamp: 2026-03-19
  checked: useUserPresence.ts lines 340-375 (beforeunload handler)
  found: On beforeunload, fires navigator.sendBeacon('/api/users/location', payload) with {userId, spaceId: null, offline: true}. This correctly records disconnect timestamp in localStorage as 'vo-disconnect-timestamp'.
  implication: The beacon is designed correctly. The server will set status=offline and currentSpaceId=null.

- timestamp: 2026-03-19
  checked: useLastSpace.ts lines 288-304 (beforeunload handler in useLastSpace)
  found: useLastSpace ALSO registers a beforeunload listener (via saveDisconnectTimestamp). This writes to 'vo-disconnect-timestamp' in localStorage. BOTH hooks register beforeunload handlers for the same key.
  implication: Double-write to vo-disconnect-timestamp is harmless but redundant.

- timestamp: 2026-03-19
  checked: route.ts lines 370-381 (offline=true branch in handleLocationUpdate)
  found: When offline=true, the route calls userRepository.update(id, {status:'offline', currentSpaceId:null}) AFTER the main updateLocation call that already set currentSpaceId=null. So the beacon correctly sets the user offline in the DB with currentSpaceId=null.
  implication: After reload fires, the DB correctly has status=offline, currentSpaceId=null.

- timestamp: 2026-03-19
  checked: useUserPresence.ts lines 413-443 (presence leave handler)
  found: When the current user's Supabase Realtime presence channel subscription is torn down on reload, all OTHER connected clients receive a 'leave' event for this user. Those clients then fire a fetch POST to /api/users/location with {userId, spaceId:null, offline:true}. This doubles the offline marking.
  implication: The offline marking happens from two sources on reload: the beacon from the reloading client AND the 'leave' handler on all other clients. This is redundant but consistent.

- timestamp: 2026-03-19
  checked: useLastSpace.ts lines 306-351 (placement effect)
  found: The placement effect calls getReconnectionContext() which checks localStorage for 'vo-disconnect-timestamp'. If within 5 minutes AND lastSpaceId exists, it returns type='grace-rejoin' with the last space. This looks correct. HOWEVER: at line 334, there is a guard: "if (currentUser.currentSpaceId && currentUser.currentSpaceId !== context.spaceId) return;" -- after reload and beacon, currentUser.currentSpaceId is null in the DB, so this guard does NOT block. The effect should proceed to call updateUserLocation.
  implication: The grace rejoin logic in useLastSpace appears structurally correct for the reload case.

- timestamp: 2026-03-19
  checked: useUserPresence.ts lines 235-288 (safeUpdateLocation)
  found: safeUpdateLocation has a deduplication guard at line 258: "if (currentUser && currentUser.currentSpaceId === spaceId && spaceId !== null) return". On reload, currentUser.currentSpaceId starts as null (beacon cleared it). So this guard does NOT block the rejoin attempt. However, there's ANOTHER guard: "if (lastUpdateRef.current === updateKey) return" at line 249. lastUpdateRef is reset to null on component mount (it's a useRef starting null). So this also does not block.
  implication: safeUpdateLocation deduplication does NOT block the rejoin call on fresh page load.

- timestamp: 2026-03-19
  checked: useLastSpace.ts lines 306-351 (placement effect dependencies)
  found: The placement effect depends on currentUser (from useLastSpace's props). In FloorPlan, useLastSpace receives currentUserProfile from useCompany(). The placement effect only fires when currentUser is non-null AND spaces.length > 0. After reload, there is a window where currentUserProfile from CompanyContext may not be loaded yet, causing the effect to not run. Once it does run, it correctly detects grace period.
  implication: There may be a TIMING issue - the rejoin fires, but it races with the beacon completing on the server. The rejoin PUT to /api/users/location goes through enforceSpaceAuthorization.

- timestamp: 2026-03-19
  checked: route.ts lines 183-268 (enforceSpaceAuthorization) + lines 229-249 (grace rejoin in route)
  found: THIS IS THE PRIMARY BUG. When the user tries to rejoin a restricted (private) space after reload, enforceSpaceAuthorization checks: (1) admin? (2) isAlreadyInSpace = authenticatedUser.currentSpaceId === spaceId. After beacon, currentSpaceId is null, so isAlreadyInSpace = false. Then it checks getMostRecentPriorOccupancy from space_presence_log. BUT: the beacon+offline flow in the POST handler calls updateLocation(id, null) first, which calls syncSpacePresenceLog ONLY IF spaceChanged. Then calls update(id, {status:'offline', currentSpaceId:null}). The syncSpacePresenceLog for leaving (exiting) writes exited_at. So when the rejoin PUT arrives, priorOccupancy.exited_at should be set. IF the beacon POST completes before the rejoin PUT, the grace rejoin in enforceSpaceAuthorization works. But if the rejoin PUT arrives BEFORE the beacon POST completes (race condition), exited_at is null and the route returns 403 SPACE_ACCESS_DENIED.
  implication: For RESTRICTED spaces, there is a race condition between the beacon POST and the rejoin PUT. The rejoin PUT can arrive before exited_at is written, blocking re-entry with 403.

- timestamp: 2026-03-19
  checked: useLastSpace.ts updateUserLocation vs enforceSpaceAuthorization public space path
  found: For PUBLIC spaces (isPublic !== false), enforceSpaceAuthorization returns {authorizedByUserId: null, consumedKnockRequestId: null} immediately at line 232 - no grace check needed. So public spaces are NOT affected by the race condition bug. The rejoin always succeeds for public spaces.
  implication: The race condition bug only affects RESTRICTED/private spaces on reload.

- timestamp: 2026-03-19
  checked: useUserPresence.ts lines 100-110 (filter in queryFn)
  found: The queryFn filters out users where status=offline AND no recent activity AND no currentSpaceId. After beacon, the reloading user has status=offline and currentSpaceId=null. The filter at line 102 says "if currentUserId && u.id === currentUserId return true" -- so the current user is ALWAYS kept in the list. But OTHER clients fetching the /api/users/list will NOT have this override for the reloading user. So other clients will filter out the reloading user (status=offline, not in space, not recently active after 2 min window).
  implication: The reloading user disappears from other clients' presence view within 2 minutes if the rejoin fails or is slow.

- timestamp: 2026-03-19
  checked: FloorPlan.tsx lines 263-279 (placement useEffect)
  found: FloorPlan has its OWN placement useEffect that calls getReconnectionContext AND handleEnterSpace. handleEnterSpace (lines 191-214) calls saveLastSpace but does NOT call updateLocation (presence API). The comment at line 213 says "We've removed the automatic user assignment to spaces". So FloorPlan's placement effect only updates LOCAL UI state (selectedSpace, highlightedSpaceId) but does NOT update the user's presence in the database.
  implication: The FloorPlan placement effect does UI-only work. Actual presence DB update must come from useLastSpace's placement effect. This creates a split: UI shows the user "in" a space (selectedSpace state) but the DB may not reflect it if useLastSpace's rejoin fails or hasn't run yet.

- timestamp: 2026-03-19
  checked: useLastSpace.ts lines 161-165 (saveDisconnectTimestamp condition)
  found: saveDisconnectTimestamp only writes the timestamp if currentUser?.currentSpaceId OR lastSpaceId is truthy. On the FIRST beforeunload event during reload, currentUser.currentSpaceId should be set (user is in a space). So the timestamp is written correctly.
  implication: The disconnect timestamp is correctly written to localStorage on reload.

- timestamp: 2026-03-19
  checked: useLastSpace.ts lines 142-143 (lastSpaceId persistence)
  found: lastSpaceId is stored via useLocalStorage under key 'lastSpaceId'. FloorPlan calls saveLastSpace(space.id) in handleEnterSpace when the user clicks a space. This is the ONLY write to lastSpaceId in FloorPlan. It is not called on the automatic placement effect. So if a user has never manually clicked a space (just landed in it via the placement effect on first load), lastSpaceId may be null or stale.
  implication: If lastSpaceId is null or stale, getReconnectionContext's withinGrace branch is skipped (line 117: "if (withinGrace && lastSpaceId)"), and the user falls through to standard placement (home-space or default-space), NOT their last occupied space.

## Resolution

root_cause: |
  A page reload triggers a compounding sequence of four independent bugs:

  BUG 1 — Beacon correctly marks user offline (this is intentional), but the race window
  between the beacon POST completing and the client re-initializing is not managed. For
  restricted (private) spaces, if the rejoin PUT arrives before the beacon POST has written
  exited_at to space_presence_log, enforceSpaceAuthorization returns 403 SPACE_ACCESS_DENIED
  because hasGraceRejoin = false (exited_at not yet written). The user cannot rejoin.

  BUG 2 — lastSpaceId (useLocalStorage 'lastSpaceId') is only written when the user
  explicitly clicks a space via handleEnterSpace -> saveLastSpace in FloorPlan. The automatic
  placement useEffect in FloorPlan does NOT call saveLastSpace. So if the user was placed into
  a space programmatically (on first load or reconnect), lastSpaceId remains null or stale.
  When getReconnectionContext runs after reload, withinGrace is true but lastSpaceId is null,
  so the grace-rejoin branch is skipped entirely. The user is placed in their home/default space
  instead, losing their last position.

  BUG 3 — FloorPlan's own placement useEffect (lines 263-279) calls getReconnectionContext
  and then handleEnterSpace, but handleEnterSpace does NOT call updateLocation (the presence
  API). It only sets local UI state. This means the floor plan UI can display the user as
  "in" a space while the database still has currentSpaceId=null and status=offline. The two
  sources of truth diverge after reload.

  BUG 4 — Other clients' presence leave handlers (useUserPresence.ts lines 434-443) fire a
  POST to /api/users/location with offline:true when they detect the reloading user leaving
  the Realtime channel. This is redundant with the beacon, but also races with the rejoin PUT.
  If a peer's cleanup POST arrives after the rejoin PUT has already set currentSpaceId back,
  the peer's cleanup will set currentSpaceId=null and status=offline again, overwriting the
  successful rejoin.

fix: Not applied (research-only mode)
verification: Not verified
files_changed: []
