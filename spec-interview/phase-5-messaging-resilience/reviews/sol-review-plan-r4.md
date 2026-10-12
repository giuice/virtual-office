**Verdict: revision required.** Two High and three Medium findings remain.

1. **High — Preserved room sync can restore revoked membership.**  
   **PLAN location:** [T28 Task/Done when/Verify by](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:47).

   The installed [`sync_conversation_members`](E:/projects/virtual-office/supabase/migrations/20260610210000_conversation_members_read_model.sql:55) inserts **every** ID in `NEW.participants`. After E’s membership is deleted, E remains in that array. An authorized newcomer joining through the existing server flow updates `participants`, recreating E’s membership—even if E is now excluded by the room ACL. Blocking direct client writes does not close this path.

   **Smallest fix:** require ordinary participant additions to preserve removals, with membership restoration restricted to an explicitly authorized rejoin. Define whether client DELETE is forbidden or constitutes leaving; distinguish either from administrative revocation. Test removal → another user’s legitimate join → E remains denied, plus explicit authorized rejoin. Check `/join` and the resolver’s stale-array early returns.

2. **High — Preference/archive writes can recreate membership after removal.**  
   **PLAN location:** [T28’s preserved server flows](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:47).

   These routes authorize first, then call the service-role [`setUserPreference` UPSERT](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseConversationRepository.ts:545). If removal commits between authorization and the UPSERT, the preference request inserts a replacement membership. The current positive route checks and outsider tests do not exercise this interleaving.

   **Smallest fix:** require preference/archive mutations to update existing membership without creating it; handle a vanished row explicitly. Add real integration coverage holding each mutation after authorization, deleting membership, then releasing it. Assert no replacement row and continued access denial.

3. **Medium — The hostile-write verification matrix is incomplete.**  
   **PLAN location:** [T28 Done when/Verify by](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:48).

   Checking anon and an outsider’s own access misses a current member granting access to another outsider. Locally, `update_own_conversations` permits member updates to `participants`; the definer trigger then creates the outsider’s row. Conversation INSERT also checks only that the caller appears in `participants`, allowing arbitrary other participants and room references.

   **Smallest fix:** explicitly test actors **and affected subjects**: current member granting an outsider membership, removed member, cross-company participant, unauthorized private-room creation, and `room_id`/`type` retargeting followed by resolver/join calls. Assert the complete membership delta and affected users’ access. Define authorized creation exceptions. `room_id` itself does not fire the sync trigger; its downstream resolver path needs separate tracing.

   Repeating the own-user predicate as `WITH CHECK` would not prevent conversation moves: PostgreSQL already inherits `USING` when that clause is omitted. [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html)

4. **Medium — Old-build compatibility does not cover the affected contracts.**  
   **PLAN location:** [standing compatibility rule](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:12), [T21](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:227), [T23](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:245).

   T21’s send/read/unread smoke can pass while conversation creation, preferences, or archive fail. Current conversation creation uses a user-scoped client. Historical build `e27dd10` also performs preference/archive UPSERTs through that role. Blanket revocation therefore has concrete compatibility consequences. D8 accepts the missing-member **read error**, not general breakage of these workflows.

   **Smallest fix:** extend both old-build smokes to new direct/room creation, authorized room joining, preferences, archive, and read. Include the conditional Knock-log check identified in [TRACK T3](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/TRACK.md:114). Require T23’s migration-first rollout and application-first rollback to preserve these proven contracts; document reverse SQL order and that undoing T28 restores the D9 vulnerability.

5. **Medium — Lost access leaves fenced recovery without a defined outcome.**  
   **PLAN location:** [T27](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:110), [T9](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/PLAN.md:128).

   [TRACK T2](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/TRACK.md:63) confirms that membership loss makes fencing return 403 without resolving delivery. A message can commit, lose its response, then lose membership. Treating that 403 as “not stored” permits a false cancellation/expiry; endlessly fencing leaves recovery stuck.

   **Smallest fix:** define a visible lost-access state that preserves uncertain delivery, stops automatic attempts, and never equates 403 with `not_stored`. After authorized access restoration, fence before retry/cancel/expiry. Test both committed-but-response-lost and not-yet-stored cases with removal before fencing.

Placement after T4 and before T5 matches D9; the Covers IDs are appropriate. The standing migration, rollback tracking, RLS review, and integration/E2E rules apply to T28. Any changes to Presence access or membership lifecycle also require its reviewer and affected runtime checks.

Evidence: v3→v4 diff, source/history inspection, and read-only LOCAL catalog queries. No files or database state changed; no online database access or mutating tests performed.