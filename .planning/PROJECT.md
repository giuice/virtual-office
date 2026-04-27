# Virtual Office

## What This Is

Virtual Office is an AI-powered digital workspace that recreates the ambient awareness and spontaneous collaboration of physical offices. Teams see a spatial floor plan with rooms, hear colleagues via P2P audio, chat in real-time, and get AI-powered meeting intelligence. Built for remote/hybrid teams (5-500 users) who are tired of fragmented tools (Slack + Zoom + email) and want a single spatial platform. The vision is a full Slack replacement with spatial context as the differentiator.

## Core Value

When a user logs in, they instantly see where their colleagues are, what's happening in each room, and can walk into any space to talk — just like a physical office. The end-to-end loop (login -> see floor plan -> join space -> chat -> hear people) must work flawlessly.

## Requirements

### Validated

- Auth: Email/password authentication with Supabase Auth, SSR session management, company-based multi-tenancy with RLS isolation
- Auth: User invitation workflow with token validation, auto-accept, role assignment (Admin/Member), 10-user freemium limit
- Auth: Registration UX with email confirmation, resend inline, error mapping
- Infrastructure: Next.js 15 + React 19 + TypeScript strict + Supabase PostgreSQL + Repository Pattern
- Infrastructure: TanStack Query v5 state management, Realtime subscriptions
- Floor Plan: Interactive space cards with Orbit/Analyst/Cinema perspectives, theme system (Neon/Zen/Obsidian/Paper)
- Floor Plan: Avatar constellation with status rings, speaking animation, hover effects, overflow badges
- Floor Plan: Attention beacon system with theme tokens, trigger hooks
- Floor Plan: Space neighborhoods with CRUD, filter chips, color system
- Floor Plan: NowBoard header with metrics, beacon queue, search, glass-morphism
- Floor Plan: Space detail hover panel with participant roster, activity log, bottom sheet
- Floor Plan: Space capacity handling with full badge, disabled join, API 409 validation
- Floor Plan: Real-time presence animations with exit tracking
- Floor Plan: Dashboard landing page polish with investor resources
- Audio: P2P mesh WebRTC audio with Supabase Realtime signaling, speaking indicator via client-side VAD, mic controls with default muted, hotkeys
- Messaging: Reply indicators and thread UI
- Messaging: Reaction chips and emoji picker
- Messaging: Pinned and starred message indicators
- Messaging: Foundation — data contracts, repositories, APIs, drawer shell, conversation grouping

### Active

- [ ] Fix: Floor plan space cards broken by design branch (spaces too small vs v3 spec)
- [ ] Fix: Auth login/signup issues (undiagnosed)
- [ ] Fix: Verify 3-16 Knock to Enter timeout resolution
- [ ] Epic 3 remaining: Mobile responsive floor plan (3-14)
- [ ] Epic 3 remaining: Knock to Enter workflow (3-16)
- [ ] Epic 3 remaining: Auto-remove offline users from space display (3-17)
- [ ] Epic 3 remaining: Default space assignment & reconnection grace period (3-18)
- [ ] Epic 4A: Read receipts display (4A.4)
- [ ] Epic 4A: Infinite scroll with pagination (4A.5)
- [ ] Epic 4A: Auto-scroll to new messages (4A.6)
- [ ] Epic 4A: File attachment drag-and-drop (4A.7)
- [ ] Epic 4A: File attachment preview (4A.8)
- [ ] Epic 4A: Voice note recording (4A.9)
- [ ] Epic 4A: Conversation search (4A.10)
- [ ] Epic 4A: Starred messages filter (4A.11)
- [ ] Epic 4B: Offline message queue, reconnection, polling fallback, typing indicators, multi-client sync, analytics, notifications
- [ ] Epic 5: Meeting notes with AI summaries and action item tracking (external transcript upload)
- [ ] Epic 6: Company-wide announcements with priority, expiration, filtering
- [ ] Epic 7: AI-powered features — transcription, semantic search, summarization, assistant, translation, cost monitoring
- [ ] Epic 8B: Video conferencing, screen sharing, virtual whiteboard, call recording, background blur
- [ ] Epic 9: Admin dashboard — presence reports, space utilization, compliance export, user management, privacy controls

### Out of Scope

- Mobile native apps (iOS/Android) — web-only for now
- SSO/SAML enterprise auth — email/password + OAuth sufficient for v1
- Calendar integrations (Google/Outlook) — future consideration
- Custom branding/white-labeling — future enterprise feature
- On-premise deployment — cloud-only (Supabase hosted)
- End-to-end encryption — standard Supabase encryption only
- Multi-language UI — English only
- Project management integration (Jira/Linear) — not solving that problem
- Real-time video for MVP — deferred to Epic 8B
- Sentiment analysis, AI coaching, burnout detection — Phase 3+
- Custom workflow automation builder — future
- Legacy browser support (IE11, pre-2020) — not supported

## Context

**Brownfield project** with significant existing code:
- **Tech stack:** Next.js 15.3.0, React 19.1.0, TypeScript 5 strict, Supabase (Postgres + Realtime + Auth + Storage), TailwindCSS 4.1.3, shadcn/ui, TanStack Query v5
- **Architecture:** Repository Pattern (interfaces + Supabase implementations), RLS enforcement, three-layer state (TanStack Query + React Context + local state)
- **Completion:** ~35% of total scope (Epics 1, 2, 8A done; Epic 3 ~80% done; Epic 4A ~27% done)
- **Tests:** 400+ tests across Vitest + Playwright
- **Known tech debt:** Avatar component consolidation (11 -> 2 canonical), messaging component naming inconsistency
- **Current blocker:** Design branch broke floor plan space card sizing (need to align with v3 spec from `docs/ux-space-grid-v3.html`)
- **Auth issues:** Login/signup flow has undiagnosed problems on current branch
- **Design specs:** `docs/ux-space-grid-v3.html` (visual target), `docs/ux-space-grid-v3-implementation-plan.md` (implementation guide)

**Market positioning:** Fills gap between generic chat (Slack/Teams) and gaming-focused spatial (Gather.town). Key differentiators: professional spatial UI, enterprise messaging, AI meeting intelligence, compliance-ready presence audit.

**Target users:** Primary — remote/hybrid teams 5-50 users in tech/professional services. Secondary — enterprise 50-500 users in regulated industries.

## Constraints

- **Tech stack**: Must use existing Next.js 15 + Supabase stack — no framework migrations
- **Brownfield**: All new work must integrate with existing Repository Pattern, RLS policies, and click-stop protocol
- **AI costs**: Hard limit $500/month for AI API calls; per-user caps required
- **WebRTC scale**: P2P mesh limited to ~8 users/room; SFU upgrade needed for larger meetings (future)
- **Supabase Realtime**: 200 concurrent connections on Pro plan, 500 on Team
- **Design reference**: Floor plan must match `docs/ux-space-grid-v3.html` visual spec

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase over Firebase | PostgreSQL relational model, RLS, open-source option | Good |
| Repository Pattern for data access | Testability, flexibility, type safety | Good |
| P2P Mesh for audio (Epic 8A) | No infrastructure costs, immediate value | Good (limited to ~8 users) |
| Supabase Realtime for WebRTC signaling | Reuse existing infrastructure vs dedicated Socket.IO | Good |
| Client-side VAD for speaking detection | Zero network traffic, zero latency | Good |
| External transcript upload before native video | Provides AI meeting value without waiting for Epic 8B | Good |
| OpenAI GPT-4 for initial AI provider | Best transcription via Whisper, proven API | Pending |
| Bugs-first stabilization phase | Fix broken floor plan + auth before new features | Pending |

---
*Last updated: 2026-02-23 after initialization*
