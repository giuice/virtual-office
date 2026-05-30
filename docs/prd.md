# Virtual Office Product Requirements Document (PRD)

**Author:** Giuliano
**Date:** 2025-10-23
**Project Level:** 3 (Complex System)
**Target Scale:** 12-40 stories across 5-10 epics

---

## Goals and Background Context

### Goals

- **Enable spontaneous remote collaboration** - Recreate ambient awareness + serendipity of physical offices in digital workspace
- **Centralize team communication** - Single spatial platform replaces fragmented tools (Slack, Zoom, email) for team coordination
- **Deliver management visibility** - Admin presence analytics + audit trails for compliance and productivity tracking
- **Reduce meeting overhead** - Quick check-ins + status awareness replace 30-40% of scheduled meetings
- **Maintain architectural coherence** - Integrate features cleanly with existing codebase (brownfield constraint)
- **Scale to enterprise readiness** - Build compliance features (SOC2, HIPAA) + SSO integration for regulated industries
- **Launch AI-powered intelligence** - Meeting notes, transcription, semantic search differentiate from competitors

### Background Context

**Virtual Office** is AI-powered digital workspace solving remote work core problem: lost ambient awareness + spontaneous collaboration. Permanent hybrid/remote now standard (78% of companies post-2024). Traditional tools cause 25-35% productivity loss vs in-office due fragmented communication, status ambiguity, too many meetings.

**Current Development Status (Brownfield):**
- **4 of 10 Epics Complete:** Infrastructure, Authentication, Floor Plan system (basic), Real-time Messaging (foundation)
- **3 Epics In Progress:** Floor Plan (UX polish), Messaging Timeline & Composer (4A), Meeting Notes System, Announcement System
- **3 Epics Planned:** Messaging Resilience & Scale (4B), AI Communication Enhancements, Video/Screen Sharing, Admin Dashboard & Analytics
- **Tech Stack:** Next.js 15, React 19, Supabase (PostgreSQL + Realtime), TypeScript, Repository Pattern

**Market Positioning:**
Virtual Office sits between generic chat tools (Slack/Teams - no spatial context) and gaming-focused platforms (Gather.town - weak enterprise features). Key differentiators: professional spatial UI, enterprise-grade messaging, AI meeting intelligence, compliance-ready presence audit.

**Target Users:** Primary: remote/hybrid teams (5-50 users) in tech + professional services. Secondary: enterprise customers (50-500 users) in regulated industries needing audit trails.

---

## Requirements

### Functional Requirements

**User & Company Management**
- **FR001:** Support company-based multi-tenancy with isolated data per organization
- **FR002:** Provide email/password authentication with secure session management via Supabase Auth
- **FR003:** Support user invitations via email with role assignment (Admin/Member)
- **FR004:** Allow admins manage company settings + member permissions

**Spatial Workspace**
- **FR005:** Provide interactive floor plan with drag-and-drop space creation + positioning
- **FR006:** Display real-time user avatars with presence status (online/away/busy/in meeting/DND) on floor plan
- **FR007:** Support zoom/pan navigation for large office layouts
- **FR008:** Allow space customization with types (meeting room, focus area, social lounge) + templates
- **FR009:** Track space entry/exit events in `space_presence_log` for analytics
- **FR009a:** Provide modern, professional space visual design with clear interaction affordances (hover states, click targets)
- **FR009b:** Support customizable space styling (colors, icons, borders) to distinguish room types visually
- **FR009c:** Render space occupancy + capacity visually (e.g., "3/10 people" with visual indicator)
- **FR009d:** Improve space selection + navigation UX with clear visual feedback + intuitive controls
- **FR009e:** Support space grouping or floor/zone organization for large office layouts

**Real-Time Messaging**
- **FR010:** Support space-based public conversations + direct messages between users
- **FR011:** Enable message threads, replies, reactions, file attachments
- **FR012:** Deliver messages in real-time via Supabase Realtime with <2 second latency
- **FR013:** Support per-user conversation preferences (pin/star/archive/notifications)
- **FR014:** Prevent duplicate direct message conversations using participant fingerprint
- **FR015:** Track message read receipts + unread counts per user
- **FR016a:** Render reply indicators, reaction chips, pinned/starred affordances, read receipts in message timeline with accessible UI
- **FR016b:** Support infinite scroll pagination with auto-scroll to new messages + "new messages" indicator
- **FR016c:** Enable file attachments via drag/drop with preview, and voice note recording with waveform visualization
- **FR016d:** Provide conversation-level search + star filtering without breaking realtime updates
- **FR016e:** Implement offline message queue with retry logic + clear recovery UX
- **FR016f:** Reconnect to Supabase Realtime with exponential backoff + resume subscriptions automatically
- **FR016g:** Provide polling fallback when realtime unavailable to reconcile missed messages
- **FR016h:** Track typing indicators + synchronize across multi-client sessions
- **FR016i:** Emit analytics events for message latency, unread backlog, engagement metrics
- **FR016j:** Support desktop notifications with conversation metadata + drawer focus on click

**Presence & Space Access Control**
- **FR017:** Enforce space-level access control with explicit membership tracking via `space_members` table
- **FR018:** Support "Knock to Enter" workflow for restricted spaces
- FR019: Provide cross-space calling capabilities
- **FR019a [NEW]:** Support "Sococo-style" P2P audio: users entering space auto-connect to audio (mesh topology)
- **FR019b [NEW]:** Default microphone to MUTED upon entry
- **FR019c [NEW]:** Visually indicate speaker (avatar pulse/glow) via client-side VAD
- FR020: Auto-update user status based on activity patterns

**Meeting Notes & Action Items**
- **FR021:** Allow meeting note creation, editing, archival in `meeting_notes` table
- **FR022:** Track action items from meetings with assignees, due dates, completion status
- **FR023:** Support AI-generated meeting summaries + transcriptions (placeholder integration)

**Announcements**
- **FR024:** Allow admins post company-wide announcements with priority levels (urgent/normal/low)
- **FR025:** Support announcement expiration dates for time-sensitive posts
- **FR026:** Provide announcement filtering + search

**Administrative Audit & Analytics**
- **FR027:** Generate presence reports showing hours online/offline/busy/in meeting per user
- **FR028:** Track space utilization analytics (usage frequency, peak times, session durations)
- **FR029:** Export activity logs for compliance purposes
- **FR030:** Provide user activity timeline view for managers

### Non-Functional Requirements

- **NFR001: Performance** - Floor plan rendering must maintain 60 FPS for layouts with 50+ spaces; message delivery <500ms end-to-end
- **NFR002: Security** - All database access protected by Supabase RLS policies; company data isolation enforced at row level; API routes secured via middleware
- **NFR003: Scalability** - Support 10,000+ concurrent users with horizontal scaling via Supabase connection pooling
- **NFR004: Accessibility** - UI must comply with WCAG 2.1 Level AA standards including keyboard navigation + screen reader support
- **NFR005: Maintainability** - Codebase follows Repository Pattern for data access; TypeScript strict mode enabled; test coverage >70% for core features

---

## User Journeys

### Journey 1: Team Member - Join Space and Collaborate

**Actor:** Team Member (remote worker)
**Goal:** Join virtual meeting space + participate in discussion

**Flow:**
1. User logs in to Virtual Office dashboard
2. Floor plan displays real-time avatars showing colleague locations
3. User sees colleague avatar in "Marketing Strategy" room with "In Meeting" status
4. User clicks space → Views space details (3 participants, meeting in progress)
5. Space public → User clicks "Join Space"
6. **Decision Point:** If space restricted → "Knock to Enter" button → Admin receives notification → Approves/denies
7. User enters space → Avatar appears on floor plan in that space
8. Messaging drawer opens showing space conversation history
9. User sends message "Hi team, joining the strategy discussion"
10. Message appears in real-time for all space members
11. Colleague replies with threaded response
12. User adds reaction (👍) to previous message
13. User shares file attachment (presentation.pdf)
14. User updates status to "Busy" to prevent interruptions
15. **Exit:** User leaves space → Avatar returns to general office area → Presence log records session (entered_at, exited_at, duration)

**Edge Cases:** Network drops → Offline queue holds messages; Space full → "Room Full" message

---

### Journey 2: Admin - Company Setup and User Management

**Actor:** Company Administrator
**Goal:** Set up new company workspace + invite team members

**Flow:**
1. Admin creates company account via registration → System creates isolated schema with RLS
2. Admin opens company settings dashboard + configures details (name, logo, timezone)
3. Admin designs initial floor plan: drags templates (Meeting Room, Focus Area, Social Lounge) + positions logically
4. Admin sets space access controls (Marketing Strategy → Restricted; Engineering Focus → Public)
5. Admin invites team members via email (bulk CSV upload) with role assignment (5 Admins, 20 Members)
6. System sends invitation emails with secure tokens
7. **Decision Point:** Team member clicks invite → Token validated → If expired, request new invite
8. Team member completes profile setup (display name, avatar) → Appears in Lobby space
9. Admin monitors presence dashboard (real-time locations, online/offline status)
10. **Ongoing:** Admin exports weekly presence report (CSV: user_id, hours_online, hours_in_meeting)

**Edge Cases:** Invite expired → Re-send; Restricted space access → Knock to Enter workflow

---

### Journey 3: Manager - Analyze Team Presence and Productivity

**Actor:** Team Manager
**Goal:** Review collaboration patterns + generate presence report

**Flow:**
1. Manager navigates to Admin Dashboard → Views metrics (15/20 online, 4.2h avg session, top spaces)
2. Manager selects "Presence Analytics" → Heatmap shows peak times (9 AM-12 PM, 2 PM-5 PM)
3. Manager filters last 30 days → Per-user breakdown (User A: 120h online, 45h meetings, 30h busy)
4. **Decision Point:** User C low presence (30h/month) → Manager schedules 1:1 discussion
5. Manager generates compliance report (date range + user group) → Exports encrypted CSV
6. Manager reviews space utilization (Marketing room 80% used → Add second; Quiet room 10% → Repurpose)
7. Manager shares insights via company-wide announcement
8. **Ongoing:** Sets up weekly automated presence summary emails

**Edge Cases:** No activity → "No data" message; Large export → Chunked files

---

## UX Design Principles

1. **Spatial Familiarity** - Use physical office metaphors (rooms, hallways, presence) to reduce cognitive load + make remote collaboration feel natural
2. **Ambient Awareness** - Surface presence, activity, availability info persistently without explicit queries
3. **Minimal Interruption** - Respect focus time through clear status indicators + "Knock to Enter" workflows; avoid notification spam
4. **Progressive Disclosure** - Show essential info first (who's where, what's happening now); detailed analytics/settings on demand

---

## User Interface Design Goals

**Target Platforms:**
- **Primary:** Desktop web (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- **Secondary (Planned):** Mobile web (responsive), Native iOS/Android apps (Phase 2)

**Core Screens/Views:**
- **Floor Plan Canvas** - Interactive workspace showing spaces + real-time user avatars
- **Messaging Drawer** - Unified conversation interface (DMs + room chats) overlaying floor plan
- **Space Detail Panel** - Participants list, join/knock controls, space settings
- **User Profile Card** - Avatar, status, quick actions (DM, call)
- **Admin Dashboard** - Analytics, user management, space configuration, presence reports
- **Company Settings** - Branding, permissions, integrations

**Key Interaction Patterns:**
- **Click-stop guards** - Interactive elements (avatars, dropdowns) prevent unintended space navigation
- **Persistent drawer** - Messaging stays accessible across route changes with minimize/restore
- **Real-time updates** - Supabase Realtime for presence, messages, space occupancy without polling
- **Keyboard navigation** - Full app navigable via keyboard (WCAG 2.1 AA compliance)

**Design Constraints:**
- **UI Library:** shadcn/ui (Radix UI primitives) + TailwindCSS 4.1.3
- **Canvas:** Konva.js for floor plan (60 FPS for 50+ spaces)
- **Accessibility:** WCAG 2.1 Level AA (keyboard nav, screen readers, high contrast)
- **Brownfield Integration:** Follow Repository Pattern, respect click-stop protocol (`data-avatar-interactive`)

---

## Epic List

### Epic 1: Core Infrastructure & Supabase Migration ✅ COMPLETE
**Goal:** Establish Next.js 15 + Supabase foundation with Repository Pattern for data access
**Stories:** ~8-10 stories
**Status:** Complete - Production ready

### Epic 2: Authentication & Company Management ✅ COMPLETE
**Goal:** Implement Supabase Auth with company-based multi-tenancy + user invitations
**Stories:** ~6-8 stories
**Status:** Complete - Auth flows operational

### Epic 3: Interactive Floor Plan & Space Management 🚧 IN PROGRESS
**Goal:** Build Konva-based interactive canvas with draggable spaces, templates, real-time occupancy
**Stories:** ~8-12 stories (basic functionality complete, design/UX improvements needed)
**Status:** In Progress - Basic floor plan functional, **needs major UX/design improvements for space interactions, visual styling, and usability**

### Epic 4A: Real-Time Messaging - Timeline & Composer 🚧 IN PROGRESS
**Goal:** Deliver user-facing messaging features for feature parity with Slack/Teams (threads, reactions, attachments, search)
**Stories:** ~12 stories (Tasks 2.5 + 3.0)
**Status:** In Progress
**Dependencies:** Tasks 1.0 + 2.0 complete (foundation)

### Epic 4B: Real-Time Messaging - Resilience & Scale ⏳ PLANNED
**Goal:** Ensure enterprise reliability with offline queue, reconnection, multi-client sync, analytics, notifications
**Stories:** ~8 stories (Tasks 4.0 + 5.0)
**Status:** Planned
**Dependencies:** Epic 4A complete

### Epic 5: Meeting Notes System 🚧 IN PROGRESS
**Goal:** Enable meeting note capture with AI summaries + action item tracking for **external meetings** (Zoom, Google Meet, Teams transcripts). Integrates with Epic 8 native meetings when available.
**Stories:** ~6-10 stories
**Status:** In Progress - UI complete, AI integration pending
**Note:** Designed for external meeting transcripts initially; seamlessly extends to Epic 8 native meetings later

### Epic 6: Announcement System 🚧 IN PROGRESS
**Goal:** Provide company-wide announcements with priority levels + expiration
**Stories:** ~4-6 stories
**Status:** In Progress - Basic posting functional, filtering pending

### Epic 7: AI-Powered Communication Enhancements ⏳ PLANNED
**Goal:** Integrate real-time transcription, semantic search, AI assistant for enhanced collaboration
**Stories:** ~12-18 stories
**Status:** Planned - Dependencies: Epic 5 complete, AI service selection

### Epic 8A: Audio MVP (Sococo-Style) 🚧 URGENT
**Goal:** Enable "always-available" audio in spaces with P2P Mesh architecture.
**Stories:** ~4-6 stories
**Status:** In Progress - Priority I

### Epic 8B: Enhanced Communication Tools (Video/Screen) ⏳ PLANNED
**Goal:** Add WebRTC video conferencing, screen sharing, virtual whiteboard
**Stories:** ~10 stories
**Status:** Planned - Dependencies: Epic 8A complete

### Epic 9: Administrative Dashboard & Analytics ⏳ PLANNED
**Goal:** Build comprehensive admin analytics for presence tracking, space utilization, compliance reporting
**Stories:** ~8-12 stories
**Status:** Planned - Dependencies: Epic 3, 4 complete (data collection exists)

**Total Estimated Stories:** ~85-120 stories across 10 epics
**Current Progress:** 2 epics complete (20%), 5 in progress (50%), 3 planned (30%)

**Immediate Priorities:**
1. **Epic 4A (Messaging Timeline & Composer):** Complete reply/reaction UI, attachments, voice notes, search (Tasks 2.5 + 3.0)
2. **Epic 3 (Floor Plan):** Major UX/design overhaul for space interactions + visual styling
3. **Epic 4B (Messaging Resilience):** Offline queue, reconnection, analytics, notifications (Tasks 4.0 + 5.0)
4. **Epic 5 (Meeting Notes):** Finish AI integration
5. **Epic 6 (Announcements):** Complete filtering + search

> **Note:** Detailed epic breakdown with full story specifications available in [epics.md](./epics.md)

---

## Out of Scope

**Deferred to Post-MVP (Phase 2):**
- Mobile native applications (iOS/Android) - Web-only for MVP
- SSO/SAML enterprise authentication - Email/password only initially
- Advanced audit log filtering + custom export formats - Basic CSV export only
- Calendar integrations (Google Calendar, Outlook sync)
- Custom branding + white-labeling for enterprise customers
- API platform for third-party integrations
- Advanced AI assistant with conversational interface - Basic AI features only (meeting notes, search)

**Deferred to Long-Term (Phase 3+):**
- Sentiment analysis on messages + meetings
- AI coaching + feedback based on participation patterns
- Dynamic room adjustments based on ML-driven usage predictions
- Multi-timezone scheduling optimization
- Team health metrics + burnout detection
- Custom workflow automation builder
- Marketplace for third-party space templates + plugins

**Explicitly Not Supported:**
- Legacy browser support (IE11, pre-2020 browsers)
- On-premise deployment options - Cloud-only (Supabase hosted)
- Real-time Video for MVP - Deferred to Epic 8B (Phase 4)
- Offline-first mobile apps - Requires internet connection
- End-to-end encryption for messages - Standard Supabase encryption only
- Multi-language UI localization - English only initially
- Integration with project management tools (Jira, Linear, Asana) - Future consideration

**Adjacent Problems NOT Being Solved:**
- Task/project management - Focus collaboration, not project tracking
- File storage/document management - File attachments only, not full DMS
- HR/performance management - Presence analytics for productivity insights only, not formal HR workflows
- Video conferencing platform - Integrate third-party or build lightweight solution, not compete with Zoom/Meet

**Scope Clarifications:**
- AI features use third-party APIs (OpenAI, Anthropic) - Not training custom models
- Compliance reporting provides raw data exports - Not automated audit submission to regulatory bodies
- Space analytics track usage patterns - Not predictive AI for space optimization (Phase 3)
