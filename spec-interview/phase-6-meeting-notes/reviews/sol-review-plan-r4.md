**Verdict: APPROVE.**

**R3-1: Resolved.**

- [PLAN:13](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:13) and [T8:112](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:112) require actor `FOR SHARE` before settings, followed by authorization validation. This permits FK `KEY SHARE` while blocking removal/demotion. [PostgreSQL lock matrix](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
- The existing [removal RPC:644](E:/projects/virtual-office/supabase/migrations/20260718210827_phase7_company_member_atomic_removal.sql:644) and [role-change RPC:834](E:/projects/virtual-office/supabase/migrations/20260718210827_phase7_company_member_atomic_removal.sql:834) lock both users `FOR UPDATE`, ordered by UUID, before companies. The [role-update route:117](E:/projects/virtual-office/src/app/api/users/update/route.ts:117) uses that RPC.
- [T2:56](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:56) makes the note row the shared capacity lock. [T8:114](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:114) and [T12:163](E:/projects/virtual-office/spec-interview/phase-6-meeting-notes/PLAN.md:163) require revocation races and the reported three-way concurrency case.

**New findings:** None established in the v4 changes.

Assessment covers PLAN text and repository source; the planned concurrency tests remain execution obligations.