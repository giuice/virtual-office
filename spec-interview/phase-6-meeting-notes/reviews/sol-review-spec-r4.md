**Verdict: REVISION REQUIRED.**

**Section A: Prior-finding status**

| Finding | Status | Reason against SPEC v4 |
|---|---|---|
| R3-1 | Resolved | FR-021 explicitly discards cancelled payloads and returns terminal “discarded” on replay; FR-031 preserves accounting across deletion. AC-034 covers cancellation/completion. |
| R3-2 | Partially | The 24-hour replay window and 10-minute crash outcome are defined. Expired-key recognition after 30-day record cleanup remains incomplete: R4-1. |
| R3-3 | Resolved | FR-021 requires user/company scoping, cancellation, cache clearing, and rejection of late responses; AC-033 exercises delayed delivery. |
| R3-4 | Partially | FR-011 requires atomic capacity across insertion paths. AC-032’s mixed-path fixture cannot demonstrate that requirement: R4-2. |
| R3-5 | Resolved | FR-029 and §9 separate immutable historical UUID/name snapshots from nullable live references; AC-031 checks UUID preservation. |
| R3-6 | Resolved | FR-022 and AC-029 distinguish listed initial non-2xx rejections, including error bodies, from accepted-stream errors and unknown responses. |
| N3 | Partially | Scope, binding, midnight replay, explicit retry, and crash recovery are specified; post-retention replay remains incomplete. |
| N4 | Resolved | Return-time membership checks, transactional Apply authorization, and browser delivery fencing are explicit. |
| N7 | Resolved | Author/editor deletion preserves historical IDs, names, notes, and versions without blocking deletion. |
| H2 | Partially | Atomic reservations, single dispatch, server-only settlement, and crash charging are defined; the remaining idempotency lifetime gap is R4-1. |
| M4 | Resolved | Current membership, retained former members, rejoin rights, and browser revocation handling are defined. |

**Section B: New findings**

1. **R4-1 — Medium — FR-031, §9, AC-034: expired-key rejection outlives the evidence identifying expired keys.**

   **Problem/scenario:** A suspended browser replays its unchanged request after 31 days. Operation records have been purged. Without a first-use freshness rule or retained tombstone, the old key is indistinguishable from a never-used key and can trigger another billed dispatch. The 24-hour rejection rule does not explain admission after cleanup.

   **Evidence:** [SPEC.md:132](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:132), [SPEC.md:173](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:173), [AC-034:288](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:288).

   **SPEC fix:** Define first-use admission so expired keys remain rejectable after record cleanup—for example, server-verifiable key freshness or durable content-free tombstones. Extend AC-034 to replay an expired key **after actual retention cleanup**, asserting no provider dispatch through real routes and Supabase.

2. **R4-2 — Low — AC-032: the mixed insertion fixture masks the concurrency defect.**

   **Problem/scenario:** At 99 items, Apply of two items already exceeds capacity independently of the competing manual addition. That test can pass even if Apply does not share atomic capacity enforcement with manual insertion. The reachable defect is at 98 items, where a manual addition and a two-item Apply each fit independently but together produce 101.

   **Evidence:** [FR-011:112](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:112), [AC-032:286](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:286).

   **SPEC fix:** Race manual addition against a **one-item Apply at 99 items**, or a **two-item Apply at 98**. Establish that both operations succeed individually, then assert the concurrent total stays ≤100 and refused Apply changes nothing.

Read-only; no files changed. Online schema and runtime were not inspected.