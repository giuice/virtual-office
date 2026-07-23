# Roadmap: Virtual Office

## Overview

This roadmap takes a brownfield Virtual Office application from its current ~35% completion state through full v1 delivery. The journey starts with stabilizing broken functionality (auth, floor plan sizing, avatar debt), then completes remaining floor plan features, immediately follows with a reliable spatial-audio and screen-sharing demonstration that leverages the existing WebRTC foundation, then rounds out messaging features and resilience, and finishes with meeting intelligence and company announcements. Each phase delivers a coherent, verifiable capability that builds on the previous.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Stabilization** - Fix broken auth, floor plan sizing, knock-to-enter timeout, and consolidate avatar tech debt (completed 2026-05-17)
- [x] **Phase 2: Floor Plan Completion** - Deliver remaining spatial features: knock-to-enter, offline removal, default spaces, reconnection (completed 2026-05-13)
- [x] **Phase 2.1: Presence Reload Fixes (INSERTED)** - Fix remaining presence reload bugs: lastSpaceId persistence and UI/DB divergence
- [ ] **Phase 3: Spatial Audio and Screen Sharing** - Demonstrate reliable existing spatial audio plus single-presenter screen sharing on an integrated floor-plan stage
- [ ] **Phase 4: Messaging Timeline** - Add read receipts, file attachments, voice notes, and starred message filtering
- [ ] **Phase 5: Messaging Resilience** - Offline queue, reconnection, polling fallback, typing indicators, multi-device sync, analytics, notifications
- [ ] **Phase 6: Meeting Notes** - Meeting note creation, action items, transcript upload, AI summaries, search, and notifications
- [ ] **Phase 7: Announcements** - Company-wide announcements with priority, filtering, admin controls, and read tracking

## Phase Details

### Phase 1: Stabilization
**Goal**: The existing application works reliably -- users can log in, see correctly-sized floor plan spaces, and the codebase is free of known regressions
**Depends on**: Nothing (first phase)
**Requirements**: STAB-01, STAB-02, STAB-03, STAB-04
**Success Criteria** (what must be TRUE):
  1. User can log in and sign up without errors on the current branch
  2. Floor plan space cards render at sizes matching the v3 design spec (`docs/ux-space-grid-v3.html`)
  3. Knock to Enter channel timeout does not cause stale state or broken UI
  4. Only EnhancedAvatarV2 and UploadableAvatar are used across the codebase -- no references to deprecated avatar components
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Avatar cleanup + floor plan grid sizing (STAB-04, STAB-01)
- [x] 01-02-PLAN.md — Knock sound fix + auth flow fixes (STAB-03, STAB-02)

### Phase 2: Floor Plan Completion
**Goal**: Users experience a complete spatial floor plan with access control, automatic presence cleanup, and smart space assignment
**Depends on**: Phase 1
**Requirements**: FLOR-01, FLOR-02, FLOR-03, FLOR-04
**Success Criteria** (what must be TRUE):
  1. User can knock on a restricted space and receive approval or denial from an occupant in real-time
  2. When a user goes offline, their avatar disappears from the space display within 5 seconds with a fade-out animation
  3. First-time users land in their company default space; admin can configure default space assignments
  4. User who reconnects within 5 minutes automatically rejoins their last occupied space
**Plans:** 8/8 plans complete

Plans:
- [x] 02-00-PLAN.md — Wave 0: Test scaffold stubs for all Phase 2 features (FLOR-01, FLOR-02, FLOR-03, FLOR-04)
- [x] 02-01-PLAN.md — Knock-to-enter UX: banner notification, knock button on cards, auto-join on approval (FLOR-01)
- [x] 02-02-PLAN.md — Offline user removal: fade-out animation, crash detection, server-side cleanup (FLOR-02)
- [x] 02-03-PLAN.md — Default spaces + reconnection: admin UI, auto-placement, 5-min grace period (FLOR-03, FLOR-04)
- [x] 02-04-PLAN.md — Restricted-space server authorization: authenticated users/location route, approved-knock consumption, grace-rejoin regression coverage (FLOR-01, FLOR-04)
- [x] 02-05-PLAN.md — GAP CLOSURE: Fix mass false-offline transitions and peer leave eviction (FLOR-02, FLOR-04)
- [x] 02-06-PLAN.md — GAP CLOSURE: Fix Admin Spaces tab API route, space filter, and settings merge (FLOR-03)
- [x] 02-07-PLAN.md — GAP CLOSURE: Fix reload user disappearance and grace-rejoin race condition (FLOR-04)

### Phase 2.1: Presence Reload Fixes (INSERTED)
**Goal**: Fix the remaining critical presence reload bugs identified in research to ensure consistent behavior across automatic and manual placements
**Depends on**: Phase 2
**Requirements**: FLOR-04
**Success Criteria** (what must be TRUE):
  1. Automatic user placements persist lastSpaceId for proper grace rejoin behavior  
  2. FloorPlan UI state changes are synchronized with presence database state
**Plans:** 1/1 plans complete

Plans:
- [x] 02.1-01-PLAN.md — Fix lastSpaceId persistence gap and UI/DB divergence for automatic placements (FLOR-04)

### Phase 3: Spatial Audio and Screen Sharing

**Goal**: Users can reliably use the existing spatial audio and view one participant's shared screen on an integrated, expandable floor-plan stage, while preserving P2P WebRTC and Supabase Realtime signaling
**Depends on**: Phase 2.1
**Requirements**: VID-01, VID-02, VID-04
**Optional**: Basic camera video may be included only if it does not delay or destabilize audio or screen sharing; it is not an acceptance criterion
**Deferred**: Mandatory nine-participant video (VID-03), VID-05 through VID-10, and migration to LiveKit or another SFU belong to a future Advanced Collaboration phase
**Success Criteria** (what must be TRUE):

  1. Entering a space connects the user to existing room-scoped P2P audio in listen-only mode; microphone activation remains explicit, with mute/unmute and speaker indication
  2. Existing Supabase Realtime signaling and STUN/TURN-backed P2P WebRTC are preserved and extended; changing spaces tears down prior media cleanly
  3. Exactly one participant can share a window, tab, or entire screen at a time, visible to occupants on an integrated stage that each viewer can expand or collapse
  4. Permission denial, cancellation, browser-ended sharing, presenter departure, and space changes restore a stable non-sharing layout without breaking room audio

**Plans**: 1/13 plans executed

Plans:
**Wave 1**

- [x] 03-08-PLAN.md — Local authoritative lease/RPC/private-topic migration and readback

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 03-09-PLAN.md — Pinned validation contracts and initial authenticated route boundaries

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-10-PLAN.md — Bounded production WebRTC display and private signaling foundations

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-01-PLAN.md — Production tracer: explicit capture-to-canonical integrated stage with bounded mock evidence

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 03-02-PLAN.md — Real local Postgres lease concurrency and private Realtime RLS proof
- [ ] 03-03-PLAN.md — Adversarial perfect-negotiation, signaling, and scoped cleanup hardening

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 03-04-PLAN.md — Complete authenticated claim/renew/release/active HTTP lifecycle

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 03-11-PLAN.md — Idempotent provider capture/heartbeat/teardown lifecycle

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 03-05-PLAN.md — Approved responsive/accessibility UI-SPEC stage and floor-plan integration

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 03-06-PLAN.md — Tagged two-context Chromium UI/lifecycle automation

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 03-07-PLAN.md — Read-only Presence Safety and Supabase/RLS reviewer gates

**Wave 11** *(blocked on Wave 10 completion)*

- [ ] 03-12-PLAN.md — Complete unchanged-diff local/database/browser/build gates

**Wave 12** *(blocked on Wave 11 completion)*

- [ ] 03-13-PLAN.md — Real browser/TURN UAT and exact-target rollout decision

### Phase 4: Messaging Timeline
**Goal**: Users have a rich messaging experience with read awareness, file sharing, voice notes, and message organization
**Depends on**: Phase 1
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04
**Success Criteria** (what must be TRUE):
  1. User can see who read their sent messages and when, displayed as read receipt indicators
  2. User can drag files into the composer, see upload progress, and view inline previews of attached files
  3. User can record a voice note, see waveform visualization during recording, and play it back in the message feed
  4. User can receive voice note, see waveform visualization during recording, and play it back in the message feed
  5. User can toggle a starred messages filter to see only their starred messages in the feed
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: Messaging Resilience
**Goal**: Messaging works reliably across network disruptions, multiple devices, and background usage
**Depends on**: Phase 4
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04, RESIL-05, RESIL-06, RESIL-07
**Success Criteria** (what must be TRUE):
  1. User can compose and send messages while offline; messages deliver automatically when connectivity returns
  2. When Realtime disconnects, the app reconnects with backoff and resumes subscriptions without user action; if Realtime is down >30s, polling fills the gap
  3. User sees typing indicators when others are composing, and read receipts stay consistent across multiple logged-in devices
  4. User receives desktop notifications for DMs and @mentions when the app is in the background
  5. Messaging health metrics (latency, delivery rate, engagement) are tracked and accessible for monitoring
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD
- [ ] 05-04: TBD

### Phase 6: Meeting Notes
**Goal**: Users can capture, organize, and get AI-powered insights from their meetings
**Depends on**: Phase 1
**Requirements**: MEET-01, MEET-02, MEET-03, MEET-04, MEET-05, MEET-06, MEET-07, MEET-08
**Success Criteria** (what must be TRUE):
  1. User can create meeting notes for a space with title, date, participants, and rich text; can later view, edit, and delete them with version history
  2. User can add action items with assignee, due date, and completion tracking to any meeting note
  3. User can upload a transcript file (.txt, .vtt, .srt) and receive an AI-generated summary with key points, decisions, and extracted action items
  4. User can search across all meeting notes by title, content, summary, and action items
  5. User receives notifications when assigned an action item and reminders before due dates
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD
- [ ] 06-04: TBD

### Phase 7: Announcements
**Goal**: Admins can broadcast important information company-wide and track engagement
**Depends on**: Phase 1
**Requirements**: ANNC-01, ANNC-02, ANNC-03, ANNC-04, ANNC-05, ANNC-06
**Success Criteria** (what must be TRUE):
  1. Admin can create announcements with priority level (urgent/normal/low) and optional expiration date
  2. User sees announcements with urgent items displayed as banners; read/unread status is tracked per user
  3. User can filter announcements by priority, date range, and keyword search
  4. Admin can edit or delete announcements with audit trail; can view read count, percentage, and unread user list
  5. User receives desktop and email notifications for urgent announcements
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 2.1 -> 3 -> 4 -> 5 -> 6 -> 7
Note: Phases 4, 6, and 7 depend only on Phase 1, so they could theoretically run in parallel after Phase 1 completes. Phase 3 depends on Phase 2.1. Phase 5 depends on Phase 4.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stabilization | 2/2 | Complete | 2026-05-17 |
| 2. Floor Plan Completion | 8/8 | Complete    | 2026-05-13 |
| 2.1 Presence Reload Fixes | 1/1 | Complete    | 2026-05-13 |
| 3. Spatial Audio and Screen Sharing | 1/13 | In Progress | - |
| 4. Messaging Timeline | 0/3 | Not started | - |
| 5. Messaging Resilience | 0/4 | Not started | - |
| 6. Meeting Notes | 0/4 | Not started | - |
| 7. Announcements | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-07-23*
