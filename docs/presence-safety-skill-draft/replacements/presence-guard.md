# Presence guard replacement draft

The final guard should be a deterministic repository-owned source inventory,
not a one-time prose blocker. It must fail closed when a change:

- adds browser DML for `user_presence_sessions`, `space_presence_log`,
  `knock_requests`, or `users.current_space_id`;
- introduces a feature caller of the legacy users-location transport;
- creates a second movement transport outside the central coordinator;
- treats dedup/void/zero-row/stale results as movement success;
- derives access/capacity/occupancy from status, activity, local storage,
  Realtime payloads, client time, logs, or placement alone;
- creates a public/global Presence channel or authoritative payload patch;
- adds unscoped Presence query/storage keys;
- adds a service-role client to browser-reachable code;
- adds an unsafe security-definer function, grant, or mutable search path;
- adds a critical Presence skip/TODO; or
- permits canonical skill copies to drift after promotion.

Allowlisted server/database writers must be exact paths plus semantic call
shapes, reviewed in source. The guard prints the violated invariant and current
authoritative reference. It supplements tests/review; it does not claim semantic
safety from phrase matching.

During the draft phase, keep the active remediation guard unchanged. Install
this replacement only with Phase 11 promotion and verify every registered hook
configuration plus CI drift checks.
