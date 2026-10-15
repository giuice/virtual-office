**Verdict: REVISION REQUIRED.**

**Section A: Round-1 finding status**

| Finding | Status | Reason |
|---|---|---|
| H1 | Resolved | FR-022 and AC-016 count cancellation after dispatch, matching round 4. |
| H2 | Partially | Atomic admission, crash accounting, and the day boundary are defined. Dispatch retries, refund classification, and idempotency lifecycle remain incomplete: N1–N3. |
| H3 | Resolved | Immutable company/creator identity, nullable space FK, company cascade, and conditional legacy backfill are specified. |
| H4 | Resolved | Notice revision, admission snapshot, stale-settings rejection, and no fallback are explicit. |
| M1 | Resolved | Pre-change authorization, participant-permission changes, completion-only updates, immutable identifiers, and direct-client attacks are covered. |
| M2 | Resolved | Upload persists the note/transcript immediately; generation and Apply are separate states. |
| M3 | Partially | Note/item revisions and atomic Apply are specified, but a draft is not explicitly bound to its generation inputs: N5. |
| M4 | Partially | Current membership, historical snapshots, and retained former members are defined. In-flight revocation remains unspecified: N4. |
| M5 | Resolved | Append policy, unchecked duplicates, preservation of existing items, and the resulting-total limit match round 4. |
| M6 | Resolved | Server-only encrypted storage, client grants/publication restrictions, sanitized errors, and canary surfaces are specified. |
| M7 | Resolved | Capability matrix, context/output preflight, truncated-output handling, and a bounded OpenAI latency fixture replace the previous unrestricted claims. |
| M8 | Partially | Coverage is substantially expanded, but AC-009 can pass without proving description or assignee validation: N9. |
| M9 | Resolved | Required structures, grants/RLS, date-only due dates, legacy-data gate, rollout, readback, and rollback are specified. |
| L1 | Resolved | Round 4 explicitly confirms 20/day and midnight Brasília. |
| L2 | Resolved | AC-001 includes today’s note and a backdated note, matching meeting-date ordering. |

**Section B: New findings**

1. **High — N1 — FR-022, §9: SDK retries escape the reservation.**

   **Problem/scenario:** A provider accepts processing, but the connection fails before the response arrives. The official SDK retries, producing additional potentially billable dispatches under one reservation. Start-request idempotency does not constrain these outbound retries. OpenAI and Anthropic document automatic retries by default. [OpenAI Docs](https://developers.openai.com/api/reference/typescript#retries), [Anthropic error documentation](https://platform.claude.com/docs/en/api/errors).

   **Evidence:** [SPEC:123](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:123), [SPEC:166](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:166).  
   **SPEC fix:** Disable transparent SDK/transport retries. Every additional provider dispatch requires separate admission/accounting. Test connection loss after provider acceptance through real routes and DB, asserting the fake server’s received-request count.

2. **Medium — N2 — FR-022, AC-016: “rejected without processing” lacks an observable classification contract.**

   **Problem/scenario:** An overload error can occur after an accepted streaming response. Refunding every “overloaded/unavailable” error would refund processed work. A fake server’s internal knowledge that processing happened cannot establish what the application can infer from the real provider protocol. [Anthropic streaming errors](https://platform.claude.com/docs/en/build-with-claude/streaming#error-events).

   **Evidence:** [SPEC:123](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:123), [SPEC:261](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:261), [SPEC:279](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:279).  
   **SPEC fix:** Define provider-specific, documented pre-processing rejection signals. Ambiguous outcomes remain counted. Clients cannot classify or refund attempts, including through RPCs. Settlement releases a reservation at most once against its original day. Tests must use observable production protocol signals, without private “processed” flags.

3. **Medium — N3 — FR-022, AC-028: idempotency keys have no scope, payload binding, or lifetime.**

   **Problem/scenario:** A client reuses a key for another note or changed transcript; two callers collide; or a delayed retry crosses midnight and a company/day lookup treats it as new. The SPEC does not define mismatch responses, pending/terminal replay behavior, or retention.

   **Evidence:** [SPEC:123](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:123), [SPEC:172](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:172), [SPEC:273](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:273).  
   **SPEC fix:** Scope keys to authenticated company, application user, and operation; bind them to note/input/settings revisions. Reject changed payloads. Define replay retention across midnight and crash recovery, reauthorize every replay, and distinguish transport retry from a deliberate new “Try again” operation.

4. **Medium — N4 — FR-030, BR-001: removal during generation has no response-time authorization gate.**

   **Problem/scenario:** A member starts generation, an admin removes them while the provider is processing, and the pending response delivers company-derived content after removal. Dispatch-time authorization and database RLS do not protect that provider response.

   **Evidence:** [SPEC:117](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:117), [SPEC:131](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:131); membership removal clears company affiliation at [migration:770](E:/projects/virtual-office/supabase/migrations/20260718210827_phase7_company_member_atomic_removal.sql:770).  
   **SPEC fix:** Recheck current membership and note existence before returning a draft; recheck mutation rights inside Apply’s transaction. Discard pending UI results on membership-scope changes. Add a paused-provider test with real member removal.

5. **Medium — N5 — FR-007, FR-016, FR-018: the draft’s source revision is unspecified.**

   **Problem/scenario:** Generation starts from transcript T1. Another editor uploads T2; the first browser refreshes to the latest note revision. Apply can submit that latest revision with the old T1 draft, passing revision comparison while applying stale material.

   **Evidence:** [SPEC:108](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:108), [SPEC:117](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:117), [SPEC:119](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:119).  
   **SPEC fix:** Snapshot the stored transcript and note revision at generation start; carry that source revision with the draft. Apply compares against that revision, even after UI refreshes. Test replacement while the fake provider is paused.

6. **Medium — N6 — FR-015/016, §12: v2 adds undisclosed roster export.**

   **Problem/scenario:** Processing an unrelated meeting sends every current employee’s display name to the provider. The recorded answer and privacy notice describe sending transcript text, so members whose names are absent from the transcript are nevertheless exported.

   **Evidence:** [SPEC:117](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:117), [SPEC:233](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:233), [owner answer:63](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:63).  
   **SPEC fix:** Extract suggested names from the transcript and resolve them against company members locally. A full-roster transfer requires a separate owner decision and explicit disclosure in the notice.

7. **Medium — N7 — FR-008/029/030, §9: deleted authors and version editors lack a durable lifecycle contract.**

   **Problem/scenario:** An author or historical editor is deleted. The new creator reference has no deletion rule, and snapshots cover participants/assignees only. Ordinary FK choices can block deletion, delete company notes, or erase historical attribution.

   **Evidence:** [SPEC:109](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:109), [SPEC:131](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:131), [SPEC:171](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:171); existing editor FK uses SET NULL at [baseline:1401](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:1401).  
   **SPEC fix:** Preserve immutable author/editor UUID and name snapshots independently of nullable live-user references. User deletion must preserve notes and immutable history. Define rejoin rights by stable application identity and test author/editor deletion.

8. **Low — N8 — FR-021, scope: navigation cancellation was weakened without an owner decision.**

   **Problem/scenario:** A user leaves, but processing continues because v2 requires only draft discard. Round 4 changed counting; it did not revoke the earlier cancellation decision.

   **Evidence:** [SPEC:80](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:80), [SPEC:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:122), [owner answers:91](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:91), [round 4:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:122).  
   **SPEC fix:** Require cancellation of the browser request and best-effort abortion of the outbound request, while retaining post-dispatch counting regardless of provider cancellation success.

9. **Low — N9 — AC-009: the capacity fixture masks other validators.**

   **Problem/scenario:** With 100 existing items, every attempted insertion fails on capacity—even if description length and assignee eligibility are never validated. The acceptance test can therefore pass with those guards missing.

   **Evidence:** [SPEC:254](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:254).  
   **SPEC fix:** Use a below-capacity fixture for invalid descriptions and former/cross-company assignees. Reserve the 100-item fixture for capacity assertions.

No files changed. Online database state was not inspected.