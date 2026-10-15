**Verdict: REVISION REQUIRED.**

1. **H1 — High — FR-021, FR-024, BR-008: cancellation bypasses cost protection.**  
   **Scenario (browser/network):** A member starts processing, leaves after billable provider work begins, and repeats. FR-021 guarantees an unchanged counter, allowing unlimited company expenditure. Paid processing can produce no visible output. [OpenAI documentation](https://developers.openai.com/api/docs/guides/reasoning).  
   **Evidence:** [SPEC:119](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:119), [owner cancellation answer:91](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:91).  
   **Fix:** Add an **owner-approved** dispatch/attempt budget independent of successful-draft counting: cancellation after provider dispatch cannot replenish that budget. Changing cancellation counting instead also requires owner confirmation; it contradicts the recorded answer.

2. **H2 — High — FR-024, BR-008, AC-016: quota admission and settlement are undefined.**  
   **Scenario (concurrency/network/crash):** At 19/20, several requests independently pass the limit check and call the provider. A retried POST can produce another billed request; a crash between provider success and counter update loses accounting. AC-016 never asserts successful increments.  
   **Evidence:** [SPEC:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:122), [AC-016:236](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:236).  
   **Fix:** Require atomic company/day reservations before dispatch, admission against successful plus reserved usage, request idempotency, and crash recovery. Define “successful draft” as validated generation, independent of saving the note. Confirm the day boundary and test competing requests, retries, reset, reprocessing, and settings changes.

3. **H3 — High — FR-027, BR-001/003, §9: retained notes lack durable company and creator identity.**  
   **Scenario (real user):** An admin deletes a space. `room_id` is currently NOT NULL, so SET NULL fails; retaining a nullable row still makes existing note/item RLS deny access because both policies join through the deleted space. The schema also has only `edited_by`, which cannot establish the original author.  
   **Evidence:** [baseline:643](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:643), [RLS:256](E:/projects/virtual-office/supabase/migrations/20260610183139_enable_core_table_rls.sql:256).  
   **Fix:** Specify immutable, server-derived note company and creator identities using application UUIDs; nullable `room_id` with SET NULL; authorization/search through the retained company identity. Define company-deletion behavior and an owner-approved legacy-author policy—never infer creator from last editor.

4. **H4 — High — FR-015/022, §12: provider notice can become stale before dispatch.**  
   **Scenario (concurrency):** A member sees “Anthropic”; an admin changes the provider to GLM; processing reads the latest settings and sends the transcript to GLM without the promised notice. Mid-processing key/model changes also have no defined behavior.  
   **Evidence:** [FR-015:113](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:113), [privacy notice:207](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:207).  
   **Fix:** Bind the notice/start request to a settings revision. Reject stale revisions before dispatch and show the new provider notice. Snapshot the provider/key/model configuration for an admitted request; prohibit silent fallback and require a refreshed notice for subsequent retries.

5. **M1 — Medium — BR-003/004/005, FR-006/009/011: authorization-sensitive mutation paths are underspecified.**  
   **Scenario (real member):** A viewer inserts themselves into participants before authorization checks the resulting list. An assignee uses a broadly permitted item UPDATE to change description, assignee, or parent note. An existing participant grants another viewer editing rights through participant editing or restore.  
   **Evidence:** [business rules:134](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:134), [RLS requirement:204](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:204). RLS alone does not restrict writable columns. [Supabase documentation](https://supabase.com/docs/guides/database/postgres/column-level-security).  
   **Fix:** Require authorization against committed **pre-change** membership and participants, enforced at API and database/RPC boundaries. Completion must accept only the desired completion state. Protect ownership and parent IDs. Confirm who may change participant edit permissions, including through restore. Add same-company direct-database attacks and company-A-admin versus company-B tests.

6. **M2 — Medium — FR-018/020, AC-010/016: persistence requirements contradict each other.**  
   **Scenario (provider failure):** Creating a note from a transcript saves nothing until review under AC-010. If generation fails, FR-020 and AC-016 require that nonexistent note and transcript to “stay saved.” Attachment failure likewise leaves unclear whether the old or replacement transcript survives.  
   **Evidence:** [AC-010:230](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:230), [AC-016:236](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:236), [owner F3 answer:91](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:91).  
   **Fix:** Obtain an owner decision and specify separate persistence states for new-note generation, attachment replacement, and reprocessing. Define what exists before dispatch, after failure/cancellation, and after reviewed save; align both ACs.

7. **M3 — Medium — FR-007/008/018, BR-007/011: concurrency and atomicity stop at an unclear boundary.**  
   **Scenario (concurrency/crash):** Transcript replacement races with reprocessing; item editing overwrites an assignee’s completion; restore races with editing. A crash can save summary/transcript but omit accepted items or the immutable version.  
   **Evidence:** [FR-007:105](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:105). The existing [repository update:120](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseMeetingNoteRepository.ts:120) performs an unconditional update and handles items separately.  
   **Fix:** Define revisions for note edits, restore, transcript replacement, AI draft application, and item mutations. Require atomic reviewed-save commits and current authorization at commit. Preserve the owner’s current-state-only item history policy; explicitly state whether restore leaves the transcript unchanged. Add actual competing-transaction coverage.

8. **M4 — Medium — FR-028, BR-005, AC-006/021: “active” and historical membership conflict.**  
   **Scenario (membership removal/restore):** Removal sets `users.company_id = NULL`; it does not set an “inactive” membership status. A retained former participant violates BR-005’s blanket active-member requirement, potentially preventing later saves or restores. Physical user deletion sets an item’s assignee to NULL, making “Former member” indistinguishable from originally unassigned.  
   **Evidence:** [removal migration:770](E:/projects/virtual-office/supabase/migrations/20260718210827_phase7_company_member_atomic_removal.sql:770), [assignee FK:1391](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:1391).  
   **Fix:** Define membership through persisted company affiliation, independently of presence status. Restrict *new selections* to current members while permitting retained historical placeholders without granting rights. Define deleted/rejoined-user handling across versions, restore, and export, and reauthorize in-flight results/saves after removal.

9. **M5 — Medium — FR-018/019: reprocessing has no action-item merge contract.**  
   **Scenario (real editor):** A note already has completed/manual items. Saving a regenerated draft could append duplicates, replace every existing item, or exceed the 100-item maximum. All are plausible interpretations of “saving stores accepted items.”  
   **Evidence:** [FR-018/019:116](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:116), [owner reprocessing answer:90](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:90).  
   **Fix:** Record an owner-approved append/reconcile/replace policy, duplicate handling, preservation of existing completion state, and behavior when accepted plus existing items exceed 100. Test reprocessing a populated note rather than only a new note.

10. **M6 — Medium — BR-009, §10/12, AC-017: key isolation and verification omit important surfaces.**  
    **Scenario (real member/provider error):** Placing encrypted AI credentials in existing `companies.settings` exposes that data through normal company reads and direct Supabase SELECT. Masking the new settings response does not fix those paths. Raw provider errors can also expose credentials. “No page ever contains the key” contradicts entering it in the admin form.  
    **Evidence:** [company mapping:14](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseCompanyRepository.ts:14), [company response:45](E:/projects/virtual-office/src/app/api/companies/get/route.ts:45), [company SELECT policy:209](E:/projects/virtual-office/supabase/migrations/20260610183139_enable_core_table_rls.sql:209).  
    **Fix:** Require isolated server-only secret storage, outside universally readable settings, with no client SELECT/decrypt/Realtime access. Define safe metadata responses. Exempt initial admin entry from the browser prohibition; add canary checks for own-company database access, responses, errors, logs, bundles, and Realtime payloads.

11. **M7 — Medium — FR-012/016/022, SM-1, §17: accepted size, provider capabilities, and latency are not reconciled.**  
    **Scenario (valid upload/admin configuration):** A ≤1 MB transcript exceeds the chosen model’s token budget, reasoning consumes the output budget, or a permitted effort value is unsupported. Generation returns truncated JSON or misses 60 seconds. OpenAI-compatible transport does not imply identical reasoning controls. [OpenAI](https://developers.openai.com/api/docs/guides/reasoning), [Kimi](https://platform.kimi.ai/docs/guide/use-thinking-models), [GLM](https://docs.z.ai/guides/capabilities/thinking).  
    **Evidence:** [SM-1:37](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:37), [provider requirement:120](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:120).  
    **Fix:** Require a provider/model capability matrix, validated wire parameters, token preflight including prompt/member-list/output budgets, bounded output, and handling of malformed/refused/truncated drafts. Resolve oversized-context behavior without silently weakening the approved upload limit. Define the latency fixture, timing interval, and deployment deadline. Test all four adapters; AC-022 proves only the tested OpenAI configuration.

12. **M8 — Medium — §14/15 and state readiness claims: AC references do not establish complete coverage.**  
    **Scenario (ordinary use/security attempts):** Tests can pass while private-space creation fails, former/cross-company assignees are accepted, history is mutable, or search ignores action-item descriptions.  
    **Evidence:** [ACs:221](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:221), [readiness claim:149](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:149).  
    **Fix:** Add explicit assertions for required title/date; supported formatting and full note display; private-space creation; editor item edit/delete and unrelated completion denial; assignee eligibility; immutable versions and viewer restore denial; per-item review/edit/reassignment; successful usage counting; every search field/language/case, pagination and ordering; and malicious AI output through view/export. Define SM-2’s measurement environment—local-only AC-014 does not establish an unrestricted performance claim. Use real DB/routes/UI; the approved external fake AI server remains permissible.

13. **M9 — Medium — §9/10/16: migration and compatibility obligations are incomplete.**  
    **Scenario (rollout/legacy data):** Changing only the two example fields leaves no creator/backfill contract, writable database boundary, versions/participants/settings/usage structures, or maintained search index. Date-only due dates still use `timestamptz`, inviting timezone-dependent day changes.  
    **Evidence:** [existing due-date type:633](E:/projects/virtual-office/supabase/migrations/20260610183000_baseline_core_schema.sql:633), [current grants:164](E:/projects/virtual-office/supabase/migrations/20260610183139_enable_core_table_rls.sql:164), [required TS fields:180](E:/projects/virtual-office/src/types/database.ts:180), [AGENTS schema verification:143](E:/projects/virtual-office/AGENTS.md:143).  
    **Fix:** Enumerate required database contracts, legacy-data decisions, date-only representation, grants/RPCs, indexes, and encryption prerequisites. Require catalog/data preflight on `vhabpcoyypobgasacsko` before authorized application, then readback/smoke checks. Specify compatible application rollback without restoring destructive cascade behavior. No runtime meeting-note repository caller exists in current source; deployed code/catalog remain unverified.

14. **L1 — Low — FR-022: default 20 is an unconfirmed policy choice.**  
    **Scenario (new company/admin):** The application establishes a default limit the interview records only as an example.  
    **Evidence:** [FR-022:120](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:120), [“e.g. 20”:61](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/state.md:61).  
    **Fix:** Mark the default pending owner confirmation or record explicit approval before treating 20 as contractual.

15. **L2 — Low — AC-001 versus FR-003: creation order contradicts meeting-date order.**  
    **Scenario (real member):** Creating a backdated note must not place it first, but AC-001 unconditionally requires first position.  
    **Evidence:** [FR-003:101](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:101), [AC-001:221](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:221).  
    **Fix:** Make the fixture’s meeting date explicitly newest and add a backdated-note assertion proving placement by meeting date.

No files changed. Online database and deployed runtime were not inspected.