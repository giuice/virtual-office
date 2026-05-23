---
status: resolved
trigger: "On admin space there are 1 logged out admin. this user(me) itś not online. Other user knocks on the space, since the user is logged out it cannot permit user to knock the door, ( no user will response the knock!) maybe there are other bugs in the system we have to inspect. use presence-safety skill ."
created: 2026-05-21
updated: 2026-05-21
---

# Debug Session: logged-out-admin-knock-blocked

## Symptoms

- Expected behavior: A locked/admin space should not allow a knock request to depend on a logged-out/offline admin who cannot respond. Offline admins should not appear as available responders/occupants for knock permissions.
- Actual behavior: Admin space shows one logged-out admin. Another user knocks on the space, but the logged-out admin cannot respond, leaving the knock unhandled/blocked.
- Error messages: None reported yet.
- Timeline: Unknown from initial report.
- Reproduction: Have an admin user logged out/offline but still represented in an admin space, then have another user knock on that space.
- Safety context: presence-safety skill consulted. DB current_space_id is authoritative for position, Realtime presence is authoritative for online/offline, offline users must be filtered from usersInSpaces except current user, and knock/responder logic must not rely on offline users.

## Current Focus

- hypothesis: Confirmed and fixed. Knock permission/responder logic counted users by current_space_id without filtering offline/presence availability, so logged-out admins remained eligible recipients even though they could not respond.
- test: Inspect knock/space access code, presence derivation, and capacity/occupancy queries for offline filtering and responder selection; then add route coverage for offline-recipient exclusion.
- expecting: Knock recipient counting should align with existing offline-exclusion rules used by occupancy/capacity paths.
- next_action: complete
- reasoning_checkpoint: root cause proven before production edit; minimal fix applied
- tdd_checkpoint: not_used

## Evidence

- timestamp: 2026-05-21T00:00:01Z
  source: /home/giuice/desenv/virtual-office/src/app/api/spaces/knock/request/route.ts:66-76
  finding: The knock request API determines recipients with `users.current_space_id = spaceId` and `id != requester.id` only. It does not exclude `status = 'offline'`, so logged-out users still count as recipients/responders.

- timestamp: 2026-05-21T00:00:02Z
  source: /home/giuice/desenv/virtual-office/src/app/api/users/location/route.ts:200-223
  finding: The location authorization path already applies the presence-safety rule for capacity by counting only `current_space_id = spaceId` users where `status != 'offline'`. This shows the system intentionally preserves `current_space_id` for reload recovery but expects offline users to be excluded from active occupancy decisions.

- timestamp: 2026-05-21T00:00:03Z
  source: /home/giuice/desenv/virtual-office/src/hooks/useUserPresence.ts:279-291
  finding: Client presence derivation filters offline users out of `usersInSpaces` for everyone except the current user. That means the floor-plan occupancy view is designed to treat Realtime presence as authority; the stale knock behavior comes from server-side knock logic not following the same rule.

- timestamp: 2026-05-21T00:00:04Z
  source: /home/giuice/desenv/virtual-office/src/components/floor-plan/modern/ModernFloorPlan.tsx:507-540; /home/giuice/desenv/virtual-office/src/components/floor-plan/modern/SpaceActionButtons.tsx:105-159; /home/giuice/desenv/virtual-office/__tests__/knock-banner.test.tsx:182-187; /home/giuice/desenv/virtual-office/__tests__/space-detail-hover-panel.test.tsx:511-527
  finding: The UI offers Knock for restricted spaces regardless of whether any online occupant exists, and tests codify that behavior. Combined with the server counting offline `current_space_id` rows, users can start a dead-end knock flow against spaces that have no reachable responder.

- timestamp: 2026-05-21T00:10:00Z
  source: /home/giuice/desenv/virtual-office/src/app/api/spaces/knock/request/route.ts
  finding: Updated knock recipient counting to exclude `users.status = 'offline'` while preserving `current_space_id` for reload recovery, aligning this route with existing presence-safety occupancy rules.

- timestamp: 2026-05-21T00:11:00Z
  source: /home/giuice/desenv/virtual-office/__tests__/api/spaces-knock-request-route.test.ts
  finding: Added focused API coverage proving knock requests still insert successfully while `recipientCount` drops to `0` when only offline occupants remain in the target space.

- timestamp: 2026-05-21T00:12:00Z
  source: `cd /home/giuice/desenv/virtual-office && rtk vitest run __tests__/api/spaces-knock-request-route.test.ts`; `cd /home/giuice/desenv/virtual-office && rtk vitest run __tests__/knock-auto-join.test.tsx`
  finding: Targeted verification passed: new route tests passed (2), existing knock UI flow tests passed (8).

## Eliminated

- Client-side `usersInSpaces` filtering is not the primary fault; it already hides offline users from space occupancy views except for the current user (/home/giuice/desenv/virtual-office/src/hooks/useUserPresence.ts:279-291).
- Server-side capacity enforcement is not the fault here; it already excludes offline users as required (/home/giuice/desenv/virtual-office/src/app/api/users/location/route.ts:200-223).
- Clearing `current_space_id` on offline/disconnect is not acceptable; presence-safety constraints require preserving it for reload recovery.
- Adding duplicate `/api/users/location` calls is not required; the bug is resolved by aligning knock recipient eligibility with existing status filtering.

## Resolution

- root_cause: `/api/spaces/knock/request` treated `users.current_space_id` as sufficient proof of an available responder and never filtered out offline users, even though offline users intentionally retain `current_space_id` for reload recovery; this let logged-out admins be counted as knock recipients when nobody could actually respond.
- fix: Updated `/api/spaces/knock/request` to exclude `status = 'offline'` from recipient counting and added focused API coverage for the offline-recipient case.
- verification: `cd /home/giuice/desenv/virtual-office && rtk vitest run __tests__/api/spaces-knock-request-route.test.ts` passed (2 tests); `cd /home/giuice/desenv/virtual-office && rtk vitest run __tests__/knock-auto-join.test.tsx` passed (8 tests).
- files_changed: /home/giuice/desenv/virtual-office/src/app/api/spaces/knock/request/route.ts; /home/giuice/desenv/virtual-office/__tests__/api/spaces-knock-request-route.test.ts; /home/giuice/desenv/virtual-office/.planning/debug/logged-out-admin-knock-blocked.md
