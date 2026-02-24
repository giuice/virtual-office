# Roadmap: Virtual Office

## Overview

This roadmap takes a brownfield Virtual Office application from its current ~35% completion state through full v1 delivery. The journey starts with stabilizing broken functionality (auth, floor plan sizing, avatar debt), then completes remaining floor plan features, immediately follows with video/screen sharing to leverage the spatial foundation, then rounds out messaging features and resilience, and finishes with meeting intelligence and company announcements. Each phase delivers a coherent, verifiable capability that builds on the previous.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Stabilization** - Fix broken auth, floor plan sizing, knock-to-enter timeout, and consolidate avatar tech debt
- [ ] **Phase 2: Floor Plan Completion** - Deliver remaining spatial features: knock-to-enter, offline removal, default spaces, reconnection
- [ ] **Phase 3: Video and Screen Sharing** - WebRTC video calls, screen sharing, whiteboard, recording, backgrounds, and PiP
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
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Avatar cleanup + floor plan grid sizing (STAB-04, STAB-01)
- [ ] 01-02-PLAN.md — Knock sound fix + auth flow fixes (STAB-03, STAB-02)

### Phase 2: Floor Plan Completion
**Goal**: Users experience a complete spatial floor plan with access control, automatic presence cleanup, and smart space assignment
**Depends on**: Phase 1
**Requirements**: FLOR-01, FLOR-02, FLOR-03, FLOR-04
**Success Criteria** (what must be TRUE):
  1. User can knock on a restricted space and receive approval or denial from an occupant in real-time
  2. When a user goes offline, their avatar disappears from the space display within 5 seconds with a fade-out animation
  3. First-time users land in their company default space; admin can configure default space assignments
  4. User who reconnects within 5 minutes automatically rejoins their last occupied space
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Video and Screen Sharing
**Goal**: Users can hold video meetings with screen sharing, whiteboard collaboration, and recording within spaces
**Depends on**: Phase 2
**Requirements**: VID-01, VID-02, VID-03, VID-04, VID-05, VID-06, VID-07, VID-08, VID-09, VID-10
**Success Criteria** (what must be TRUE):
  1. User can start an audio-only call in a space and upgrade to video with grid layout supporting up to 9 participants
  2. User can share their screen (window, tab, or entire screen) during a call, visible to all participants
  3. Team can use a shared whiteboard with drawing tools during calls, with PNG export
  4. Meeting organizer can record calls saved to Supabase Storage; users see connection quality indicators
  5. User can blur background, use virtual backgrounds, and pop out calls to picture-in-picture for multitasking
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD
- [ ] 03-04: TBD
- [ ] 03-05: TBD

### Phase 4: Messaging Timeline
**Goal**: Users have a rich messaging experience with read awareness, file sharing, voice notes, and message organization
**Depends on**: Phase 1
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04
**Success Criteria** (what must be TRUE):
  1. User can see who read their sent messages and when, displayed as read receipt indicators
  2. User can drag files into the composer, see upload progress, and view inline previews of attached files
  3. User can record a voice note, see waveform visualization during recording, and play it back in the message feed
  4. User can toggle a starred messages filter to see only their starred messages in the feed
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
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
Note: Phases 4, 6, and 7 depend only on Phase 1, so they could theoretically run in parallel after Phase 1 completes. Phase 3 depends on Phase 2. Phase 5 depends on Phase 4.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stabilization | 0/2 | Planned | - |
| 2. Floor Plan Completion | 0/3 | Not started | - |
| 3. Video and Screen Sharing | 0/5 | Not started | - |
| 4. Messaging Timeline | 0/3 | Not started | - |
| 5. Messaging Resilience | 0/4 | Not started | - |
| 6. Meeting Notes | 0/4 | Not started | - |
| 7. Announcements | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-23*
*Last updated: 2026-02-23*
