# Virtual Office

> Historical reference. GSD is retired; do not execute its skills or workflows. New delivery uses `spec-to-done` and an approved Ready SPEC under `spec-interview/<slug>/`. This file provides context, not an execution contract.

## What This Is

Virtual Office is an AI-powered digital workspace that recreates the ambient awareness and spontaneous collaboration of physical offices. Teams see a spatial floor plan with rooms, hear colleagues via P2P audio, chat in real-time, and get AI-powered meeting intelligence. Built for remote/hybrid teams (5-500 users) who are tired of fragmented tools (Slack + Zoom + email) and want a single spatial platform. The vision is a full Slack replacement with spatial context as the differentiator.

## Core Value

When a user logs in, they instantly see where their colleagues are, what's happening in each room, and can walk into any space to talk — just like a physical office. The end-to-end loop (login -> see floor plan -> join space -> chat -> hear people) must work flawlessly.

## Requirements

### Validated

- Auth: Email/password authentication with Supabase Auth, SSR session management, company-based multi-tenancy with RLS isolation
- Auth: User invitation workflow with token validation, auto-accept, role assignment (Admin/Member), 10-user freemium limit
- Auth: Registration UX with email confirmation, resend inline, error mapping
- Infrastructure: Next.js App Router + React + TypeScript strict + Supabase PostgreSQL + Repository Pattern; use package.json and the lockfile for current versions.
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
- Floor Plan: Presence reload recovery with automatic lastSpaceId persistence and synchronized FloorPlan visual hydration
- Audio: P2P mesh WebRTC audio with Supabase Realtime signaling, speaking indicator via client-side VAD, mic controls with default muted, hotkeys
- Messaging: Reply indicators and thread UI
- Messaging: Reaction chips and emoji picker
- Messaging: Pinned and starred message indicators
- Messaging: Foundation — data contracts, repositories, APIs, drawer shell, conversation grouping
- Stabilization: Auth/login fixes and avatar consolidation completed in Phase 1.
- Floor Plan: Knock request/approval/entry, defaults, reconnection, and Presence reload corrections completed; owner confirmed Knock on 2026-10-03.
- Collaboration: Spatial audio and single-presenter screen sharing completed; owner accepted Phase 3 on 2026-10-03. See 03-TRACKER.md for historical runtime/database evidence and its deployment limits.

### Active

- [ ] Phase 4 / MSG-01: complete read receipt details (reader identity and time).
- [ ] Phase 4 / MSG-02: complete production file sending, drag/drop, progress, and inline previews.
- [ ] Phase 4 / MSG-03: implement voice-note recording, sending, waveform, and playback.
- [ ] Phase 4 / MSG-04: complete production star/unstar actions and the personal starred-message filter.
- [ ] Phase 5: verify and finish messaging resilience from existing typing/backoff/read-sync foundations.
- [ ] Phase 6: meeting notes with AI summaries and action item tracking.
- [ ] Phase 7: company-wide announcements with priority, expiration, filtering, and read tracking.

REQUIREMENTS.md preserves historical IDs and the release split as reference; the new approved SPEC will define its own contract. Mobile floor-plan work, automatic infinite scrolling/new-message navigation, conversation content search, and advanced video collaboration were assigned to v2. Basic history loading and auto-scroll already exist and should not be rebuilt as new Phase 4 features.

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
- **Tech stack:** Next.js App Router, React, TypeScript strict, Supabase (Postgres + Realtime + Auth + Storage), TailwindCSS, shadcn/ui, and TanStack Query. Current versions come from package.json and the lockfile; the old Next.js 15/React 19.1 snapshot is not current.
- **Architecture:** Repository Pattern (interfaces + Supabase implementations), RLS enforcement, three-layer state (TanStack Query + React Context + local state)
- **Delivery state (2026-10-03):** Phases 1, 2, 2.1, and 3 complete for routing; Phase 4 ready for discussion. Broad product completion percentages are not recalculated from old epic estimates.
- **Tests:** Existing Vitest and Playwright coverage; inspect package scripts/manifests for the current inventory. No suite was rerun for this planning-only reconciliation.
- **Current messaging debt:** Parallel legacy/enhanced components; enhanced upload and star-action variants are used by debug pages while the production drawer uses MessageFeed + MessageComposer.
- **Current next step:** Use docs/messaging/phase-4-source-baseline.md as input for a new spec-to-done SPEC before planning development.
- **Historical auth issues:** Closed by 01-02 human verification; not an active messaging blocker.
- **Design specs:** `docs/ux-space-grid-v3.html` (visual target), `docs/ux-space-grid-v3-implementation-plan.md` (implementation guide)

**Market positioning:** Fills gap between generic chat (Slack/Teams) and gaming-focused spatial (Gather.town). Key differentiators: professional spatial UI, enterprise messaging, AI meeting intelligence, compliance-ready presence audit.

**Target users:** Primary — remote/hybrid teams 5-50 users in tech/professional services. Secondary — enterprise 50-500 users in regulated industries.

## Constraints

- **Tech stack**: Preserve the existing Next.js + Supabase stack; confirm any new migration requirement in the new SPEC.
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
| Bugs-first stabilization phase | Fix broken floor plan + auth before new features | Completed in Phase 1 |

---
*Last updated: 2026-10-03 after owner-confirmed Knock/screen-sharing completion and messaging baseline reconciliation*
