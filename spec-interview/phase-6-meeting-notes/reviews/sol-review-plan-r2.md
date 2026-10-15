**Verdict: REVISION REQUIRED.**

| Finding | Status | PLAN v2 assessment |
|---|---|---|
| P1 | Resolved | Owner, search path, client revokes, server-only grants, and direct-RPC denial tests specified. Excess `service_role` grants remain a follow-up below. |
| P2 | Resolved | T9 authorizes current membership/editor rights **before** existing-operation lookup, including replay. |
| P3 | Resolved | T8 saves settings/key atomically; T9 locks settings through validation, reservation, and snapshotting. |
| P4 | Resolved | Existing operations precede current-settings validation; replay after settings changes is tested. |
| P5 | Partially | Dispatch-dependent evidence moved to T12 and a killable subprocess is specified. Crash-test timing remains unspecified: the referenced runner has a [30-second timeout](E:/projects/virtual-office/vitest.messaging-db.config.mts:15), while recovery requires ten minutes. Specify real timestamp fixtures plus maintenance execution, or a sufficient timeout. |
| P6 | Resolved | Realtime canary, bundle/log scans, and the cross-company API/database matrix are assigned. |
| P7 | Resolved | T7 specifies contrasting timezone display/export checks. |
| P8 | Resolved | Persistent private environment variables, rotation verification, provisioning, and restart checks specified. |
| P9 | Resolved | Early row inspection and late divergence → stop/replan/local testing/review precede authorization. |
| P10 | Resolved | T15 completion requires deployment, deployed smoke, and successful hosted cron execution. |
| P11 | Resolved | T17 separates mutations from schema; T16 separates the harness from adapters. |

1. **R2-1 — Medium — T9/T11/T12: Reservations lack a no-dispatch release path.**  
   T12 admits and reserves usage before T11’s size preflight, while T9 permits refunds only for provider rejections. A valid upload exceeding the selected model’s budget can therefore consume quota without an outbound request. The promised unchanged-usage assertion contradicts this sequence. Evidence: [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122), [PLAN:149](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:149), [PLAN:160](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:160).  
   **Fix:** Specify idempotent settlement that releases a reservation when dispatch demonstrably never began. Test oversize refusal and pre-send cancellation through the real route, with zero requests and unchanged usage.

2. **R2-2 — Medium — T8: Settings authorization can become stale before mutation.**  
   Admin authorization occurs in the route; the service-only save RPC has no specified actor or transactional authorization check. Another admin can remove/demote the caller while their save waits, after which the privileged RPC still changes settings/key. Neither service-role access nor `SECURITY DEFINER` supplies application authorization. Evidence: [PLAN:111](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:111), [server-client:21](E:/projects/virtual-office/src/lib/supabase/server-client.ts:21), [Supabase service-role behavior](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).  
   **Fix:** Pass the server-derived application actor ID and reauthorize current same-company admin rights inside the save transaction, using compatible membership locks. Add a real removal/demotion-versus-save race proving settings and key remain unchanged when removal wins.

3. **R2-3 — Medium — T9/T12: New admission does not validate the current transcript/source binding.**  
   Bindings are compared with existing operations, but a new admission checks only rights and settings revision. If another editor replaces the transcript after ticket issuance but before start, processing can use replacement text while recording the old transcript identity/source revision, producing a charged draft that cannot be applied. Evidence: [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122), [PLAN:160](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:160), [SPEC:119](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:119).  
   **Fix:** For new admissions, validate the signed source revision and transcript identity against the locked note and capture that transcript consistently; stale source → conflict without reservation/dispatch. Keep existing-operation replay independent of later source changes. Test replacement before admission.

4. **R2-4 — Medium — T9/T12: A fresh ticket can revive an expired idempotency key.**  
   Only ticket age is checked. After 24 hours, a caller can obtain a fresh ticket for unchanged bindings and reuse the old key: T9 returns its operation; after record cleanup, it admits another dispatch. FR-031 independently requires expired **keys** to be rejected. Evidence: [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122), [PLAN:160](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:160), [SPEC:132](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:132).  
   **Fix:** Bind the operation key and immutable issuance epoch into the signed ticket, and enforce expiration before lookup/admission. Add fresh-ticket/old-key tests both with and without retained operation records.

5. **R2-5 — Medium — T1/T17/T2: AC-021 lost observable mutation evidence during the split.**  
   T1 now verifies restored **read** access; T6 verifies display. Neither proves that a retained former participant can remain on a successful save or that rejoining restores editing rights. T1 runs before mutation RPCs exist. A membership validator can reject those legitimate workflows while the assigned checks pass. Evidence: [PLAN:39](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:39), [PLAN:48](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:48), [PLAN:95](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:95), [SPEC:275](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:275).  
   **Fix:** Assign retained-participant saves and rejoin editing checks to T17; assign assignee completion-right restoration to T2. Use real RPC/API integration tests and update `Covers` and the coverage table.

6. **R2-6 — Low — Standing privilege rule: “authenticated only” does not match resulting ACLs. Follow-up only.**  
   The baseline also grants new functions to `service_role`; the prescribed revokes leave that direct grant intact. Thus user-facing RPCs retain more execution grants than claimed. Evidence: [PLAN:12](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:12), [baseline:2137](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:2137), [Supabase function privileges](https://supabase.com/docs/guides/database/functions#function-privileges). No ordinary-client exploit is established; abuse of the excess server privilege requires server misuse/tampering.  
   **Fix:** Revoke `service_role` alongside other default grantees before deliberate regrants, and verify the effective role matrix.

The graph is acyclic and all FR/AC IDs remain mapped. T16’s HTTP harness does not require application/Supabase mocks; block grouping introduces no separate blocker. The Medium findings warrant another round; R2-6 does not.

No files changed. Local and online catalog state were not independently verified.