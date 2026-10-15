Verdict: **REVISION REQUIRED.**

1. **F-1 — Medium — [processing.ts:401](E:/projects/virtual-office/src/lib/meeting-notes/ai/processing.ts:401): quota is consumed when the dispatch-mark reply is lost.**  
   If the RPC commits `dispatched` but its HTTP response is lost, `marked` remains false and no AI request occurs. Recovery requests `released`, which [SQL rejects](E:/projects/virtual-office/supabase/migrations/20261013154823_meeting_notes_ai_usage_and_operations.sql:718) with `DETAIL.status = dispatched`. `settle()` discards that detail and returns `status: null`, making the refund branch unreachable. The operation stays counted, contrary to FR-022 and TRACK’s “fixed” claim.  
   **Fix:** preserve the validated transition-refusal status and refund this confirmed never-sent operation. Add integration coverage that commits the real RPC and drops its response.

2. **F-2 — Medium — [MeetingNoteAiReview.tsx:84](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteAiReview.tsx:84): a valid draft is blocked by an older cached revision.**  
   Keep revision 1 open while another editor commits revision 2, then generate a draft. Ticket/admission correctly use revision 2, but the [successful access check](E:/projects/virtual-office/src/hooks/mutations/useMeetingNoteAiMutations.ts:124) discards the freshly fetched note. Review compares cached revision 1 with source revision 2, falsely reports a conflict, and disables Apply. Reprocess can consume another unit without fixing the cache.  
   **Fix:** update the scope-fenced cache from the access check, preserving newer cached state. Add a two-account E2E covering an edit before ticket issuance.

3. **F-3 — Low — [company/page.tsx:35](E:/projects/virtual-office/src/app/(dashboard)/company/page.tsx:35): the final diff check fails.**  
   `git diff --check` reports trailing whitespace. **Fix:** remove it.

Findings are based on source tracing and T14 artifact inspection; these failure scenarios were not run. No files or database state changed.