**Verdict: REVISION REQUIRED.**

**Section A: Prior-finding status**

| Finding | Status | Reason against SPEC v3 |
|---|---|---|
| N1 | Resolved | FR-016 disables SDK/transport retries; FR-022 permits one dispatch per reservation; AC-029 checks received requests. |
| N2 | Resolved | FR-022 requires documented adapter signals, keeps ambiguous outcomes counted, and restricts settlement to the server, once against the original day. |
| N3 | Partially | Scope, binding, midnight replay, and explicit retry are defined. Expiry, abandoned pending operations, and replay versus cancellation remain incomplete: R3-1/2. |
| N4 | Partially | Return-time membership and transactional Apply checks exist. Late browser results after identity changes remain unaddressed: R3-3. |
| N5 | Resolved | FR-018 binds Apply to the generation-start revision and transcript identity; AC-030 exercises replacement during generation. |
| N6 | Resolved | FR-016 prohibits roster export; matching occurs locally; AC-013 inspects the outbound payload. |
| N7 | Partially | Names survive deletion, but immutable historical UUIDs are not separated from nullable live references: R3-5. |
| N8 | Resolved | FR-021 requires browser cancellation and best-effort provider abortion without reversing dispatch counting. |
| N9 | Resolved | AC-009 separates below-capacity validation fixtures from the capacity fixture. |
| H2 | Partially | Admission, settlement, retries, and crash accounting are defined; idempotency lifecycle gaps remain. |
| M3 | Resolved | Note/item revisions, source-bound Apply, and atomic summary/items/version writes address the original scenarios. |
| M4 | Partially | Membership, snapshots, and rejoin rules are defined; client-side revocation handling remains incomplete. |
| M8 | Resolved | The originally requested acceptance cases are substantially explicit, including the corrected AC-009 fixture. |

**Section B: New findings**

1. **R3-1 — Medium — FR-018/021/031, §5: replay conflicts with draft disposal.**

   **Problem/scenario:** A member leaves while processing finishes. FR-021 requires discarding the draft, but FR-031 promises the same final result on replay and retains keys for at least 48 hours. The SPEC never distinguishes retained accounting metadata from retained draft content or defines which outcome wins this race.

   **Evidence:** [SPEC:80](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:80), [SPEC:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:122), [SPEC:132](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:132).

   **SPEC fix:** Define cancellation/deletion retirement explicitly: discard cached draft payloads; replay returns a terminal discarded/cancelled status without dispatch. Retain non-content deduplication/accounting records; deleting a note or user must not replenish company usage. Test cancellation versus completion and deletion versus replay through real routes and DB.

2. **R3-2 — Medium — FR-022/031: expiry and crash replay have no complete contract.**

   **Problem/scenario:** A suspended browser retries after three days. The minimum retention permits key eviction, contradicting “never counts again.” Separately, a crash leaves a counted reservation with no outcome; repeated requests may remain pending indefinitely.

   **Evidence:** [SPEC:123](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:123), [SPEC:132](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:132), [SPEC:278](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:278).

   **SPEC fix:** Specify replay expiry and stale-key rejection, or durable tombstones preventing redispatch after payload eviction. Give abandoned pending operations a bounded terminal outcome, preserving their charge and requiring a new key for explicit retry. Add expired-key and actual process-crash integration cases.

3. **R3-3 — Medium — FR-021/030, SM-3: server reauthorization does not fence browser delivery.**

   **Problem/scenario:** The server authorizes a response, then the browser processes membership removal or an account/company switch before the response arrives. An old callback or cached draft can repopulate the new identity’s UI. AC-030 removes membership before server return, so it misses this window.

   **Evidence:** [SPEC:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:122), [SPEC:280](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:280). Existing invalidation clears company state specifically: [CompanyContext.tsx:307](E:/projects/virtual-office/src/contexts/CompanyContext.tsx:307).

   **SPEC fix:** Scope note caches and draft ownership by company, application user, and identity generation. On logout/removal/scope change, clear drafts, cancel requests, and reject late callbacks. Test delayed delivery of an actual route response during an identity change.

4. **R3-4 — Medium — FR-011/018, AC-009: aggregate item capacity lacks competing-write coverage.**

   **Problem/scenario:** At 99 items, two manual additions—or an addition racing with Apply—can independently pass a capacity check. Per-item revisions do not serialize new items. Existing capacity acceptance tests are sequential.

   **Evidence:** [SPEC:112](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:112), [SPEC:119](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:119), [SPEC:259](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:259).

   **SPEC fix:** Require atomic capacity enforcement shared by every insertion path. Add real competing-transaction tests at 99 items, including manual-add versus Apply, asserting the total never exceeds 100 and a refused Apply changes nothing.

5. **R3-5 — Low — FR-029, §9/12, AC-006/031: historical identity and live references remain conflated.**

   **Problem/scenario:** Deleting an author/editor nulls the only specified UUID field. The name survives, but the promised immutable application identity does not. “Versions are insert-only” also needs an explicit distinction from FK maintenance.

   **Evidence:** [SPEC:130](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:130), [SPEC:172](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:172), [SPEC:173](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:173), [SPEC:235](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:235).

   **SPEC fix:** Preserve immutable historical UUID/name snapshots separately from nullable live-user FKs. Define immutability over historical fields and client writes; permit only prescribed live-reference cleanup. AC-031 should verify UUID snapshots as well as names.

6. **R3-6 — Low — FR-022, AC-029: refund fixtures do not precisely represent provider errors.**

   **Problem/scenario:** “Before any response body” is ambiguous: status headers precede bodies, while normal provider rejection responses contain JSON. AC-029’s unqualified 529/503 expectation also omits the adapter-specific signal required by FR-022. Anthropic documents JSON error bodies. [Claude error documentation](https://platform.claude.com/docs/en/api/errors#Error-shapes).

   **Evidence:** [SPEC:123](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:123), [SPEC:279](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/SPEC.md:279).

   **SPEC fix:** Distinguish initial non-2xx rejection responses, including their normal error bodies, from errors inside accepted streams. Test documented status/type/code combinations per adapter; unknown responses remain counted. Keep the application and Supabase real.

Read-only review; no files changed. Online schema and runtime were not inspected.