Verdict: **REVISION REQUIRED**

1. **D-1 — Medium — [processing.ts:323](/E:/projects/virtual-office/src/lib/meeting-notes/ai/processing.ts:323)**  
   **Problem:** Access can be revoked after `recheckAccess()` and before draft delivery.  
   **Scenario/evidence:** An admin removes the requester—or deletes the note—while settlement or usage lookup is pending. Settlement checks only the operation row; a denied usage lookup becomes `null`. The route still returns `200` with the draft. Apply authorization does not protect this disclosure.  
   **Fix:** Revalidate membership and note existence during atomic success finalization, locking actor → note → operation. Discard when access was lost. Cover removal/deletion after the preliminary access read.

2. **D-2 — Medium — [processing.ts:328](/E:/projects/virtual-office/src/lib/meeting-notes/ai/processing.ts:328)**  
   **Problem:** Cancellation during finalization is recorded incorrectly.  
   **Scenario/evidence:** Cancel while `recheckAccess()` awaits the database. The code subsequently settles `succeeded`, then detects cancellation. Replay consequently returns `succeeded`, contrary to FR-021/AC-034. Cancellation during the final `ownUsage()` await bypasses even that abort check.  
   **Fix:** Check cancellation after post-provider awaits and before success finalization; preserve a durable discarded result for cancellation during finalization without refunding usage. Add regression coverage for both windows.

3. **D-3 — Medium — [useMeetingNoteAiFlow.ts:235](/E:/projects/virtual-office/src/hooks/ui/useMeetingNoteAiFlow.ts:235)**  
   **Problem:** A successful response already in transit can display a draft after remote membership removal.  
   **Scenario/evidence:** Hold a real `200` response, remove the member, and delay the Realtime invalidation. The browser still has the old CompanyContext scope; attempt and abort checks pass, so the callback renders the draft. Scope retirement depends on membership reconciliation. The [AC-033 spec:162](/E:/projects/virtual-office/__tests__/api/playwright/meeting-notes/ai-late-response-scope.spec.ts:162) pauses the provider instead, allowing the server’s later access check to reject the result; it never exercises this successful late-response path.  
   **Fix:** Verify current membership before exposing a completed draft, retiring the scope on lost access. Update AC-033 to hold an actual successful route response after `route.fetch()`, then remove the member before delivery.

4. **D-4 — Low — [meeting-notes-ai-e2e.ts:145](/E:/projects/virtual-office/__tests__/api/playwright/helpers/meeting-notes-ai-e2e.ts:145)**  
   **Problem:** The “ever rendered” assertion can produce a false green across full-page navigation.  
   **Scenario/evidence:** Navigation destroys the observer and its window flag. `draftReviewWasSeen()` treats the missing flag as `false`, losing any earlier observation. TRACK acknowledges this limitation.  
   **Fix:** Install the observer through `addInitScript` and record observations in the test process through an exposed binding; assert monitoring is active in every document.

5. **D-5 — Low — [MeetingNoteAiPanel.tsx:71](/E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteAiPanel.tsx:71)**  
   **Problem:** “This can take up to a minute” contradicts the configured deadline.  
   **Scenario/evidence:** A provider can legitimately take two minutes; the default timeout is 180 seconds, configurable to 300 seconds.  
   **Fix:** Remove the one-minute promise or use accurate duration wording.

Read-only typecheck and lint across 59 changed TypeScript files passed. Runtime tests and database/migration state were not verified.