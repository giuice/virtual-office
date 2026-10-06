# PLAN: phase-4-messaging-timeline

Spec: ./SPEC.md
Goal: In the production messaging drawer, two users can see who read a message and when, send and view file attachments, record/send/play voice notes, find their starred messages (including old ones), and get desktop notifications for new DM/group messages — without regressing existing messaging.
Plan version: 10
Highest task ID reserved: T32
Replanned because: TRACK T21 [partial] — automated gates passed for the performer, but the orchestrator full run failed `messaging-feed-stability.spec.ts:131` after T21's feed changes; owner UAT pending.

## Standing rules for every task

- **Migration rule (BR-012 amended, AC-032):** during the phase a migration is done when it is applied to the LOCAL database, its tests pass, it is reviewed as additive/backward compatible with the published app (BR-013), and its rollback script is recorded in TRACK. The orchestrator adds a row for it to `MIGRATIONS-PENDENTES.md` (the owner's checklist of what is still pending online). Nothing is applied online until T25 (phase end, owner OK).
- **Online application method (TRACK T2), used only in T25:** immediately before applying, re-run `npx supabase migration list --linked` and a targeted catalog check; apply only the reviewed migration file's SQL transactionally and record only that version; read back by whitespace-normalized statement hash plus catalog objects; smoke-check. Never use `supabase db push` (any form), `migration up --linked`, or broad/invented `migration repair` — 4 online-only and 9 repo-only historical versions make them unsafe. Storage migrations must not collide with the online-only `user-uploads` bucket/avatar policy names; attachments currently have no `storage.objects` policies.
- **Review gate (AC-035):** every migration, policy, repository, or route change passes the Supabase/RLS review (users.id vs supabase_uid, server client + `auth.getUser()`, no service-role substitution for membership checks).
- **Test policy (BR-016, AC-036):** new tests are integration (local Supabase) or E2E (two accounts); a unit test needs a written justification in TRACK; a touched messaging test that only mirrors implementation is replaced by equivalent integration/E2E coverage and then removed, with the removal and its replacement recorded in TRACK.
- **Regression (BR-017, AC-031):** each task that changes drawer behavior ends with the messaging regression E2E passing locally.

## Observations grounding this plan (2026-10-03)

- `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at the online project `vhabpcoyypobgasacsko`; Playwright (`playwright.config.ts`, testDir `__tests__/api/playwright`, project `messaging-drawer`) loads `.env.local` and seeds via `/api/test/messaging/seed` with `PLAYWRIGHT_PRIMARY_*`/`SECONDARY_*` users — today E2E runs against the online database. Local Supabase is running (`127.0.0.1:54321/54322`); local DB integration tests exist only for presence (`vitest.presence-db.config.mts`); no messaging DB integration tests exist.
- Read marking: `MessagingContext.tsx:160-164` calls `/api/conversations/read` whenever the drawer is open with an active conversation and unread > 0; RPC `mark_conversation_read` (migration `20260610210000`) sets `last_read_at = now()` and inserts receipts for every non-sender message. No tab/per-message visibility. `get_unread_counts` counts messages with `timestamp > last_read_at`. Feed fetches receipts as `select('message_id')` only (`SupabaseMessageRepository.ts:404-420`); `getReadReceipts` exists without route/caller. Receipts INSERT is in Realtime and invalidates `['messages', id]` (`useMessageSubscription.ts:269-276, 363-369`).
- Feed: `loadingMessages = isLoading || isFetching` (`useMessages.ts:83`) replaces the whole feed with a skeleton on every refetch (`message-feed.tsx:202`); feed scrolls to bottom on every `messages` change (`:115-119`); no scroll-to-message/highlight exists; items expose `data-testid="message-{id}"`.
- Sending: `MessageFeed.handleSendMessage` swallows errors and `MessageComposer` clears content (`message-composer.tsx:93-95`) → text lost on failure; optimistic temp message removed without toast.
- Attachments: `message_attachments` (message_id NOT NULL, duration, waveform_data, …) with sender-only INSERT/DELETE and member SELECT; private `attachments` bucket (10 MB, no audio MIME, no `storage.objects` policies; service-client access). Upload route without `messageId` creates no row and returns a temp id; `POST /api/messages/create` ignores `attachments` and rejects empty content; `useMessages.sendMessage` returns early on empty text → no attachment can be linked to a message today. No orphan cleanup. Production composer file input has no `onChange`; `onSendMessage(content: string)`. `MessageContent` renders only `attachments[0]` for IMAGE/FILE, no voice branch; `next/image` through the auth-gated attachment route is likely broken (unverified).
- Stars: POST/DELETE star route and optimistic `useMessageActions` mutations exist; RLS limits star SELECT to own stars; `getStarredMessages` is unpaginated, has no route/caller; `MessageFeed` passes no `onStar/onUnstar`.
- Microphone: `useAudio()` (`src/contexts/AudioContext.tsx`) exposes `isMuted/setMuted`, but `AudioProvider` is mounted only inside `floor-plan.tsx:401`, while `MessagingDrawer` is in `src/app/layout.tsx` outside it.
- Notifications: no browser Notification API, permission flow, or service worker exists.
- These observations confirm the SPEC premises (gaps exist, backend partially present); none contradicts the contract.

## Remaining tasks

None — T32 done (TRACK T32); plan empty, route to REPORT.

## Plan quality gate (version 10, 2026-10-05)

- v10 (replan T21 → T32): continuation keeps Root T21 and its Covers; T25 done; ID T32 new; no criterion changed.

## Plan quality gate (version 9, 2026-10-05)

- v8 (replan T16 → T30) and v9 (replan T20 → T31): continuation tasks keep their Root and the SPEC criteria; dependencies repointed from attempted T16/T20 (T17, T18 → T30; T25 → T31); IDs T30, T31 new; no criterion changed. Checks below re-verified for v9.

## Plan quality gate (version 7, 2026-10-05)

- Grounded in an actual observation of current state: Pass — Observations + TRACK T13 partial and Correction — T13 evidence.
- Every acceptance criterion covered by TRACK done/no_op or a remaining task: Pass — mechanical check.
- Every Must-priority requirement covered: Pass — mechanical check.
- Every task lists Covers; no task outside every requirement path: Pass.
- Every ID in Covers exists in the SPEC: Pass.
- Every task has one observable Done when: Pass.
- Every task has a concrete Verify by: Pass.
- No task describes HOW instead of WHAT: Pass.
- Dependencies are ordered correctly and acyclic: Pass — mechanical check; T28 → T29 placed before T14; T14 and T16 repointed from attempted T13 to T29; T25 still lists T11 (done).
- PLAN contains only future work: Pass.
- No attempted TRACK task is reissued or retained: Pass.
- Every task carries Root: Pass.
- Surviving IDs stable; dependencies repointed away from attempted tasks: Pass.
- Success criteria are unchanged from the SPEC (replan only): Pass — only the owner-amended BR-012/AC-032 differ from the original SPEC; v7 changes no criterion.
- No strategy version changed during maintenance: N/A.

Verdict: Ready

