**Verdict: revision required — one new High and one Medium remain.**

| r4 finding | Disposition |
|---|---|
| 1. Room sync restores removed members | Core restoration issue resolved: removals survive unrelated writes, and rejoin is explicit. DELETE semantics remain incomplete; see N2. |
| 2. Preference/archive UPSERT restores membership | Resolved in the plan: writes must affect existing membership only, with removal-after-authorization tests. |
| 3. Hostile-write matrix incomplete | Resolved: actors, affected subjects, creation-time enrollment, and retargeting are covered. |
| 4. Old-build compatibility and rollback | Resolved: T21 includes affected workflows and conditional Knock logging; T23 specifies reverse migration rollback and the restored D9 vulnerability. |
| 5. Fence 403 during unknown recovery | Resolved: failed with preserved text, no automatic retry, no inference of `not_stored`, and fencing before manual redispatch. |

1. **High — T28 leaves authorization stale across a membership grant.**  
   **PLAN location:** [T28 Task/Verify by](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:47).

   The plan requires an “authorized” join/rejoin but does not establish when that authorization must remain valid. The existing [join route](E:/projects/virtual-office/src/app/api/conversations/join/route.ts:58) checks room access before a separate service-role mutation. The [resolver](E:/projects/virtual-office/src/lib/services/ConversationResolverService.ts:141) has the same separation before creation or participant addition.

   **Failure scenario:** hold a join/rejoin after its positive room-access check, revoke that user’s room permission, then release the membership write. Preserving that check-then-write path can grant membership using stale authorization. The revised matrix exercises users already unauthorized and races preference writes against removal; it does not exercise this grant race. An unlocked database policy lookup can likewise retain stale authorization across a wait. [PostgreSQL row-security guidance](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

   **Smallest fix:** require committed revocation before the membership mutation to prevent the grant/restoration. Add held creation/join/rejoin integration cases asserting no membership and continued access denial. Apply that guarantee to legacy user-scoped writes as well as current service-role paths.

2. **Medium — “Client DELETE … decided and recorded” lacks an enforced, verified outcome.**  
   **PLAN location:** [T28 Task, Done when, Verify by](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:47).

   Choosing leave versus forbidden during execution is acceptable. Recording the choice alone is insufficient: neither the postcondition nor the verification explicitly checks that choice.

   **Failure scenario:** TRACK records “forbidden,” while the existing own-row DELETE policy remains effective. The listed enrollment, restoration, preference, and compatibility tests can pass despite the recorded policy being false.

   **Smallest fix:** require the chosen DELETE behavior to be enforced. Verify self-DELETE’s expected membership delta and denial of deleting another user’s membership. If self-DELETE means leave, distinguish it from administrative revocation and verify the corresponding rejoin authorization.

The 403 wording does **not inherently conflict** with BR-007 or AC-007. “Apagar” can discard the failed local item under FR-007 without claiming cancellation or proving non-delivery. BR-007’s safe-cancellation conditions still apply to “Cancelar.” AC-007’s queued-before-access-loss case remains covered; it does not establish that an earlier unknown attempt was never stored. FR-009 also remains intact because 403 cannot authorize expiry.

Legacy user-scoped writes are compatible with server-side authorization, provided the database boundary enforces the same rules against direct client access. Blanket privilege revocation would break the newly required compatibility checks.

Dependencies and Covers pass: PLAN plus completed TRACK entries cover all **34 FRs and 50 ACs**, with no invalid Covers IDs or unresolved dependency references. Both fixes above fit within the unchanged SPEC.

Static review only; no files changed or database queries ran. Local CLI startup failed on a blocked telemetry write. No online database was accessed.