**Verdict: REVISION REQUIRED.**

- **B-1 — High — API keys remain in React Query’s mutation cache.**  
  [useMeetingNoteAiSettingsMutations.ts:33](E:/projects/virtual-office/src/hooks/mutations/useMeetingNoteAiSettingsMutations.ts:33), [MeetingNoteAiSettingsSection.tsx:145](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteAiSettingsSection.tsx:145)  
  Saving passes the full `apiKey` to `mutate()`. TanStack retains it in `mutation.state.variables` after success or failure; clearing the password field does not remove it. An installed-library probe confirmed this retention. The shared cache survives sign-out, exposing the old key through mutation inspection, including development query tools. The existing canary E2E checks responses, input values, and HTML, but never mutation state.  
  **Fix:** keep the write-only key outside cached mutation variables, clear secret-bearing state on settlement and identity changes, and extend the canary E2E to check retention before reloading.

- **B-2 — High — An export can deliver the previous account’s note after sign-out.**  
  [MeetingNoteExportControls.tsx:47](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteExportControls.tsx:47)  
  The mutation supplies no cancellation signal or user/company fence. Its hook-level `onSuccess` always calls `saveFile()`. Start an export containing a transcript, delay the response, then sign out and sign into another company: the old response can still create a download in the new session. A Query Core probe confirmed that this callback executes after its observer unsubscribes. Other note mutations also retain callbacks and cached results after scope retirement.  
  **Fix:** capture the originating identity, abort pending requests on scope retirement, reject late callbacks, and clear the retired scope’s query and mutation data. Add an E2E covering a delayed export across account switching.

- **B-3 — Medium — A network failure while saving destroys unsaved edits.**  
  [MeetingNoteView.tsx:93](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteView.tsx:93), [useMeetingNoteMutations.ts:84](E:/projects/virtual-office/src/hooks/mutations/useMeetingNoteMutations.ts:84)  
  A failed save invalidates the detail query. If the browser remains offline, that refetch fails; `detail.isError` then replaces the editor before the `editing` branch, unmounting its draft state. The installed Query Core reproduces an error result while retaining previous data, so this happens despite having a usable cached note. Reconnecting cannot recover the discarded text.  
  **Fix:** preserve the editor and draft through transport/server refetch failures and show an error alongside it. Add an offline-save E2E asserting that every edited field survives reconnection.

- **B-4 — Medium — Confirmation dialogs silently adopt newer revisions.**  
  [MeetingNoteDeleteButton.tsx:44](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteDeleteButton.tsx:44), [MeetingNoteHistoryDialog.tsx:67](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteHistoryDialog.tsx:67), [MeetingNoteActionItemDeleteButton.tsx:43](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteActionItemDeleteButton.tsx:43)  
  Delete and Restore read the live prop’s revision when confirmation is clicked. Open Delete at revision 3, let another editor change the content, then return after a production focus refetch: confirmation sends revision 4 and deletes the concurrent work without a 409. The dialog can remain visually identical because it shows only the title. Restore and item deletion have the same revision-adoption problem.  
  **Fix:** capture the revision and displayed state when the operation is initiated. Require explicit review before adopting a conflict’s newer revision. Cover background refetch during confirmation in E2E.

- **B-5 — Low — History omits former-member labels.**  
  [MeetingNoteHistoryDialog.tsx:134](E:/projects/virtual-office/src/components/meeting-notes/MeetingNoteHistoryDialog.tsx:134)  
  Historical participants render only their snapshot names. Removing a participant and opening an old version therefore omits “Former member,” contrary to FR-030’s version-display requirement. The former-member E2E covers only the current view and edit form.  
  **Fix:** derive current membership for historical participant IDs, preserve their snapshot names, and cover history in that E2E.

- **B-6 — Low — Markdown escaping permits unintended structure and loses heading text.**  
  [html-to-markdown.ts:69](E:/projects/virtual-office/src/lib/meeting-notes/html-to-markdown.ts:69), [markdown-escape.ts:14](E:/projects/virtual-office/src/lib/meeting-notes/markdown-escape.ts:14)  
  Production-function probes show `<p><span>1</span>. text</p>` exports as an ordered list, while a title `Topic #` exports as `# Topic #`, whose final hash is interpreted as heading syntax. Fragment-local escaping misses syntax assembled across text nodes and trailing ATX markers. This contradicts the comments promising no structure from plain user text.  
  **Fix:** escape relevant punctuation across text fragments and trailing heading markers; add export-route regressions for both examples.

- **B-7 — Low — OpenAI rejection entries wildcard unknown error codes.**  
  [capabilities.ts:35](E:/projects/virtual-office/src/lib/meeting-notes/ai/capabilities.ts:35), [capabilities.ts:233](E:/projects/virtual-office/src/lib/meeting-notes/ai/capabilities.ts:233)  
  Undefined type/code explicitly means “any body,” so the 401/403/429 entries also classify unknown codes as refundable. FR-022 requires unknown codes to stay counted. The cited [OpenAI error documentation](https://developers.openai.com/api/docs/guides/error-codes) supplies specific codes for several 429 cases. This becomes observable when T11 consumes the matrix.  
  **Fix:** define explicit rejection predicates, require a normal provider error body, and retain counting for unknown type/code combinations.

Review used source inspection and in-memory probes. Database integration and E2E suites were inspected, not rerun; no files or database state were changed.