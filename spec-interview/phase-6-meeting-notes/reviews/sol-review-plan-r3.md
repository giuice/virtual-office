**Verdict: REVISION REQUIRED.**

| Finding | Status | Assessment from PLAN v3 |
|---|---|---|
| P5 | Resolved | Kill after provider receipt, backdate dispatch by 11 minutes, then execute maintenance within the suite timeout. [PLAN:162](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:162) |
| R2-1 | Resolved | Idempotent release requires demonstrably no request sent; route tests require zero requests and unchanged usage. This matches FR-022. [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122), [PLAN:162](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:162) |
| R2-2 | Resolved | Server-derived actor, authorization under an actor-row lock, and removal/demotion race evidence are specified. Lock composition introduces R3-1 below. [PLAN:111](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:111), [PLAN:113](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:113) |
| R2-3 | Resolved | New admission validates revision/transcript under the note lock and captures matching text; existing-operation replay remains independent of later source changes. [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122) |
| R2-4 | Resolved | Signed server-generated key expires with its ticket before lookup; fresh-ticket/old-key rejection is tested. [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122), [PLAN:162](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:162) |
| R2-5 | Resolved | Retained-participant saves, restored editing rights, and restored assignee completion rights have explicit mutation tests. [PLAN:48](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:48), [PLAN:57](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:57) |
| R2-6 | Resolved | Revocation includes `service_role`; effective EXECUTE grants are checked. [PLAN:12](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:12) |

**R3-1 — Medium — T8/T9/T12, with T2: Unspecified lock modes permit a three-way deadlock.**

**Problem/scenario:** A conventional `FOR UPDATE` implementation of T8’s actor lock permits this realistic interleaving:

- Apply holds the note lock before inserting its version.
- Admission holds the settings lock and waits for that note.
- Settings save holds the applying admin’s user row and waits for settings.
- Apply’s version insert needs `KEY SHARE` on its live editor reference and waits for the admin row.

PostgreSQL aborts one transaction. Concurrent processing, Apply, and an admin saving settings can therefore fail without a revision conflict or authorization failure. This is an inferred risk permitted by the PLAN, not a reproduced implementation bug. Foreign-key checks take `KEY SHARE`, which conflicts with `FOR UPDATE`. [PostgreSQL FK implementation](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/ri_triggers.c), [lock matrix](https://www.postgresql.org/docs/15/explicit-locking.html#LOCKING-ROWS).

**Evidence:** Actor lock [PLAN:111](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:111); settings→note locking [PLAN:122](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:122); live editor reference [PLAN:37](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:37); Apply/version insertion [PLAN:160](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:160). Existing removal locks users `FOR UPDATE` before company: [migration:641](E:/projects/virtual-office/supabase/migrations/20260718210827_phase7_company_member_atomic_removal.sql:641).

**Concrete PLAN fix:** Require T8 to acquire the actor row `FOR SHARE` before settings and reauthorize after acquisition. This blocks removal/demotion while permitting FK checks. Specify one consistent order for T2’s per-note lock and the note row across Apply, attach, mutations, and admission. Add real DB concurrency coverage for settings-save/admission/Apply together and for settings-save versus the existing removal/role RPCs.

No separate replay defect established: replay retains the original ticket/key; T13’s explicit “new operation” requirement means “Try again” must obtain a fresh ticket/key.