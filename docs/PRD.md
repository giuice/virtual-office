# Virtual Office Product Requirements Document (PRD)

**Author:** Giuliano
**Date:** 2025-10-22
**Project Level:** 3 (Complex System)
**Target Scale:** 12-40 stories across 5-9 epics

---

## Goals and Background Context

### Goals

- **Enable spontaneous remote collaboration** - Recreate the ambient awareness and serendipity of physical offices in a digital workspace
- **Centralize team communication** - Provide a single spatial platform that replaces fragmented tools (Slack, Zoom, email) for team coordination
- **Deliver management visibility** - Provide admins with presence analytics and audit trails for compliance and productivity tracking
- **Reduce meeting overhead** - Enable quick check-ins and status awareness to replace 30-40% of scheduled meetings
- **Maintain architectural coherence** - Integrate new features seamlessly with existing codebase (brownfield constraint)
- **Scale to enterprise readiness** - Build compliance features (SOC2, HIPAA) and SSO integration for regulated industries
- **Launch AI-powered intelligence** - Deliver meeting notes, transcription, and semantic search to differentiate from competitors

### Background Context

**Virtual Office** is an AI-powered digital workspace addressing the core challenge of remote work: loss of ambient awareness and spontaneous collaboration. With permanent hybrid/remote models now standard (78% of companies post-2024), teams using traditional tools experience 25-35% productivity loss compared to in-office work due to fragmented communication, status ambiguity, and excessive meetings.

**Current Development Status (Brownfield):**
- **4 of 9 Epics Complete:** Infrastructure, Authentication, Floor Plan system, Real-time Messaging
- **2 Epics In Progress:** Meeting Notes System, Announcement System
- **3 Epics Planned:** AI Communication Enhancements, Video/Screen Sharing, Admin Dashboard & Analytics
- **Tech Stack:** Next.js 15, React 19, Supabase (PostgreSQL + Realtime), TypeScript, Repository Pattern

**Market Positioning:**
Virtual Office fills the gap between generic chat tools (Slack/Teams - no spatial context) and gaming-focused platforms (Gather.town - weak enterprise features). Key differentiators include professional spatial UI, enterprise-grade messaging, AI meeting intelligence, and compliance-ready presence audit.

**Target Users:** Primary focus on remote/hybrid teams (5-50 users) in tech and professional services; secondary focus on enterprise customers (50-500 users) in regulated industries requiring audit trails.

---

## Requirements

### Functional Requirements

**User & Company Management**
- **FR001:** System shall support company-based multi-tenancy with isolated data per organization
- **FR002:** System shall provide email/password authentication with secure session management via Supabase Auth
- **FR003:** System shall support user invitations via email with role assignment (Admin/Member)
- **FR004:** System shall allow admins to manage company settings and member permissions

**Spatial Workspace**
- **FR005:** System shall provide interactive floor plan with drag-and-drop space creation and positioning
- **FR006:** System shall display real-time user avatars with presence status (online/away/busy/in meeting/DND) on floor plan
- **FR007:** System shall support zoom/pan navigation for large office layouts
- **FR008:** System shall allow space customization with types (meeting room, focus area, social lounge) and templates
- **FR009:** System shall track space entry/exit events in `space_presence_log` for analytics
- **FR009a:** System shall provide modern, professional space visual design with clear affordances for interaction (hover states, click targets)
- **FR009b:** System shall support customizable space styling (colors, icons, borders) to differentiate room types visually
- **FR009c:** System shall render space occupancy and capacity visually (e.g., "3/10 people" with visual indicator)
- **FR009d:** System shall improve space selection and navigation UX with clear visual feedback and intuitive controls
- **FR009e:** System shall support space grouping or floor/zone organization for large office layouts

**Real-Time Messaging**
- **FR010:** System shall support space-based public conversations and direct messages between users
- **FR011:** System shall enable message threads, replies, reactions, and file attachments
- **FR012:** System shall deliver messages in real-time via Supabase Realtime with <2 second latency
- **FR013:** System shall support per-user conversation preferences (pin/star/archive/notifications)
- **FR014:** System shall prevent duplicate direct message conversations using participant fingerprint
- **FR015:** System shall track message read receipts and unread counts per user
- **FR016a:** System shall render reply indicators, reaction chips, pinned/starred affordances, and read receipts in message timeline with accessible UI
- **FR016b:** System shall support infinite scroll pagination with auto-scroll to new messages and "new messages" indicator
- **FR016c:** System shall enable file attachments via drag/drop with preview, and voice note recording with waveform visualization
- **FR016d:** System shall provide conversation-level search and star filtering without breaking realtime updates
- **FR016e:** System shall implement offline message queue with retry logic and clear recovery UX
- **FR016f:** System shall reconnect to Supabase Realtime with exponential backoff and resume subscriptions automatically
- **FR016g:** System shall provide polling fallback when realtime is unavailable to reconcile missed messages
- **FR016h:** System shall track typing indicators and synchronize across multi-client sessions
- **FR016i:** System shall emit analytics events for message latency, unread backlog, and engagement metrics
- **FR016j:** System shall support desktop notifications with conversation metadata and drawer focus on click

**Presence & Space Access Control**
- **FR017:** System shall enforce space-level access control with explicit membership tracking via `space_members` table
- **FR018:** System shall support "Knock to Enter" workflow for restricted spaces
- **FR019:** System shall provide cross-space calling capabilities
- **FR020:** System shall automatically update user status based on activity patterns

**Meeting Notes & Action Items**
- **FR021:** System shall allow meeting note creation, editing, and archival in `meeting_notes` table
- **FR022:** System shall track action items from meetings with assignees, due dates, and completion status
- **FR023:** System shall support AI-generated meeting summaries and transcriptions (placeholder integration)

**Announcements**
- **FR024:** System shall allow admins to post company-wide announcements with priority levels (urgent/normal/low)
- **FR025:** System shall support announcement expiration dates for time-sensitive posts
- **FR026:** System shall provide announcement filtering and search

**Administrative Audit & Analytics**
- **FR027:** System shall generate presence reports showing hours online/offline/busy/in meeting per user
- **FR028:** System shall track space utilization analytics (usage frequency, peak times, session durations)
- **FR029:** System shall export activity logs for compliance purposes
- **FR030:** System shall provide user activity timeline view for managers

### Non-Functional Requirements

- **NFR001: Performance** - Floor plan rendering must maintain 60 FPS for layouts with 50+ spaces; message delivery <500ms end-to-end
- **NFR002: Security** - All database access protected by Supabase RLS policies; company data isolation enforced at row level; API routes secured via middleware
- **NFR003: Scalability** - System must support 10,000+ concurrent users with horizontal scaling via Supabase connection pooling
- **NFR004: Accessibility** - UI must comply with WCAG 2.1 Level AA standards including keyboard navigation and screen reader support
- **NFR005: Maintainability** - Codebase follows Repository Pattern for data access; TypeScript strict mode enabled; test coverage >70% for core features

---

## User Journeys

### Journey 1: Team Member - Join Space and Collaborate

**Actor:** Team Member (remote worker)
**Goal:** Join a virtual meeting space and participate in discussion

**Flow:**
1. User logs in to Virtual Office dashboard
2. Floor plan displays with real-time avatars showing colleague locations
3. User sees colleague's avatar in "Marketing Strategy" room with "In Meeting" status
4. User clicks on the space → Views space details (3 participants, meeting in progress)
5. Space is public → User clicks "Join Space"
6. **Decision Point:** If space were restricted → "Knock to Enter" button → Admin receives notification → Approves/denies
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
**Goal:** Set up new company workspace and invite team members

**Flow:**
1. Admin creates company account via registration → System creates isolated schema with RLS
2. Admin accesses company settings dashboard and configures details (name, logo, timezone)
3. Admin designs initial floor plan: Drags templates (Meeting Room, Focus Area, Social Lounge) and positions logically
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
**Goal:** Review collaboration patterns and generate presence report

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

1. **Spatial Familiarity** - Leverage physical office metaphors (rooms, hallways, presence) to reduce cognitive load and make remote collaboration feel natural
2. **Ambient Awareness** - Surface presence, activity, and availability information persistently without requiring explicit queries
3. **Minimal Interruption** - Respect focus time through clear status indicators and "Knock to Enter" workflows; avoid notification spam
4. **Progressive Disclosure** - Show essential information first (who's where, what's happening now); detailed analytics/settings available on demand

---

## User Interface Design Goals

**Target Platforms:**
- **Primary:** Desktop web (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- **Secondary (Planned):** Mobile web (responsive), Native iOS/Android apps (Phase 2)

**Core Screens/Views:**
- **Floor Plan Canvas** - Interactive workspace showing spaces and real-time user avatars
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
**Goal:** Implement Supabase Auth with company-based multi-tenancy and user invitations
**Stories:** ~6-8 stories
**Status:** Complete - Auth flows operational

### Epic 3: Interactive Floor Plan & Space Management 🚧 IN PROGRESS
**Goal:** Build Konva-based interactive canvas with draggable spaces, templates, and real-time occupancy
**Stories:** ~8-12 stories (basic functionality complete, design/UX improvements needed)
**Status:** In Progress - Basic floor plan functional, **needs major UX/design improvements for space interactions, visual styling, and usability**

### Epic 4: Real-Time Messaging System 🚧 IN PROGRESS
**Goal:** Deliver space-based and direct messaging with threads, reactions, attachments via Supabase Realtime
**Stories:** ~25-30 stories total
**Status:** In Progress (~35% complete)
**Completed:** Data contracts, API foundation, unified drawer shell, conversation grouping
**Remaining:** Reply/reaction UI rendering, attachments (drag/drop, voice notes), infinite scroll, offline queue, reconnection resilience, analytics, notifications

### Epic 5: Meeting Notes System 🚧 IN PROGRESS
**Goal:** Enable meeting note capture with AI summaries and action item tracking
**Stories:** ~6-10 stories
**Status:** In Progress - UI complete, AI integration pending

### Epic 6: Announcement System 🚧 IN PROGRESS
**Goal:** Provide company-wide announcements with priority levels and expiration
**Stories:** ~4-6 stories
**Status:** In Progress - Basic posting functional, filtering pending

### Epic 7: AI-Powered Communication Enhancements ⏳ PLANNED
**Goal:** Integrate real-time transcription, semantic search, and AI assistant for enhanced collaboration
**Stories:** ~12-18 stories
**Status:** Planned - Dependencies: Epic 5 complete, AI service selection

### Epic 8: Enhanced Communication Tools ⏳ PLANNED
**Goal:** Add WebRTC video conferencing, screen sharing, and virtual whiteboard
**Stories:** ~10-15 stories
**Status:** Planned - Dependencies: Epic 4 complete

### Epic 9: Administrative Dashboard & Analytics ⏳ PLANNED
**Goal:** Build comprehensive admin analytics for presence tracking, space utilization, and compliance reporting
**Stories:** ~8-12 stories
**Status:** Planned - Dependencies: Epic 3, 4 complete (data collection exists)

**Total Estimated Stories:** ~85-120 stories across 9 epics
**Current Progress:** 2 epics complete (22%), 4 in progress (44%), 3 planned (33%)

**Immediate Priorities:**
1. **Epic 4 (Messaging):** Complete Timeline & Composer features (Task 3.0), Realtime resilience (Task 4.0)
2. **Epic 3 (Floor Plan):** Major UX/design overhaul for space interactions and visual styling
3. **Epic 5 (Meeting Notes):** Finish AI integration
4. **Epic 6 (Announcements):** Complete filtering and search

> **Note:** Detailed epic breakdown with full story specifications is available in [epics.md](./epics.md)

---

## Out of Scope

**Deferred to Post-MVP (Phase 2):**
- Mobile native applications (iOS/Android) - Web-only for MVP
- SSO/SAML enterprise authentication - Email/password only initially
- Advanced audit log filtering and custom export formats - Basic CSV export only
- Calendar integrations (Google Calendar, Outlook sync)
- Custom branding and white-labeling for enterprise customers
- API platform for third-party integrations
- Advanced AI assistant with conversational interface - Basic AI features only (meeting notes, search)

**Deferred to Long-Term (Phase 3+):**
- Sentiment analysis on messages and meetings
- AI coaching and feedback based on participation patterns
- Dynamic room adjustments based on ML-driven usage predictions
- Multi-timezone scheduling optimization
- Team health metrics and burnout detection
- Custom workflow automation builder
- Marketplace for third-party space templates and plugins

**Explicitly Not Supported:**
- Legacy browser support (IE11, pre-2020 browsers)
- On-premise deployment options - Cloud-only (Supabase hosted)
- Real-time video/audio for MVP - Deferred to Epic 8
- Offline-first mobile apps - Requires internet connection
- End-to-end encryption for messages - Standard Supabase encryption only
- Multi-language UI localization - English only initially
- Integration with project management tools (Jira, Linear, Asana) - Future consideration

**Adjacent Problems NOT Being Solved:**
- Task/project management - Focus is collaboration, not project tracking
- File storage/document management - File attachments only, not a full DMS
- HR/performance management - Presence analytics for productivity insights only, not formal HR workflows
- Video conferencing platform - Will integrate third-party or build lightweight solution, not competing with Zoom/Meet

**Scope Clarifications:**
- AI features use third-party APIs (OpenAI, Anthropic) - Not training custom models
- Compliance reporting provides raw data exports - Not automated audit submission to regulatory bodies
- Space analytics track usage patterns - Not predictive AI for space optimization (Phase 3)
