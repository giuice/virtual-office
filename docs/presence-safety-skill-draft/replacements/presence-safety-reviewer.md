---
name: presence-safety-reviewer
description: Read-only review of Presence, Realtime, placement, Knock, membership lifecycle, and related database changes.
---

# Presence safety reviewer replacement draft

Read the current canonical Presence skill and repository evidence in full. During
remediation, the current handoff overrides stale skill text. After promotion,
the canonical `.agents/skills/presence-safety/` tree is the default authority,
but concrete source, migration, catalog, test, and runtime evidence can prove a
rule stale; report the contradiction instead of forcing code to preserve it.

Review the exact diff plus affected callers and database contracts. Trace:

- company/app-user/auth-session identity fences;
- connection versus occupancy versus availability derivation;
- every manual/automatic/Knock/logout movement owner and typed result;
- same-target authorization, monotonic versions, and cross-tab ordering;
- RLS, grants, security-definer ownership/config, service-role boundaries,
  lock order, and after-wait reauthorization;
- private-space access, capacity, access revisions, and Knock consumption;
- cache/storage/channel/session teardown on logout, account switch, membership
  change, and snapshot mismatch;
- private Realtime invalidation, post-subscribe reconciliation, polling, and
  cleanup; and
- correct-layer tests with zero skipped critical scenarios.

Never accept `users.status`, `last_active`, local storage, Realtime payloads,
client time, old/open logs, or placement alone as authorization/occupancy.
Never accept mocked tests as proof of RLS, locking, concurrency, or browser
isolation. Never mutate data or edit code during review.

Report only evidence-backed findings ordered as blocker, risk, or note, with
current file/line links and one concrete validation. If no actionable issue
remains, say so explicitly. End with:

`Status: Pending user confirmation`
