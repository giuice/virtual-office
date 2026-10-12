**Verdict: revision required**

13 findings are resolved; 3 remain partial. The declared dependency graph is acyclic in file order, but the revised standing rules introduce an earlier, undeclared runner prerequisite.

References below are to [PLAN v2](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md), assessed against the approved [SPEC v4](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/SPEC.md).

| R1 finding | Disposition | Evidence from PLAN v2 |
|---|---|---|
| R1 — Phase 4 keyed compatibility | **Partial** | Standing rule L12, T2 L47–49, and T21 explicitly cover keyed text/attachment/voice creates, replays, and conflicts. The generation-less exception still lacks an explicit commit-time fencing guarantee; see N2. |
| R2 — Fail-open budgets | **Resolved** | T3 requires fail-closed handling, transactional winning-insert charging, request charges surviving rollback, and malformed/early-validation/failure tests. T6 also tests limiter failure. |
| R3 — T8 requires later recovery | **Resolved** | AC-040 leaves T8 and belongs to T27, which follows T8. |
| R4 — Ten-message deadline | **Resolved** | T8’s `Done when` requires ten messages within ten seconds. T10 expressly covers attempts started before **or during** the outage. |
| R5 — Attachment mentions | **Resolved** | T4 covers atomic mentions on both create paths, including attachment-link rollback. T17 covers attachment/voice mention submission and attachment retry evidence. |
| R6 — Typing recovery/backoff | **Resolved** | T15 explicitly owns error, timeout, terminal closure, application recovery, and increasing capped delays. Its harness prerequisite still has the R12 limitation. |
| R7 — Current-member roster producer | **Resolved** | T4 supplies an authorized roster from `conversation_members`; T17 tests exclusion of removed members. |
| R8 — Split completion clauses | **Partial** | T18 owns replay-after-removal notification suppression; T23 specifies application-first rollback. T9 preserves and inspects the original send time. T19 describes using it, but its `Done when`/`Verify by` never requires an expired-retry latency assertion. |
| R9 — Missing dependencies | **Resolved** | T9 now owns only AC-046’s definitive classes, so its former mention dependency disappears. T14 excludes the mention clause; T17 owns it after T14 and T4. T19 depends on T15. |
| R10 — Browser runner | **Resolved** | T24 provides registered Phase 5 specs, real Chrome/Edge projects, and removal of channel overrides before T7. The new standing-rule ordering problem is N1. |
| R11 — Insufficient fixtures | **Resolved** | T24 names A–E, actual membership removal/re-add, quota controls, second-device contexts, and interrupted-run cleanup. |
| R12 — Independent stream faults | **Partial** | T25 introduces a checkable isolation probe before consumers. Its completion condition does not require every failure class, and the admissible error/closure mechanism remains unspecified; see N3. |
| R13 — Raw log capture | **Resolved** | T6 captures raw route output; T24 supplies unsanitized server lines; T19 scans those lines. |
| R14 — Broad client protocol tasks | **Resolved** | Durable enqueue, unknown recovery, cross-tab leases, and definitive/expiry handling are separated into T8 → T27 → T10 → T9. |
| R15 — Final adversarial review | **Resolved** | Standing rule L15 and T22 explicitly require an accepted whole-work-item review with finding dispositions before T23. |
| R16 — Incorrect grounding | **Resolved** | Observations correctly describe existing list health/catch-up and the reachable logout control. T12 enumerates reachable controls during execution. |

**New findings**

1. **N1 — High — The standing E2E rule blocks T1 before the runner exists.**  
   **Location:** [Standing rules](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:16), [T24](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:90).

   Every E2E check must run “through the T24 runner.” T1 already requires regression E2E to pass before completion, as do subsequent server slices. Execution cannot reach T24 until T1–T6 finish. The mechanical dependency check misses this prose prerequisite.

   **Smallest fix:** explicitly allow T1–T6’s existing regression checks through the current local runner, then require T24 for subsequent E2E gates and the final Chrome/Edge runs. Alternatively, move the base runner prerequisite ahead of T1 and defer fixtures that require new database objects.

2. **N2 — High — Generation-less compatibility requests need the same atomic fence exclusion.**  
   **Location:** [D4 planning decisions](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:19), [T2](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:47).

   T2 expressly requires the commit-time generation check **“with”** the new fields. Its compatibility branch only says generation-less requests are rejected when the key “already has fence state.”

   A route-level interpretation permits this race: a generation-less create passes its absence check; its insert is delayed; a fence reports not stored; the outbox item is cancelled or expires; the delayed legacy path inserts afterward. Composite uniqueness prevents two rows under that key, but cannot prevent this late delivery—or duplicate content after cancellation and rewriting under a fresh key. The listed AC-045 tests exercise generated attempts, without expressly testing this branch.

   **Smallest fix:** require generation-less insertion admission to participate in the same atomic, commit-time exclusion as fencing. Add held-request and blocked-insert tests where the generation-less request loses to a fence. Define whether ordinary key registration counts as “fence state,” and test stored-message legacy replays so registration does not accidentally break Phase 4 retry.

   Safe legacy compatibility implements §10. Allowing a fenced insert to commit, or weakening legitimate Phase 4 replay compatibility, changes the approved contract; D4’s delegation of small choices does not authorize that.

3. **N3 — Medium — T25’s probe can pass without establishing the fault capabilities its consumers require.**  
   **Location:** [T25 Task/Done when](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:101).

   The probe requires an unhealthy/closed target for each stream, without requiring **error, timeout, and terminal closure for each stream**. It could pass using only join timeouts, leaving T13/T15 unable to run their other mandatory scenarios.

   Playwright can connect to the real server and selectively intercept messages, so multiplexing itself is manageable. Closing `WebSocketRoute` closes a socket side, affecting all its channels. Dropping ordinary topic events does not itself produce an unhealthy subscription status. [Playwright WebSocketRoute documentation](https://playwright.dev/docs/api/class-websocketroute).

   Topic-specific error/closure needs a Phoenix protocol fault mechanism or actual server channel termination; `phx_error` and `phx_close` are channel messages. [Supabase protocol documentation](https://supabase.com/docs/guides/realtime/protocol).

   **Smallest fix:** make the probe a three-stream × three-failure-class matrix, recording actual subscription status and continued delivery on unaffected streams. Identify the protocol/server mechanism allowed under §15; preserve real joins, application callbacks, and transport rather than setting application health directly. If synthetic protocol failure frames exceed the accepted network-shaping policy, resolve that boundary explicitly.

4. **N4 — Medium — T27 authorizes redispatch after every not-stored fence result.**  
   **Location:** [T27](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:128), [T9](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:146).

   T27 applies fencing before cancellation, expiry, or redispatch, then unconditionally states that “a not-stored result is redispatched once.” For an unknown item past its delivery window, that instruction sends the item that T9/FR-009 must expire. It also conflicts with fencing performed to enable cancellation.

   **Smallest fix:** state that a not-stored result permits the requested transition. Redispatch occurs only while the item remains eligible, current, and within its delivery window; cancellation and expiry complete without a create. Add an unknown-but-not-stored expiry case alongside the existing stored-but-unknown case.

The fail-closed **429** choice itself does not contradict FR-008 or BR-005, provided refusal occurs before storing or fencing. Metrics-budget refusal is also compatible with FR-028 when messaging remains unaffected. Those choices do not inherently require a new owner decision.

T9 after T10 is appropriate. T17 needs T14 for its stale-poll mention check. T19 now names FR-009, but the remaining R8 fix is to add an expired manual retry whose emitted latency demonstrably uses the original send time to T19’s completion evidence.

T24 is checkable through its probe. T25 is checkable in principle once N3 is tightened; its AC-015 `Covers` entry supports the harness prerequisite, while T13/T15 own actual recovery acceptance. No additional unowned AC clause was found after accounting for standing rules and T22’s composite checks.

Read-only review completed; no files modified.