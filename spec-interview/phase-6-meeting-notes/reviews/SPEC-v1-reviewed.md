# SPEC: Phase 6 — Meeting Notes

Goal: Company members can record, revise, search, and export meeting notes per space — with action items, version history, and an AI-generated draft summary and action items from an uploaded transcript using the company's own AI provider key.

## 1. Summary

Virtual Office gains a meeting-notes capability. A member writes a note for a
space (title, meeting date, participants, rich-text content), tracks action
items, and can revise, restore, delete, search, and export notes. A member can
upload a meeting transcript (.txt, .vtt, .srt); the server sends it to the AI
provider configured by the company admin (Anthropic Claude, OpenAI, Kimi, or
GLM, using the company's own API key) and returns a draft summary and
suggested action items that the member reviews before anything is saved.
This delivers roadmap requirements MEET-01..MEET-07 plus Markdown export.
MEET-08 (assignment notifications and due-date reminders) moves to Phase 7.

## 2. Problem statement

Meetings happen in Virtual Office spaces, but nothing they decide is kept in
the product: there is no way to write notes, track who owes what, or find a
past decision. The database already has `meeting_notes` and
`meeting_note_action_items` tables and an unused repository, but users have no
write path and no UI. The dashboard shows an "AI Meeting Notes" card that leads
nowhere. Teams lose decisions and follow-ups, and the product cannot show its
AI meeting-notes promise to investors.

## 3. Goals and success metrics

### Goals

- G1: Members can use meeting notes in real daily work, at production quality.
- G2: The transcript-to-draft AI flow is polished enough to demonstrate to investors.
- G3: Each company uses and pays for AI with its own provider key; the platform never holds subscription credentials.

### Success metrics

- SM-1: A one-hour transcript (≤1 MB) produces a reviewable draft within 60 seconds with the configured real provider.
- SM-2: Search returns the first page within 1 second with 1,000 notes in the company.
- SM-3: Zero notes, versions, action items, transcripts, or AI settings of another company are ever visible or modifiable.

## 4. Users and stakeholders

### Primary users

- Company member: creates notes, edits notes they authored or participate in, completes action items assigned to them, uploads transcripts, searches, exports.
- Company admin (`role = admin`): everything a member can do, plus edits and deletes any note of the company and configures the company's AI provider, key, model, reasoning level, and daily limit.

### Secondary users

- Participant: a member listed on a note; may edit it.
- Assignee: a member assigned an action item; may mark it complete.

### Stakeholders

- Product owner (Giuliano): runs acceptance against the online database; demonstrates the feature to investors.

## 5. Scope

### In scope

- Notes per space: create, view, edit, delete; rich-text content; participants.
- Version history with view and restore; concurrent-edit conflict detection.
- Action items with assignee, due date, and completion.
- Transcript upload (.txt, .vtt, .srt), AI draft summary and suggested action items, review-before-save, reprocess.
- Company AI settings (admin): provider among Anthropic, OpenAI, Kimi, GLM; API key; model and reasoning level; daily limit.
- Full-text search with space and period filters.
- Markdown (.md) export of a note.
- "Notes" tab in the space detail and a "Meetings" page; the dashboard "AI Meeting Notes" card links to the Meetings page.
- Notes survive deletion of their space.

### Out of scope

- MEET-08 assignment notifications and due-date reminders (moved to Phase 7, Announcements, which builds the shared notification center and scheduler).
- Sign-in with a ChatGPT/Codex or Claude subscription (Anthropic prohibits it for third-party apps; OpenAI's "Sign in with ChatGPT" is a partner-only preview). Future item, contingent on OpenAI granting access.
- PDF export, note templates, calendar integration, sharing notes outside the company.
- Automatic recording or transcription of in-app audio calls.
- Real-time collaborative editing.
- Background AI processing that survives leaving the page.
- Semantic (embedding) search; searching inside transcript text.
- Per-user model choice (admin-only setting).

## 6. User journeys

- J1 Manual note: member opens a space's Notes tab → "New note" → enters title, date, participants, content → saves → note appears in the tab and on the Meetings page.
- J2 Action items: an editor adds items with description, optional assignee and due date; the assignee or an editor marks an item complete.
- J3 Revise: an editor edits and saves; a new version is recorded. If someone saved in between, the editor sees a conflict warning and the newer content before deciding.
- J4 History: a viewer opens the version list (author, time), opens an old version; an editor restores it, creating a new version.
- J5 AI from transcript: member chooses "New note from transcript" (or "Attach transcript" on an existing note) → selects a file → sees the notice naming the AI provider → starts processing → reviews and edits the draft summary and each suggested action item (accept, edit, reassign, reject) → saves.
- J6 Reprocess: an editor reprocesses the stored transcript, obtaining a new draft to review; the current summary changes only when the new draft is saved.
- J7 Admin setup: admin opens company settings → AI → selects provider, enters API key, selects model and reasoning level, sets daily limit → saves; the key is then shown only masked.
- J8 Search: member opens Meetings → types words, optionally filters by space and period → sees ranked results with matched excerpts → opens a note.
- J9 Export: viewer clicks "Export Markdown", optionally ticks "Include transcript", and downloads a .md file.
- J10 Delete: author or admin deletes a note after confirmation.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | A member creates a note in any space of their company with title (required, ≤200 chars), meeting date (required), participants (0–50 active company members chosen in a picker), and rich-text content (≤100,000 chars). | Must | AC-001, AC-002 |
| FR-002 | The rich-text editor supports bold, italic, headings, bulleted and numbered lists, checklists, and links; stored and rendered content is sanitized so no script or unsafe URL runs. | Must | AC-003 |
| FR-003 | The space detail has a "Notes" tab listing that space's notes, newest meeting date first. | Must | AC-001 |
| FR-004 | A "Meetings" page lists all notes of the company with search and filters; the dashboard "AI Meeting Notes" card links to it. | Must | AC-014, AC-015 |
| FR-005 | A note view shows title, date, space (or "Space removed"), participants, content, summary, action items, the stored transcript, and access to version history and export. | Must | AC-001, AC-019 |
| FR-006 | The author, current participants, and admins can edit a note; others cannot. | Must | AC-004 |
| FR-007 | Saving a note that changed since the editor loaded it is rejected with a conflict warning showing the newer version; nothing is overwritten silently. | Must | AC-005 |
| FR-008 | Every successful save creates an immutable version of title, meeting date, participants, content, and summary, recording who saved and when. | Must | AC-006 |
| FR-009 | Any viewer can list versions and open an old one; an editor can restore it, which creates a new version; action items are not changed by restore. | Must | AC-006 |
| FR-010 | The author or an admin can delete a note after confirmation; deletion permanently removes the note, its versions, action items, and transcript. | Must | AC-007 |
| FR-011 | Note editors create, edit, and delete action items (description required; one optional assignee who is an active company member; optional due date without time); editors and the assignee can toggle completion; at most 100 items per note. | Must | AC-008, AC-009 |
| FR-012 | A member uploads a .txt, .vtt, or .srt transcript of at most 1 MB, either to create a new note or to attach to an existing note they can edit; a note holds one transcript and a new upload replaces it. | Must | AC-010 |
| FR-013 | Empty, oversized, wrong-extension, or unreadable (non-text) files are rejected before any AI call with a clear message; nothing is saved and nothing counts toward the daily limit. | Must | AC-011 |
| FR-014 | .vtt and .srt cue numbers and timestamps are removed before processing; speaker names are kept. | Must | AC-012 |
| FR-015 | Before processing, the user sees a notice naming the provider that will receive the transcript text. | Must | AC-010 |
| FR-016 | The server sends the transcript to the company's configured provider and returns a draft containing a summary (key points, decisions, next steps) in the transcript's language and suggested action items with suggested assignees. | Must | AC-010 |
| FR-017 | A suggested assignee is linked only when it matches exactly one active company member; otherwise the item is unassigned. | Must | AC-013 |
| FR-018 | Nothing from the AI is stored until the user saves the reviewed draft; the user can edit the summary and accept, edit, reassign, or reject each suggested item. Saving stores the summary, accepted items, and transcript text and creates a version. | Must | AC-010 |
| FR-019 | An editor can reprocess the stored transcript; the result is a new draft for review, and the current summary changes only on save. | Must | AC-010 |
| FR-020 | If the provider fails, times out, refuses, or rejects the key, the note and transcript remain saved, the user sees an error with "Try again", and the attempt does not count toward the limit. | Must | AC-016 |
| FR-021 | Leaving the page during processing discards the draft and the attempt does not count toward the limit. | Must | AC-016 |
| FR-022 | An admin configures provider (Anthropic, OpenAI, Kimi, GLM), API key, model and reasoning level from a curated list per provider, and a daily limit (1–200, default 20). After saving, the key is shown only masked and is never returned to any browser. | Must | AC-017 |
| FR-023 | Without a configured provider, manual notes work normally; AI controls are disabled with "An admin needs to configure AI"; admins also see a link to the settings. | Must | AC-018 |
| FR-024 | The company's successful AI drafts are counted per day; when the limit is reached, processing is refused with a message stating the limit and when it resets. | Must | AC-016 |
| FR-025 | Search matches words in title, content, summary, and action-item descriptions, ignoring accents and case, in Portuguese and English text, only within the caller's company; filters by space and meeting-date period; orders by relevance then meeting date; paginates; shows matched excerpts. | Must | AC-014 |
| FR-026 | Export downloads a .md file with title, date, space, participants, content converted to Markdown, summary, and action items (assignee, due date, status); the transcript is included only when "Include transcript" is ticked. | Must | AC-019 |
| FR-027 | Deleting a space keeps its notes; they show "Space removed" and remain on the Meetings page and in search. | Must | AC-020 |
| FR-028 | A participant or assignee who left the company is shown as "Former member", keeps their place on the note, and loses all access. | Must | AC-021 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | All members of a company can view all of its notes, versions, action items, and transcripts; nobody outside the company can. | Notes are company memory (r1 q4). |
| BR-002 | Any member can create a note in any space of their company, including private spaces. | Notes can be written after the meeting (r2 q11). |
| BR-003 | Edit rights: author, current participants, company admins. Delete rights: author, company admins. | r1 q5, r2 q11. |
| BR-004 | Action items: note editors create/edit/delete; editors and the assignee toggle completion. | The assignee closes their own work (r2 q8). |
| BR-005 | Participants and assignees must be active members of the note's company. | Prevents cross-company references. |
| BR-006 | AI suggestions never become assignments or stored content without explicit user confirmation. | Avoids wrong attributions (r1 q12). |
| BR-007 | Each save creates one immutable version; restore creates a new version; action items are current-state only. | r1 q8, r2 q10. |
| BR-008 | The daily limit applies to every company, counts only successful drafts (including reprocessing), and is adjustable by admins from 1 to 200. | Cost and abuse protection (r1 q11, r2 q4). |
| BR-009 | Only admins configure AI; the API key is write-only from the browser's perspective and is stored encrypted on the server. | r2 q1, q3. |
| BR-010 | One transcript per note; a new upload replaces the stored text; the stored transcript is visible to every note viewer. | r1 q13, r2 q12. |
| BR-011 | A save based on an outdated version is rejected. | No silent overwrite (r1 q18). |
| BR-012 | AI access uses API keys only; no subscription credentials are requested, stored, or proxied. | Anthropic policy; OpenAI sign-in not available (r3). |

## 9. Data and integrations

### Data inputs

- Note fields, participants, rich-text content, action items, transcript files (.txt/.vtt/.srt, UTF-8 text, ≤1 MB).
- Admin AI settings: provider, API key, model, reasoning level, daily limit.

### Data outputs

- Stored notes, versions, action items, transcripts, AI settings (key encrypted).
- AI drafts (transient until saved).
- Search results with excerpts; downloaded .md files.

### Integrations

- Anthropic Messages API (official SDK), OpenAI API (official SDK), Kimi (Moonshot) and GLM (Zhipu/Z.ai) through their OpenAI-compatible endpoints. All calls are server-side from authenticated API routes.
- Supabase Postgres (RLS, full-text search), Supabase Auth.
- The existing `meeting_notes` and `meeting_note_action_items` tables and `IMeetingNoteRepository` are reused and extended (for example, `summary` becomes optional for manual notes, and `room_id` no longer cascades on space deletion).

## 10. Constraints and assumptions

### Constraints

- Next.js App Router, TypeScript strict, Supabase Postgres/Auth/RLS, TanStack Query, shadcn/ui, following AGENTS.md (server client in routes, `auth.getUser()`, `users.id` vs `users.supabase_uid`, roles `admin|member`).
- API keys never reach client code, logs, error messages, or reports; transcript text is not logged.
- AI calls only from the server; the browser never calls a provider.
- Size limits: title ≤200 chars; content ≤100,000 chars; ≤50 participants; ≤100 action items per note; transcript ≤1 MB.
- UI in the app's current language (English); AI summary in the transcript's language.
- Migrations are written and applied locally during the phase; they are applied to the online database `vhabpcoyypobgasacsko` only at phase end with the owner's explicit authorization; rollout order is migrations then app, rollback is app first.
- Only integration and E2E tests (no unit tests); one test process at a time; one final Chrome-only E2E run.

### Assumptions

- The owner creates an OpenAI platform API key (billed separately from ChatGPT Plus/Pro) for the final test against the real provider (confirmed r3).
- Automated tests use a local fake AI server compatible with the provider APIs (confirmed r2 q17).

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Two editors save the same note concurrently | The later save is rejected with a conflict warning showing the newer version (FR-007). |
| Empty / >1 MB / wrong extension / binary file | Rejected before AI, clear message, nothing saved, not counted (FR-013). |
| .vtt/.srt with cue numbers and timestamps | Stripped; speaker names kept (FR-014). |
| Provider error, timeout, refusal, invalid key | Note and transcript stay saved; error + "Try again"; not counted (FR-020). |
| User leaves the page while processing | Draft discarded; not counted (FR-021). |
| AI suggests a name matching no member or several members | Item left unassigned for the user to choose (FR-017). |
| Daily limit reached | Processing refused with limit and reset time (FR-024). |
| No AI configured | Manual notes work; AI disabled with message; admin sees settings link (FR-023). |
| Space deleted | Notes kept, labelled "Space removed" (FR-027). |
| Participant/assignee leaves the company | Shown as "Former member"; no access (FR-028). |
| Assignee is not a note editor | Can toggle completion of their item only (BR-004). |
| Restore of an old version | New version created; action items unchanged (FR-009). |
| Transcript contains instructions aimed at the AI | Treated as data; output limited to the draft fields; suggested assignees resolved only against the company member list. |
| Pasted content with scripts or `javascript:` links | Removed by sanitization (FR-002). |
| Member of company A requests a note, version, item, search, or setting of company B | Not found / denied (BR-001, SM-3). |
| Non-admin calls the AI settings route | Denied (BR-009). |

## 12. Security, privacy, compliance, and abuse considerations

- RLS on every new or changed table, comparing `users.supabase_uid` with `auth.uid()::text` and scoping by company; API routes resolve the application user by `supabase_uid`.
- API keys stored encrypted at rest, readable only by server code, never returned (only a mask), never logged.
- Rich text sanitized on write and render; Markdown export escapes content so it cannot inject HTML when rendered elsewhere.
- Transcript text is sent to a third-party provider only after the notice naming that provider; the admin's provider choice (including providers hosted outside Brazil/US) is the company's decision.
- Prompt-injection resistance: transcript is passed as data; output parsed against a fixed schema; any field outside the schema is discarded.
- Abuse: daily limit per company; size limits; server-side validation of every limit.
- Subscription credentials (Claude, ChatGPT) are never requested or stored.

## 13. Accessibility, localization, and usability considerations

- Editor, version list, review step, and dialogs are keyboard-operable with visible focus and labelled controls (Radix/shadcn primitives).
- Clear progress state while processing; errors state what happened and what to do.
- UI strings in English, matching the app; summary language follows the transcript.
- Interactive elements inside clickable cards follow the AGENTS.md interaction rules.

## 14. Acceptance criteria

- AC-001 (FR-001, FR-003, FR-005, BR-002): Given a member of company A, when they create a note in a space with title, date, two participants, and formatted content, then it appears first in that space's Notes tab and opens showing all fields.
- AC-002 (FR-001, BR-005): Given a title of 201 chars, content above 100,000 chars, 51 participants, or a participant from another company, when saving, then the save is rejected with a message and nothing is stored.
- AC-003 (FR-002): Given content containing a script tag and a `javascript:` link, when saved and viewed, then no script runs and the link is removed or neutralized.
- AC-004 (FR-006, BR-003): Given a note authored by user X with participant Y, when Y and an admin edit it, then both saves succeed; when a non-participant member Z tries to edit (UI or direct API call), then it is denied and Z sees no edit control.
- AC-005 (FR-007, BR-011): Given two sessions open the same note version, when both save different content, then the first succeeds and the second gets a conflict warning showing the first's content, and the first's content is not overwritten.
- AC-006 (FR-008, FR-009, BR-007): Given a note saved three times, when a viewer opens history, then three versions show author and time; when an editor restores version 1, then a fourth version equals version 1's fields and the action items are unchanged.
- AC-007 (FR-010, BR-003): Given a note with versions, items, and a transcript, when the author confirms delete, then the note, versions, items, and transcript are gone; when a participant who is not the author or an admin tries to delete, then it is denied.
- AC-008 (FR-011, BR-004): Given a note editor, when they add an item with description, assignee, and due date, then it is shown; when the assignee (not an editor) toggles completion, then it succeeds; when the assignee tries to edit the description or delete, then it is denied.
- AC-009 (FR-011): Given a note with 100 items, when adding a 101st or an item with an empty description, then it is rejected.
- AC-010 (FR-012, FR-015, FR-016, FR-018, FR-019, BR-006, BR-010): Given a configured provider (fake AI server in automated tests), when a member uploads a valid .txt to create a note, then a notice names the provider, a draft with summary and suggested items appears, and nothing is stored until save; after editing the summary, rejecting one item and accepting another, saving stores exactly the edited summary, the accepted item, and the transcript; reprocessing returns a new draft and leaves the stored summary unchanged until saved; attaching a transcript to an existing note replaces the previous one.
- AC-011 (FR-013): Given an empty file, a 1.1 MB file, a .pdf renamed .txt, or a .docx, when uploading, then each is rejected with a message, no AI call is made, nothing is stored, and the daily count is unchanged.
- AC-012 (FR-014): Given a .vtt and a .srt with cue numbers, timestamps, and speaker names, when processed, then the text sent to the provider contains no cue numbers or timestamps and keeps the speaker names.
- AC-013 (FR-017, BR-006): Given a draft suggesting "Ana" when one active member is Ana, "Bruno" when two members match, and "Carla" when none does, then Ana is pre-linked and Bruno's and Carla's items are unassigned.
- AC-014 (FR-004, FR-025, BR-001, SM-2, SM-3): Given 1,000 notes in company A and notes in company B containing the same words, when a member of A searches an accented word without the accent, with space and period filters, then only matching notes of A within the filters are returned, ranked, with excerpts, and the first page returns within 1 second locally; company B's notes never appear.
- AC-015 (FR-004): Given the dashboard, when the member clicks "AI Meeting Notes", then the Meetings page opens.
- AC-016 (FR-020, FR-021, FR-024, BR-008): Given the provider returns an error, times out, refuses, or rejects the key, then the note and transcript stay saved, an error with "Try again" appears, and the daily count is unchanged; given the user navigates away mid-processing, then no draft is stored and the count is unchanged; given the company reached its limit, then processing is refused with the limit and reset time.
- AC-017 (FR-022, BR-009): Given an admin, when they save provider, key, model, reasoning level, and limit 50, then the settings persist, the key is shown only masked, and no API response or page ever contains the key; given a member, when calling the settings route, then it is denied; given limit 0 or 201, then it is rejected.
- AC-018 (FR-023): Given no provider configured, when a member opens a note, then manual editing works and AI controls are disabled with "An admin needs to configure AI"; an admin additionally sees a link to settings.
- AC-019 (FR-005, FR-026): Given a note with formatted content, summary, items, and transcript, when exported without the option, then the .md contains title, date, space, participants, Markdown content, summary, and items but no transcript; with the option ticked, the transcript is included.
- AC-020 (FR-027): Given a space with notes, when the space is deleted, then its notes remain on the Meetings page and in search, labelled "Space removed".
- AC-021 (FR-028): Given a participant and assignee who leaves the company, then the note shows them as "Former member" and they can no longer read the note.
- AC-022 (SM-1, BR-012): Given the owner's real OpenAI API key configured on the deployed or locally run app against the online database, when processing a one-hour fictional transcript, then a draft appears within 60 seconds; at no point is a subscription login requested.
- AC-023 (SM-3, BR-001, BR-009): Given two companies, when a member of each attempts direct API and database access to the other's notes, versions, items, transcripts, search, and AI settings, then every attempt returns nothing or is denied.

## 15. Test strategy

- Levels: integration and E2E only (AGENTS.md). No unit tests; no mocking of Supabase, repositories, or the code under test.
- Integration (Vitest against local Supabase): RLS and route authorization per role and company (AC-004, AC-007, AC-008, AC-017, AC-021, AC-023); validation limits (AC-002, AC-009, AC-011); version creation and conflict (AC-005, AC-006); transcript normalization (AC-012); assignee matching (AC-013); limit counting and failure non-counting (AC-016); search correctness, isolation, and timing with 1,000 seeded notes (AC-014); space deletion (AC-020); key never returned (AC-017).
- External AI provider: replaced in automated tests only, by a local fake server speaking the provider APIs, selected by environment configuration, with fixed responses and scripted failures (error, timeout, refusal, invalid key). Database, RLS, routes, and UI stay real.
- E2E (Playwright, two accounts): manual note lifecycle, editing rights, conflict, history/restore, action items with assignee completion, transcript → review → save, AI-disabled state, admin settings, search, export download, sanitization (AC-001, AC-003–AC-008, AC-010, AC-015, AC-018, AC-019).
- Test data: fictional transcripts in .txt/.vtt/.srt, Portuguese and English, including speaker names, accents, and malformed files. No real personal data.
- Cadence: per task type-check + lint; per block type-check, lint, DB integration suite when server code changed; one final Chrome-only E2E run of all new specs plus the full regression suite, zero retries; one test process at a time.
- Owner test: AC-022 with a real provider key against the online database after the migrations are applied.

## 16. Validation and launch checklist

- All Must FRs and AC-001..AC-023 have evidence in TRACK.
- Adversarial reviews passed at SPEC, PLAN, each block, and final.
- Type-check, lint, build, DB integration suite, final E2E run green.
- Migrations listed with state: written locally, applied locally, applied to `vhabpcoyypobgasacsko` (after authorization, catalog read back, smoke check), app deployed.
- ROADMAP updated: Phase 6 status; MEET-08 moved to Phase 7.
- Owner acceptance test (AC-022) passed.

## 17. Open questions

Non-blocking, resolved during planning:

- Exact curated model and reasoning-level list per provider.
- Rich-text editor library and stored format.
- Key encryption mechanism (for example, Supabase Vault or application-level encryption with a server-only secret).
- Day boundary for the daily limit (default proposal: UTC calendar day, shown to the user in local time).
