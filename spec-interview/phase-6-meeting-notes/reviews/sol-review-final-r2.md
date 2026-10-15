Verdict: **REVISION REQUIRED.**

- **F2-1 — Medium — [useMeetingNoteAiMutations.ts:108](E:/projects/virtual-office/src/hooks/mutations/useMeetingNoteAiMutations.ts:108): an outstanding detail fetch can undo the F-2 fix.**

  **Scenario:** A background refetch reads revision 1 but its response is delayed. Another editor saves revision 2; processing uses revision 2, and the access check caches revision 2. The delayed revision-1 response then arrives, reverting the cache and falsely disabling Apply.

  **Evidence:** The revision guard checks only data already cached. [settleMeetingNoteCache:33](E:/projects/virtual-office/src/hooks/mutations/useMeetingNoteMutations.ts:33) writes without cancelling the detail fetch and excludes that query from invalidation. TanStack’s [fetch completion:578](E:/projects/virtual-office/node_modules/@tanstack/query-core/src/query.ts:578) subsequently writes its result unconditionally. The new E2E does not exercise this response ordering.

  **Fix:** Cancel the outstanding exact detail query before comparing and storing the confirmed note, preserving scope fencing across any await. Add E2E coverage holding a real older detail response until after the access-check refresh.

F-1’s callers preserve failure-only behavior, and its fault injection is test-only and occurs after the real RPC response. F-3’s whitespace check passes. Recorded passing test logs were inspected; runtime tests were not rerun.