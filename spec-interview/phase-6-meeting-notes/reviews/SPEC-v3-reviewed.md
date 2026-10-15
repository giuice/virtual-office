# SPEC: Phase 6 — Meeting Notes

Goal: Company members can record, revise, search, and export meeting notes per space — with action items, version history, and an AI-generated draft summary and action items from an uploaded transcript using the company's own AI provider key.

Version: v3 (2026-10-12) — revised after adversarial reviews r1 and r2 (`reviews/sol-review-spec-r1.md`, `reviews/sol-review-spec-r2.md`) and owner round 4.

## 1. Summary

Virtual Office gains a meeting-notes capability. A member writes a note for a
space (title, meeting date, participants, rich-text content), tracks action
items, and can revise, restore, delete, search, and export notes. A member can
upload a meeting transcript (.txt, .vtt, .srt); the server sends it to the AI
provider configured by the company admin (Anthropic Claude, OpenAI, Kimi, or
GLM, using the company's own API key) and returns a draft summary and
suggested action items that the member reviews before they are applied.
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

- SM-1: For the fixture "one-hour meeting" transcript (fictional, ~9,000–10,000 words, ≤1 MB), the time from clicking "Process" to the draft being displayed is ≤60 seconds with the owner's OpenAI configuration (the model and reasoning level the admin selects for the demo), measured in the owner's acceptance test (AC-022). Other providers are verified functionally, not for latency.
- SM-2: With 1,000 notes in a company, the first page of search results is returned by the search route within 1 second on the local development stack (AC-014). Production latency is not claimed.
- SM-3: Zero notes, versions, action items, transcripts, AI settings, AI keys, or usage of another company are ever visible or modifiable (AC-023).

## 4. Users and stakeholders

### Primary users

- Company member: creates notes, edits notes they authored or participate in, completes action items assigned to them, uploads transcripts, searches, exports.
- Company admin (`users.role = 'admin'`): everything a member can do, plus edits and deletes any note of the company and configures the company's AI provider, key, model, reasoning level, and daily limit.

### Secondary users

- Participant: a current company member listed on a note; may edit it.
- Assignee: a current company member assigned an action item; may toggle its completion.

### Stakeholders

- Product owner (Giuliano): runs acceptance against the online database; demonstrates the feature to investors.

## 5. Scope

### In scope

- Notes per space: create, view, edit, delete; rich-text content; participants.
- Version history with view and restore; concurrent-edit conflict detection.
- Action items with assignee, date-only due date, and completion.
- Transcript upload (.txt, .vtt, .srt), AI draft summary and suggested action items, review-before-apply, reprocess.
- Company AI settings (admin): provider among Anthropic, OpenAI, Kimi, GLM; API key; model and reasoning level from a curated list; daily limit.
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
- Background AI processing whose draft survives leaving the page.
- Semantic (embedding) search; searching inside transcript text.
- Per-user model choice (admin-only setting).
- Chunking or splitting a transcript that exceeds the configured model's context.

## 6. User journeys

- J1 Manual note: member opens a space's Notes tab → "New note" → enters title, date, participants, content → saves → note appears in the tab and on the Meetings page.
- J2 Action items: an editor adds items with description, optional assignee and due date; the assignee or an editor marks an item complete.
- J3 Revise: an editor edits and saves; a new version is recorded. If someone changed the note in between, the editor sees a conflict warning and the newer content before deciding.
- J4 History: a viewer opens the version list (who, when), opens an old version; an editor restores it, creating a new version.
- J5 AI from transcript: member chooses "New note from transcript" in a space → selects a file → the note is created immediately (title = file name, date = today, editable) with the transcript stored → member sees the notice naming the AI provider → starts processing → reviews and edits the draft summary and each suggested action item (accept, edit, reassign, reject) → applies the draft.
- J6 Attach / reprocess: an editor attaches a transcript to an existing note (replacing any stored transcript immediately) or reprocesses the stored transcript, obtaining a new draft; the note's summary and items change only when that draft is applied.
- J7 Admin setup: admin opens company settings → AI → selects provider, enters API key, selects model and reasoning level, sets daily limit → saves; the key is afterwards shown only masked.
- J8 Search: member opens Meetings → types words, optionally filters by space and period → sees ranked results with matched excerpts → opens a note.
- J9 Export: viewer clicks "Export Markdown", optionally ticks "Include transcript", and downloads a .md file.
- J10 Delete: author or admin deletes a note after confirmation.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | A member creates a note in any space of their company, including private spaces, with title (required, 1–200 chars), meeting date (required), participants (0–50, chosen from current company members), and rich-text content (≤100,000 chars). | Must | AC-001, AC-002 |
| FR-002 | The rich-text editor supports bold, italic, headings, bulleted and numbered lists, checklists, and links; content is sanitized on write and on render so no script, event handler, or unsafe URL runs. | Must | AC-003 |
| FR-003 | The space detail has a "Notes" tab listing that space's notes, ordered by meeting date, newest first. | Must | AC-001 |
| FR-004 | A "Meetings" page lists all notes of the company with search and filters; the dashboard "AI Meeting Notes" card links to it. | Must | AC-014, AC-015 |
| FR-005 | A note view shows title, meeting date, space (or "Space removed"), author, participants, rendered content, summary, action items, the stored transcript, and access to version history and export. | Must | AC-001, AC-019 |
| FR-006 | The author, current participants, and admins of the note's company can edit a note (fields, participants, transcript, AI draft application, restore); others cannot, at both the API and the database boundary. | Must | AC-004 |
| FR-007 | Each note carries a revision. Any change to note fields, participants, summary, or transcript, including restore and draft application, is accepted only against the current revision; a stale change is rejected with a conflict warning showing the newer state; nothing is overwritten silently. | Must | AC-005 |
| FR-008 | Every accepted change to title, meeting date, participants, content, or summary (including restore and draft application) creates one immutable version recording who and when. | Must | AC-006 |
| FR-009 | Any viewer lists versions and opens an old one; an editor restores it, which creates a new version with that version's title, date, participants, content, and summary. Restore does not change action items or the stored transcript. | Must | AC-006 |
| FR-010 | The author or an admin deletes a note after confirmation; deletion permanently removes the note, its versions, participants, action items, and transcript. | Must | AC-007 |
| FR-011 | Note editors create, edit, and delete action items (description required, 1–1,000 chars; one optional assignee chosen from current company members; optional date-only due date); editors and the current assignee toggle completion; an assignee who is not an editor can change nothing but completion; at most 100 items per note. | Must | AC-008, AC-009 |
| FR-012 | A member uploads a .txt, .vtt, or .srt transcript of at most 1 MB. "New note from transcript" creates the note at upload (title = file name without extension, truncated to 200 chars; date = today; editable) with the transcript stored. "Attach transcript" (editors only) replaces the stored transcript immediately. A note holds one transcript. | Must | AC-010, AC-024 |
| FR-013 | Empty, oversized, wrong-extension, or non-UTF-8/binary files are rejected before any note change or AI call with a clear message; nothing is stored and usage is unchanged. | Must | AC-011 |
| FR-014 | .vtt and .srt cue numbers, timestamps, and cue settings are removed before processing; speaker names and spoken text are kept. | Must | AC-012 |
| FR-015 | Before processing, the user sees a notice naming the provider that will receive the transcript text. The start request carries the AI-settings revision the notice was shown for; if the settings changed, processing is refused and the new notice is shown. | Must | AC-010, AC-025 |
| FR-016 | The server sends only the normalized transcript (no member roster) to the provider configuration snapshotted at admission (provider, key, model, reasoning level), with no fallback to another provider and no automatic SDK/transport retries, and returns a draft containing a summary (key points, decisions, next steps) in the transcript's language and up to 100 suggested action items with assignee names as written in the transcript. | Must | AC-010, AC-026, AC-029 |
| FR-017 | Suggested assignee names are resolved locally against current company members: an item is pre-linked only when the name matches exactly one current member by full display name or, failing that, by a first name unique among current members (case- and accent-insensitive); otherwise it is unassigned. | Must | AC-013 |
| FR-018 | The draft is transient and carries its source: the note revision and stored-transcript identity at generation start. The user edits the summary and accepts, edits, reassigns, or rejects each suggested item; "Apply" is accepted only if the note is still at that source revision (otherwise conflict, FR-007), rechecks the caller's rights inside the transaction, and atomically writes the summary, appends the accepted items, and creates one version, or changes nothing. Suggestions whose description matches an existing item of the note (case- and accent-insensitive) arrive unchecked and marked "already exists"; existing items are never modified or removed by a draft; Apply is refused if the resulting total exceeds 100 items. | Must | AC-010, AC-027, AC-030 |
| FR-019 | An editor can reprocess the stored transcript; the result is a new draft under FR-018; the summary and items change only on Apply. | Must | AC-027 |
| FR-020 | Before dispatch, the server estimates the input size against the configured model's context and output budget; a transcript that does not fit is refused with a message naming the limit and suggesting a smaller file or a larger-context model; not counted. | Must | AC-026 |
| FR-021 | If processing fails (provider error, timeout, refusal, malformed or truncated output, invalid key), the note and transcript remain as they were, the user sees what happened with "Try again", and no draft is applied. Leaving the page cancels the browser request; the server makes a best-effort abort of the outbound provider request and discards the draft; counting follows FR-022 regardless of whether the abort succeeds. Before returning a draft, the server rechecks that the caller is still a member of the note's company and the note still exists; otherwise the draft is discarded. | Must | AC-016, AC-030 |
| FR-022 | Usage: each provider dispatch counts toward the company's daily limit, whether it succeeds, times out, returns unusable output, or the user leaves. A dispatch is refunded only when the provider's documented protocol signals rejection before processing — an HTTP authentication/permission error, or a rate-limit/overload/unavailable HTTP error status returned before any response body or stream event — as defined per adapter in the capability matrix; every other or ambiguous outcome stays counted. Not counted at all: files rejected by FR-013, inputs refused by FR-020, failures before dispatch. Admission atomically reserves one unit against the limit before dispatch; concurrent requests cannot exceed the limit; each reservation covers exactly one dispatch and settles at most once against the day of its admission; a reservation without a recorded outcome (server crash) stays counted; only server code settles reservations — no client role can classify, refund, or alter usage. | Must | AC-016, AC-028, AC-029 |
| FR-023 | When the company's count for the current day (midnight to midnight, America/Sao_Paulo) has reached its limit, processing is refused with a message stating the limit and the reset time. | Must | AC-016 |
| FR-024 | An admin configures provider (Anthropic, OpenAI, Kimi, GLM), API key, model and reasoning level from a curated per-provider list whose parameters are valid for that provider, and a daily limit (1–200; default 20 for a company that never set it). Each save increments the settings revision. The key can be entered or replaced, never read back: every response, page, error, log, and Realtime payload exposes at most provider, model, reasoning level, limit, last four key characters, and who/when updated. | Must | AC-017 |
| FR-025 | Without a configured provider, manual notes work normally; AI controls are disabled with "An admin needs to configure AI"; admins also see a link to the settings. | Must | AC-018 |
| FR-026 | Search matches words in title, content, summary, and action-item descriptions, ignoring accents and case, in Portuguese and English text, only within the caller's company; filters by space and meeting-date period; orders by relevance then meeting date (newest first); paginates; shows matched excerpts. | Must | AC-014 |
| FR-027 | Export downloads a .md file with title, meeting date, space, author, participants, content converted to Markdown, summary, and action items (assignee, due date, status); the transcript is included only when "Include transcript" is ticked; user text is escaped so it cannot inject raw HTML. | Must | AC-019 |
| FR-028 | Deleting a space keeps its notes; they show "Space removed" and remain on the Meetings page, in search, and editable under the same rules. Deleting a company deletes its notes. | Must | AC-020 |
| FR-029 | Each note has an immutable company and an immutable author (application `users.id` plus a display-name snapshot), set by the server from the creating user at creation. Versions record their editor the same way. Deleting a user keeps the notes, versions, and name snapshots (the live reference becomes empty); it never blocks the deletion or deletes company notes. | Must | AC-020, AC-023, AC-031 |
| FR-030 | Participants and assignees are stored by application `users.id` with a display-name snapshot. A person who is no longer a member of the note's company (company changed, removed, or user deleted) is shown as "Former member" (with the snapshot name), keeps their place in the note and its versions, and has no access. If the same `users.id` becomes a member of the same company again, their author/participant/assignee rights return. New selections accept current members only; saving or restoring may retain former members already present. | Must | AC-021 |
| FR-031 | Every processing start carries an idempotency key scoped to the authenticated application user, company, and operation, and bound to the note id, source note revision, transcript identity, and settings revision. A replay with the same key and binding returns the same pending or final result without a new dispatch (after re-authorizing the caller); a replay with a different binding is rejected; keys are kept for at least 48 hours, across midnight, so a delayed replay never counts again. "Try again" after a failure is a new operation with a new key and a new admission. | Must | AC-028 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | Membership means the user's current `users.company_id` equals the note's company. All members can view all of their company's notes, versions, participants, action items, and transcripts; nobody else can. | Notes are company memory (r1 q4). |
| BR-002 | Any member can create a note in any space of their company, including private spaces. | r2 q11. |
| BR-003 | Edit rights: the author (while a member), current participants who are members, and company admins. Delete rights: the author (while a member) and company admins. Rights are evaluated on the state before the change, at the API and at the database. | r1 q5, r2 q11; prevents self-grant. |
| BR-004 | Editors may change the participant list, which changes who can edit; a viewer cannot add themselves; restore restores the version's participants under the same pre-change authorization. | Participants are versioned (r2 q10). |
| BR-005 | Action items: editors create, edit, delete; editors and the current assignee toggle completion; nobody changes an item's note, creator, or creation time. | r2 q8. |
| BR-006 | AI suggestions never become content or assignments without explicit user Apply. | r1 q12. |
| BR-007 | Each accepted change creates one immutable version; restore creates a new version; action items and transcript are current-state only. | r1 q8, r2 q10. |
| BR-008 | The daily limit applies to every company, counts dispatched processings as in FR-022 (reprocessing included), defaults to 20, is adjustable by admins from 1 to 200, and resets at midnight America/Sao_Paulo. | r1 q11, r2 q4, r4. |
| BR-009 | Only admins configure AI. The API key is stored encrypted at rest in storage that no browser session can select, subscribe to, or decrypt; it is never stored in `companies.settings` or any client-readable table. | r2 q1, q3; review M6. |
| BR-010 | One transcript per note; a new upload replaces it immediately; the stored transcript is visible to every viewer of the note. | r1 q13, r2 q12, r4. |
| BR-011 | A change based on an outdated note revision is rejected. | r1 q18. |
| BR-012 | AI access uses API keys only; no subscription credentials are requested, stored, or proxied. | Anthropic policy; r3. |
| BR-013 | A processing uses the settings snapshot taken at admission; settings changes affect only later admissions; no silent fallback between providers. | Privacy notice fidelity; review H4. |

## 9. Data and integrations

### Data inputs

- Note fields, participants, rich-text content, action items, transcript files (.txt/.vtt/.srt, UTF-8 text, ≤1 MB).
- Admin AI settings: provider, API key, model, reasoning level, daily limit.

### Data outputs

- Stored notes, versions, participants, action items, transcripts, AI settings metadata, encrypted keys, usage records.
- AI drafts (transient until applied).
- Search results with excerpts; downloaded .md files.

### Integrations

- Anthropic Messages API (official SDK), OpenAI API (official SDK), Kimi (Moonshot) and GLM (Zhipu/Z.ai) through their OpenAI-compatible endpoints; each adapter sends only parameters valid for its provider and model (curated capability matrix). All calls are server-side from authenticated API routes.
- Supabase Postgres (RLS, full-text search), Supabase Auth.

### Database contracts (migrations required; local first)

- `meeting_notes`: add immutable `company_id`, `created_by` (application `users.id`, ON DELETE SET NULL) with an author name snapshot, a revision column, content storage, and search vector; make `summary` optional; make `room_id` nullable with ON DELETE SET NULL; `company_id` → companies ON DELETE CASCADE.
- New structures: note versions (immutable, editor id ON DELETE SET NULL + editor name snapshot), note participants (with name snapshot), AI settings (metadata, revision), encrypted key storage (no client grants), daily usage reservations/records with idempotency keys.
- `meeting_note_action_items`: date-only due date (`date`), assignee name snapshot, per-item revision, completion-only path for assignees.
- RLS and grants for every table, with writes through authorized routes/RPCs; indexes for search (accent-insensitive Portuguese/English) and for list ordering.
- Legacy rows: before applying online, a read-only preflight on `vhabpcoyypobgasacsko` counts existing `meeting_notes`/items; if any exist, the owner decides their company/author backfill before the migration is applied.
- Rollback: application first; database rollback must not restore the cascade that deletes notes with their space.
- The existing `IMeetingNoteRepository`, `SupabaseMeetingNoteRepository`, and `MeetingNote`/`ActionItem` types are reused and extended (no runtime caller exists today).

## 10. Constraints and assumptions

### Constraints

- Next.js App Router, TypeScript strict, Supabase Postgres/Auth/RLS, TanStack Query, shadcn/ui, following AGENTS.md (server client in routes, `auth.getUser()`, `users.id` vs `users.supabase_uid`, roles `admin|member`).
- API keys and transcript text never appear in client code, logs, error messages, analytics, or reports; provider errors are mapped to sanitized messages.
- AI calls only from the server; the browser never calls a provider.
- Size limits: title ≤200 chars; content ≤100,000 chars; ≤50 participants; ≤100 action items per note; item description ≤1,000 chars; transcript ≤1 MB.
- UI in the app's current language (English); AI summary in the transcript's language.
- Migrations are written and applied locally during the phase; applied to the online database `vhabpcoyypobgasacsko` only at phase end with the owner's explicit authorization, after the read-only preflight, followed by catalog readback and a runtime smoke check. Rollout: migrations, then app.
- Only integration and E2E tests (no unit tests); one test process at a time; one final Chrome-only E2E run.

### Assumptions

- The owner creates an OpenAI platform API key (billed separately from ChatGPT Plus/Pro) for the final test against the real provider (confirmed r3).
- Automated tests use a local fake AI server compatible with the provider APIs (confirmed r2 q17).

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Two editors change the same note concurrently (edit, restore, attach, Apply) | The later change is rejected with a conflict warning showing the newer state (FR-007). |
| Editor edits an item while the assignee toggles completion | Each succeeds only against the item's current revision; the stale one gets a conflict. |
| Empty / >1 MB / wrong extension / binary file | Rejected before any change or AI call; not counted (FR-013). |
| .vtt/.srt with cue numbers and timestamps | Stripped; speaker names kept (FR-014). |
| Transcript too large for the configured model | Refused before dispatch with guidance; not counted (FR-020). |
| Provider error, timeout, refusal, malformed/truncated output | Note and transcript unchanged; error + "Try again"; counted if dispatched and processed (FR-021, FR-022). |
| Invalid key or provider unavailable before processing | Error + "Try again"; not counted (FR-022). |
| User leaves the page while processing | Draft discarded; counted if already dispatched (FR-022). |
| Several members start processing at 19/20 | At most one is admitted; the others are refused by the limit (FR-022). |
| Network retry of the start request | Same idempotency key and binding → same result, no second dispatch or count; changed binding → rejected (FR-031). |
| Server crash between dispatch and recording | Reservation stays counted (FR-022). |
| Provider accepts the request but the connection drops before the response | No automatic retry; counted; user sees error + "Try again" (new admission) (FR-016, FR-022). |
| Member is removed from the company while their processing runs | Draft discarded at return; Apply rechecks rights (FR-018, FR-021). |
| Another editor replaces the transcript or edits the note while a draft is pending | Apply refused as a conflict against the draft's source revision (FR-018). |
| Author or version editor's user row is deleted | Notes and history kept with name snapshots (FR-029). |
| Admin changes provider/key/model after a member saw the notice | Start refused, new notice shown; already-admitted processings finish on their snapshot (FR-015, BR-013). |
| AI suggests a name matching no member or several members | Item unassigned (FR-017). |
| Suggestion duplicates an existing item | Unchecked, "already exists" (FR-018). |
| Apply would exceed 100 items | Refused with message (FR-018). |
| Daily limit reached | Refused with limit and reset time (FR-023). |
| No AI configured | Manual notes work; AI disabled with message; admin sees settings link (FR-025). |
| Space deleted | Notes kept, "Space removed" (FR-028). |
| Company deleted | Its notes are deleted (FR-028). |
| Participant/assignee leaves, is deleted, or rejoins | "Former member", no access; rights return on rejoin (FR-030). |
| Viewer tries to add themselves as participant (UI or direct DB) | Denied (BR-003, BR-004). |
| Assignee tries to change description, assignee, or note of an item | Denied (BR-005). |
| Transcript contains instructions aimed at the AI | Treated as data; output validated against a fixed schema; extra fields dropped; assignees resolved only against current members. |
| AI output contains HTML/script or Markdown injection | Sanitized in view, escaped in export. |
| Member of company A requests anything of company B (note, version, item, search, settings, usage) | Nothing returned / denied (SM-3). |
| Non-admin calls the AI settings route | Denied (BR-009). |

## 12. Security, privacy, compliance, and abuse considerations

- RLS on every new or changed table, comparing `users.supabase_uid` with `auth.uid()::text` and scoping by the note's stored `company_id`; API routes resolve the application user by `supabase_uid`; authorization uses the pre-change state.
- Column-level protection: completion-only path for assignees; immutable `company_id`, `created_by`, `note_id`, creation times; versions are insert-only.
- API keys encrypted at rest in server-only storage (no authenticated/anon grants, no Realtime publication), decrypted only inside server code for a dispatch, never returned, never logged; provider error bodies sanitized.
- Rich text sanitized on write and render; AI output treated as untrusted; Markdown export escapes HTML.
- Only transcript text goes to a third-party provider (never the member roster), and only after the notice naming that provider for the current settings revision; the admin's provider choice (including providers hosted outside Brazil/US) is the company's decision.
- Abuse and cost: daily limit counted at dispatch with atomic reservations and idempotency; size and context preflight; server-side validation of every limit.
- Subscription credentials (Claude, ChatGPT) are never requested or stored.

## 13. Accessibility, localization, and usability considerations

- Editor, version list, review step, and dialogs are keyboard-operable with visible focus and labelled controls (Radix/shadcn primitives).
- Clear progress state while processing; errors state what happened and what to do.
- UI strings in English, matching the app; summary language follows the transcript; dates shown in the user's local time; the reset time shown in the user's local time.
- Interactive elements inside clickable cards follow the AGENTS.md interaction rules.

## 14. Acceptance criteria

- AC-001 (FR-001, FR-003, FR-005, BR-002): Given a member of company A, when they create a note in a private space with title, today's date, two participants, and content using bold, a heading, a list, a checklist, and a link, then it is listed first in that space's Notes tab and opens showing all fields with the formatting rendered; when they create a second note dated last month, then it is listed after the first.
- AC-002 (FR-001, FR-011, BR-001): Given an empty title, a missing date, a 201-char title, content above 100,000 chars, 51 participants, or a participant who is not a current member of company A, when saving, then the save is rejected with a message and nothing is stored.
- AC-003 (FR-002, FR-027): Given content and AI output containing a script tag, an `onerror` attribute, and a `javascript:` link, when saved, viewed, and exported, then no script runs, the unsafe link is neutralized, and the export contains no raw HTML from user text.
- AC-004 (FR-006, BR-003, BR-004): Given a note by X with participant Y, when Y and an admin of company A edit it, then both succeed; when non-participant Z edits, adds themselves as participant, or restores a version — through the UI, the API route, and a direct Supabase client call — then each is denied and Z sees no edit control; when an admin of company B attempts the same, then it is denied.
- AC-005 (FR-007, BR-011): Given two sessions loaded the same revision, when each saves different content (and separately: one restores while the other saves; one attaches a transcript while the other applies a draft), then the first succeeds, the second gets a conflict warning showing the newer state, and the first's change is intact.
- AC-006 (FR-008, FR-009, BR-007): Given a note saved three times, when a viewer opens history, then three versions show who and when and cannot be modified by any role; when a non-editor viewer tries to restore, then it is denied; when an editor restores version 1, then a fourth version equals version 1's fields (including participants) and action items and the transcript are unchanged.
- AC-007 (FR-010, BR-003): Given a note with versions, items, participants, and a transcript, when the author confirms delete, then all of them are gone; when a participant who is neither author nor admin tries to delete, then it is denied.
- AC-008 (FR-011, BR-005): Given a note editor, when they add, edit, and delete an item with description, assignee, and due date, then each change is shown; when the assignee (not an editor) toggles completion, then it succeeds; when the assignee changes the description, assignee, due date, or note of the item, or toggles another person's item, then it is denied.
- AC-009 (FR-011): Given a note with 10 items, when adding an item with an empty or 1,001-char description, or with an assignee who left the company or belongs to another company, then each is rejected; given a note with 100 items, when adding a valid 101st, then it is rejected for capacity; a due date saved as 2026-11-05 is displayed as 2026-11-05 in every timezone.
- AC-010 (FR-012, FR-015, FR-016, FR-018, BR-006, BR-010): Given a configured provider (fake AI server in automated tests), when a member uploads a valid .txt via "New note from transcript", then the note exists immediately with title = file name, today's date, and the transcript; a notice names the provider; processing returns a draft that changes nothing until Apply; after editing the summary, reassigning one suggestion, rejecting one, and accepting another, Apply stores exactly the edited summary and the two accepted items and creates one version; when an editor attaches a new transcript to a note, then the stored transcript is replaced immediately and the summary is unchanged.
- AC-011 (FR-013): Given an empty file, a 1.1 MB file, a .pdf renamed .txt, a .docx, and a Latin-1 binary blob, when uploading, then each is rejected with a message, no note is created or changed, no AI call is made, and usage is unchanged.
- AC-012 (FR-014): Given a .vtt and a .srt with cue numbers, timestamps, cue settings, and speaker names, when processed, then the text received by the fake provider contains no cue numbers, timestamps, or cue settings and keeps speaker names and spoken text.
- AC-013 (FR-016, FR-017, BR-006): Given a draft suggesting "Ana" when exactly one current member is named Ana, "Bruno" when two members match, "Carla" when none does, and "Diego" who left the company, then only Ana is pre-linked and the others are unassigned; the request received by the fake provider contains the transcript and no member names that are absent from the transcript.
- AC-014 (FR-004, FR-026, BR-001, SM-2, SM-3): Given 1,000 notes in company A and notes in company B with the same words, when a member of A searches a word that appears only in a title, only in content, only in a summary, and only in an action-item description, in Portuguese with and without accents and in English with different case, with and without space and period filters, then each returns the matching notes of A within the filters, ordered by relevance then meeting date, paginated, with excerpts; the first page returns within 1 second locally; no note of B appears.
- AC-015 (FR-004): Given the dashboard, when the member clicks "AI Meeting Notes", then the Meetings page opens.
- AC-016 (FR-021, FR-022, FR-023, BR-008): Given the fake provider returns an error after processing, times out, refuses, or returns malformed JSON, then the note and transcript are unchanged, an error with "Try again" appears, and usage increases by one each; given it rejects the key or is unavailable before processing, then usage is unchanged; given the user navigates away after dispatch, then no draft is applied and usage increases by one; given a successful draft that the user never applies, then usage increases by one; given the company reached its limit, then processing is refused with the limit and reset time; at 00:00 America/Sao_Paulo the count resets.
- AC-017 (FR-024, BR-009): Given an admin, when they save provider, key, model, reasoning level, and limit 50, then the settings persist and the key is shown only as its last four characters; a canary key string never appears in any API response, company read, direct Supabase select (any role), Realtime payload, server log line, or client bundle; when a member calls the settings route, then it is denied; limit 0 or 201 is rejected; a company that never saved settings has limit 20.
- AC-018 (FR-025): Given no provider configured, when a member opens a note, then manual editing works and AI controls are disabled with "An admin needs to configure AI"; an admin additionally sees a link to settings.
- AC-019 (FR-005, FR-027): Given a note with formatted content, summary, items, and transcript, when exported without the option, then the .md contains title, date, space, author, participants, Markdown content, summary, and items but no transcript; with the option ticked, the transcript is included.
- AC-020 (FR-028, FR-029): Given a space with notes, when the space is deleted, then its notes remain on the Meetings page and in search labelled "Space removed", keep their author and company, and remain editable by the same people; when a company is deleted, then its notes are deleted.
- AC-021 (FR-030): Given a participant and assignee who leaves the company, then the note shows "Former member" with the snapshot name and that user can no longer read the note; when the user row is deleted, then the snapshot name still shows; when they rejoin the same company, then their participant rights return; saving the note while a former member is still listed succeeds.
- AC-022 (SM-1, BR-012): Given the owner's OpenAI API key configured on the new app against the online database, when processing the one-hour fixture transcript, then the draft appears within 60 seconds; at no point is a subscription login requested.
- AC-023 (SM-3, BR-001, BR-009, FR-029): Given two companies, when a member and an admin of each attempt direct API and database access to the other's notes, versions, participants, items, transcripts, search, AI settings, keys, and usage, then every attempt returns nothing or is denied, and `company_id`/`created_by` cannot be changed by any client.
- AC-024 (FR-012): Given an existing note, when a non-editor tries to attach a transcript, then it is denied and the stored transcript is unchanged.
- AC-025 (FR-015, BR-013): Given a member saw the notice for provider P at settings revision R, when the admin switches to provider Q before the member starts, then the start is refused and the notice for Q is shown; a processing already admitted under P completes on P.
- AC-026 (FR-016, FR-020, FR-024): Given each of the four provider adapters configured against the fake server, when processing, then each sends only its valid parameters for the selected model and reasoning level and returns a draft; given a transcript whose estimated size exceeds the configured model's budget, then it is refused before dispatch and usage is unchanged.
- AC-027 (FR-018, FR-019): Given a note with three items (one completed) and a stored transcript, when an editor reprocesses and the draft repeats one existing item and proposes two new ones, then the repeated one arrives unchecked as "already exists", Apply appends only the accepted new items, and the three existing items (including completion) are unchanged; when Apply would exceed 100 items, then it is refused.
- AC-028 (FR-022, FR-031): Given the company is at 19 of 20, when five processing requests start concurrently, then exactly one is dispatched and counted and four are refused; when a start request is replayed with the same key and binding (including after midnight America/Sao_Paulo), then the fake provider receives it once and usage counts it once; when the same key is sent for a different note or transcript, then it is rejected; when a member calls any usage table or RPC directly to refund or alter usage, then it is denied.
- AC-029 (FR-016, FR-022): Given the fake provider accepts a request and the connection drops before its response, then the fake provider records exactly one received request, usage increases by one, and the user sees an error with "Try again"; given the fake provider returns an authentication error or a 529/503 before any body, then usage is unchanged; given it returns an overload error after streaming has begun, then usage stays counted.
- AC-030 (FR-018, FR-021): Given the fake provider is paused mid-processing, when another editor replaces the transcript, then Apply of the returned draft is refused as a conflict; when instead an admin removes the requesting member from the company, then no draft is returned to them and nothing is applied.
- AC-031 (FR-029): Given a note authored by X and edited by Y, when X's and Y's user rows are deleted, then the deletion succeeds, the note and all versions remain, and author and editor show their snapshot names.

## 15. Test strategy

- Levels: integration and E2E only (AGENTS.md). No unit tests; no mocking of Supabase, repositories, or the code under test.
- Integration (Vitest against local Supabase and real API routes): RLS and route authorization per role and company, including direct-client attacks (AC-004, AC-006, AC-007, AC-008, AC-017, AC-021, AC-023, AC-024); validation limits (AC-002, AC-009, AC-011); revisions and conflicts with competing transactions (AC-005); versions (AC-006); transcript normalization (AC-012); assignee matching (AC-013); usage counting, reservations, idempotency, reset (AC-016, AC-028); settings revision binding (AC-025); outbound retries, refund classification, idempotency binding and replay, in-flight membership removal, draft source revision, user deletion (AC-028, AC-029, AC-030, AC-031); adapters and preflight (AC-026); reprocess merge (AC-027); search fields, languages, ordering, pagination, isolation, and timing with 1,000 seeded notes (AC-014); space and company deletion (AC-020); key canary (AC-017).
- External AI provider: replaced in automated tests only, by a local fake server speaking each provider's API, selected by environment configuration, recording received requests, with fixed responses and scripted failures (error after processing, timeout, refusal, malformed JSON, auth rejection, unavailable). Database, RLS, routes, and UI stay real.
- E2E (Playwright, two accounts): manual note lifecycle, rendering and sanitization, editing rights, conflict, history/restore, action items with assignee completion, transcript upload → review → Apply, reprocess, AI-disabled state, admin settings, search, export download, dashboard link (AC-001, AC-003–AC-008, AC-010, AC-015, AC-018, AC-019, AC-027).
- Test data: fictional transcripts in .txt/.vtt/.srt, Portuguese and English, including speaker names, accents, a one-hour fixture, and malformed files. No real personal data.
- Cadence: per task type-check + lint; per block type-check, lint, DB integration suite when server code changed; one final Chrome-only E2E run of all new specs plus the full regression suite, zero retries; one test process at a time.
- Owner test: AC-022 with a real OpenAI key against the online database after the migrations are applied.

## 16. Validation and launch checklist

- All Must FRs and AC-001..AC-031 have evidence in TRACK.
- Adversarial reviews passed at SPEC, PLAN, each block, and final.
- Type-check, lint, build, DB integration suite, final E2E run green.
- Migrations listed with state: written locally, applied locally, preflight on `vhabpcoyypobgasacsko`, applied there after authorization, catalog read back, smoke check, app deployed.
- ROADMAP updated: Phase 6 status; MEET-08 moved to Phase 7.
- Owner acceptance test (AC-022) passed.

## 17. Open questions

Non-blocking, resolved during planning:

- Exact curated model and reasoning-level list per provider and each adapter's documented pre-processing rejection signals (capability matrix).
- Rich-text editor library and stored format.
- Key encryption mechanism (for example, Supabase Vault or application-level encryption with a server-only secret).
- Backfill of legacy meeting-note rows, only if the online preflight finds any (owner decision at that point).
