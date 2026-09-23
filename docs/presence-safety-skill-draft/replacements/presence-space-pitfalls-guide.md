# Presence and space pitfalls

This replacement is a short routing guide, not a competing source of truth.
The canonical Presence skill and its references own all rules.

Common unsafe shortcuts:

- equating persisted placement or availability with live occupancy;
- preserving `away`/`busy` display after the lease disconnects;
- authorizing private access from activity, old logs, cache, or client time;
- adding movement to a selection callback that runs after movement already
  committed;
- relying on a tab-local generation to order work across tabs;
- accepting same-target placement without current authorization;
- trusting SUBSCRIBED without immediate and delayed reconciliation;
- patching authoritative cache rows from Realtime payloads;
- reusing global cache/storage after account switch;
- letting one tab's close disconnect the other tab;
- treating zero-row Knock response or skipped movement as success;
- using mocked tests as database concurrency proof; or
- probing production with service-role mutation.

Start with [the presence-safety skill](../../../.agents/skills/presence-safety/SKILL.md), then read the matching state, transition,
access/capacity, Realtime/debugging, and testing reference. If this guide ever
conflicts with those references or current verified implementation evidence,
the guide is stale and must be corrected.
