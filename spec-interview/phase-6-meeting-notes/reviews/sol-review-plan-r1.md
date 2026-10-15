**Verdict: REVISION REQUIRED.**

1. **P1 — High — T8/T9: “Server-only RPC” lacks an explicit execution boundary.**  
   The baseline grants new public functions to `anon` and `authenticated`. Revoking access to Vault tables does not prevent a client calling a privileged key-reader or settlement RPC. **Scenario:** an ordinary client invokes the RPC directly to obtain a key or alter usage.  
   **Evidence:** [PLAN:99](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:99), [PLAN:110](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:110), [baseline:2135](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:2135), [Supabase function privileges](https://supabase.com/docs/guides/database/functions#function-privileges).  
   **Fix:** specify each RPC’s owner, fixed search path, explicit revokes from `PUBLIC`, `anon`, and `authenticated`, and necessary grants. Add direct RPC attacks to the key and usage tests.

2. **P2 — High — T9/T12: Authorization before dispatch is not specified.**  
   T12 explicitly rechecks membership before returning, but its admission sequence checks only the ticket/settings revision before reservation and dispatch. **Scenario:** a removed member retains a valid ticket and JWT, starts processing, and consumes the former company’s quota; discarding the response happens too late. An editor whose participant rights were revoked has the same problem.  
   **Evidence:** [PLAN:110](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:110), [PLAN:137](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:137).  
   **Fix:** require current membership and editor authorization at ticket issuance, admission, and replay. Compare signed user/company/note bindings with authenticated database state before reading keys or reserving usage. Test revocation before start with zero dispatches and unchanged usage.

3. **P3 — High — T8/T9/T12: Settings validation and snapshotting can race.**  
   The PLAN separates checking the settings revision, reserving usage, and snapshotting provider/key/model/effort; only the quota reservation is explicitly atomic. **Scenario:** an admin switches from P to Q between those steps, sending a transcript to Q after the user saw P’s notice. Updating a mutable Vault secret can also produce a mixed snapshot.  
   **Evidence:** [PLAN:99](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:99), [PLAN:110](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:110), [PLAN:137](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:137).  
   **Fix:** require atomic settings/key saves and one locked admission transaction that validates the revision, reserves quota, and captures the matching configuration and key value. Test a settings change racing with admission, rather than only pausing an already-dispatched provider.

4. **P4 — Medium — T9/T12: The current-settings guard conflicts with replay semantics.**  
   T12 requires the ticket to match current settings before processing the start request. **Scenario:** a start succeeds but its response is lost; an admin changes settings; replaying the original key now gets a stale-settings refusal instead of the operation’s pending/final result.  
   **Evidence:** [PLAN:137](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:137), [SPEC:132](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:132).  
   **Fix:** after expiry, binding, and authorization checks, resolve an existing operation first. Apply current-settings validation only to a new admission. Add replay-after-settings-change coverage.

5. **P5 — Medium — T9/T10/T11/T12: Several promised checks cannot run at their assigned task.**  
   T9 claims provider dispatch/replay/cancellation/crash evidence before T11’s fake server and T12’s processing route exist. T10 substitutes normalizer output for AC-012’s provider-received text. T11 claims usage classification before the route joining adapters and accounting exists. **Scenario:** connection loss or a server crash exposes a wiring failure that isolated checks missed.  
   **Evidence:** [PLAN:112](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:112), [PLAN:121](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:121), [PLAN:130](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:130), [Vitest config:24](E:/projects/virtual-office/vitest.messaging-db.config.mts:24).  
   **Fix:** separate the fake-server/harness outcome from adapters; keep independently observable DB checks in T9 and move dispatch-dependent checks to T12. Verify normalization through actual processing requests. Give AC-034 a killable application subprocess and suitable timeout; a pure normalizer test would violate the unit-test ban.

6. **P6 — Medium — T1/T8/T9/T14: AC-017 and AC-023 have incomplete evidence assignments.**  
   T8’s canary checks omit Realtime payloads and client bundles. The AC-023 assignments cover selected DB structures/settings, without explicitly covering both member/admin attacks through every required API and database surface, including items and usage reads. **Scenario:** a client reaches an untested endpoint or receives a key through publication despite passing select tests.  
   **Evidence:** [PLAN:36](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:36), [PLAN:101](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:101), [PLAN:176](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:176), [SPEC:277](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:277).  
   **Fix:** assign Realtime canary checks to T8, bundle inspection to T14, and a complete cross-company route/direct-client matrix to T12. Update the quality-gate mapping accordingly.

7. **P7 — Medium — T2/T7/T14: A DB date check cannot prove AC-009’s timezone display.**  
   AC-009 is assigned only to T2; T7’s E2E list omits it. **Scenario:** SQL correctly stores `2026-11-05`, while browser conversion through `Date` displays November 4 in a western timezone.  
   **Evidence:** [PLAN:45](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:45), [PLAN:92](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:92), [SPEC:263](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:263).  
   **Fix:** add AC-009 display/export checks to T7’s deferred E2E specs, using contrasting timezone contexts in the single final Chrome run.

8. **P8 — Medium — T9/T15: Ticket-secret provisioning and lifetime are unowned.**  
   “Server-only secret” specifies neither its source nor persistence across instances/deployments. **Scenario:** a process-local generated key invalidates otherwise valid 24-hour tickets after restart or when another instance handles the request.  
   **Evidence:** [PLAN:110](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:110), [PLAN:166](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:166).  
   **Fix:** name a required private environment variable, require a stable target-specific secret with no fallback, define rotation compatibility for outstanding tickets, and assign local/online provisioning plus restart verification.

9. **P9 — Medium — T15: Legacy backfill can introduce changes after final review.**  
   Existing rows are discovered only after T14, followed by “owner decides backfill before continuing,” without a return to execution/review. **Scenario:** production contains legacy notes requiring new mapping or conversion SQL; that SQL is applied without the final tree’s migration tests and review.  
   **Evidence:** [PLAN:157](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:157), [PLAN:166](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:166).  
   **Fix:** make non-empty rows or incompatible catalog state an explicit rollout stop/replan branch. Implement and test the approved backfill locally, repeat affected gates, then authorize the concrete revised online SQL.

10. **P10 — Medium — T15: Deployment is described but is not a completion condition.**  
    T15 can finish with migrations and owner acceptance on a locally running new app against the online DB. It never requires observing the deployed application or successful hosted maintenance jobs. **Scenario:** the owner’s local demo passes while the published app remains old, or hosted cron cannot execute the crash-recovery function.  
    **Evidence:** [PLAN:166](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:166), [PLAN:167](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:167), [SPEC:305](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:305).  
    **Fix:** require recorded deployment after DB readback, then smoke-test the deployed build against the named target. Explicitly read back Vault/RPC privileges and cron ownership, execution grants, and successful job execution.

11. **P11 — Low — T1/T11: Worker outcomes are too broad.**  
    T1 combines schema, identity, authorization, four mutation workflows, history, deletion, and extensive concurrency coverage. T11 combines four adapters with a multi-protocol fake server and runner lifecycle. **Scenario:** a connection-failure fix leaves another adapter or harness shutdown incomplete without a useful task checkpoint.  
    **Evidence:** [PLAN:34](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:34), [PLAN:128](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:128).  
    **Fix:** split schema/read contracts from mutation/history outcomes, and split the fake-server harness from adapters. Regroup blocks around 4–5 tasks and preserve the final-only E2E cadence.

No files or databases changed. Live catalog observations were not independently verified.