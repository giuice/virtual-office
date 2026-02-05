# Virtual Office - Epic Breakdown

**Author:** Giuliano
**Date:** 2025-10-23
**Project Level:** 3 (Complex System)
**Target Scale:** 85-120 stories across 10 epics

---

## Overview

This document provides the detailed epic breakdown for Virtual Office, expanding on the high-level epic list in the [PRD](./PRD.md).

Each epic includes:
- Expanded goal and value proposition
- Complete story breakdown with user stories
- Acceptance criteria for each story
- Story sequencing and dependencies

**Epic Sequencing Principles:**
- Epic 1 establishes foundational infrastructure and initial functionality
- Epic 2 provides authentication and company management
- **Epic 3 delivers the "Unleashed" visual experience and floor plan** (merged from original Epic 3 + Epic 10)
- Epic 4A/4B adds messaging features that inherit the visual foundation
- Subsequent epics build progressively, each delivering significant end-to-end value
- Stories within epics are vertically sliced and sequentially ordered
- No forward dependencies - each story builds only on previous work

---

## Epic 1: Core Infrastructure & Supabase Migration ✅ COMPLETE

**Expanded Goal:**
Establish a modern, scalable foundation for Virtual Office using Next.js 15, React 19, and Supabase, replacing the legacy Firebase implementation. Implement Repository Pattern for clean data access abstraction and set up CI/CD pipeline for reliable deployments.

**Value Delivery:**
This epic delivered the technical foundation enabling all subsequent features: type-safe development with TypeScript, real-time capabilities via Supabase, and maintainable architecture through Repository Pattern.

**Key Achievements:**
- Next.js 15.3.0 + React 19.1.0 + TypeScript 5 stack
- Supabase PostgreSQL database with RLS policies
- Repository Pattern implementation (interfaces + Supabase implementations)
- Initial database schema (companies, users, spaces, conversations, messages)
- Development workflow with linting, type-checking, and testing infrastructure

**Stories: ~8-10** (Completed retrospectively, documented for reference)

---

## Epic 2: Authentication & Company Management 🚨 HOTFIX REQUIRED

**Expanded Goal:**
Implement secure, company-based multi-tenancy with Supabase Auth, enabling organizations to create isolated workspaces and manage team members through invitation workflows with role-based access control.

**Value Delivery:**
This epic enabled the fundamental access control model: companies can onboard teams securely, admins can manage members, and all data is isolated per company through RLS policies.

**Current Status:** ⚠️ PARTIALLY COMPLETE - Invitation flow broken, requires hotfix

**Key Achievements:**
- Supabase Auth with email/password authentication ✅
- SSR-compatible auth flows using @supabase/ssr ✅
- Company creation and settings management ✅
- Role-based access control (Admin/Member) ✅
- Auth middleware protecting API routes ✅

**Known Issues (Hotfix Required):**
- User invitation system uses fake UUID instead of Supabase Auth ❌
- No email confirmation feedback after signup ❌
- No way to copy/share invitation links ❌

**Business Model:** Freemium - 10 users free per company

### Hotfix Stories (3 total)

---

**Story 2.1: Registration UX Feedback** ⭐ PRIORITY

As a new user registering on the platform,
I want clear feedback after signup about what to do next,
So that I understand the email confirmation process and can successfully access the platform.

**Acceptance Criteria:**
1. After successful signup, show clear message with email confirmation instructions
2. Display user's email address in the confirmation message
3. "Resend confirmation email" button that calls Supabase resend API
4. On login page, detect unconfirmed email and show resend option
5. After email confirmation, redirect to `/onboarding` page
6. Onboarding shows "Create Company" or "Join via Invite Code" options

**Technical Reference:** 
- `src/app/(auth)/signup/page.tsx` - Add success state
- `src/app/(auth)/login/page.tsx` - Detect unconfirmed email
- Supabase API: `supabase.auth.resend({ type: 'signup', email })`

**Prerequisites:** None (independent fix)
**Estimate:** 2-3 hours

---

**Story 2.2: Invitation Accept Flow** ⭐ PRIORITY

As a user who received an invitation link,
I want to click the link and be guided through registration/login,
So that I can join the company that invited me.

**Acceptance Criteria:**
1. Remove `generateTestUuid()` function and all fake UUID logic from `/join` page
2. `/join?token=xxx` validates token before showing auth UI
3. Show Supabase Auth UI (Google + Email/Password) if not logged in
4. After auth success, auto-call `/api/invitations/accept` with token
5. Update user's `company_id` and invitation status to `accepted`
6. Redirect to `/dashboard` with success toast
7. Show clear error for invalid/expired tokens
8. Show warning if user already belongs to a company

**Technical Reference:**
- `src/app/join/page.tsx` - Complete rewrite required
- `src/app/api/invitations/accept/route.ts` - Ensure uses server client
- Database trigger `handle_new_user()` creates user with `company_id = NULL`

**Prerequisites:** Story 2.1 (registration UX)
**Estimate:** 4-6 hours

---

**Story 2.3: Invitation Link Copy & User Limit** ⭐ PRIORITY

As a company admin inviting a new member,
I want to see and copy the invitation link,
So that I can manually share it while email sending is not implemented.

**Acceptance Criteria:**
1. After creating invitation, show success state with copyable link
2. Copy button copies full URL with visual feedback ("Link copiado!")
3. Show pending invitations list with email, status, created date
4. "Copy link" action for pending invitations
5. "Revoke" action for pending invitations
6. Enforce 10-user limit (Freemium model)
7. Count includes current users + pending invitations
8. Clear messaging when limit reached with upgrade prompt

**Technical Reference:**
- `src/components/dashboard/invite-user-dialog.tsx` - Add success state
- `src/app/api/invitations/create/route.ts` - Return full URL
- `src/app/api/invitations/list/route.ts` - NEW: List invitations

**Prerequisites:** Story 2.2 (invitation accept flow)
**Estimate:** 3-4 hours

---

**Stories: 3 hotfix + ~6-8 completed retrospectively**

---

## Epic 3: Visual Experience & Floor Plan (Unleashed) 🚧 IN PROGRESS

**Expanded Goal:**
Transform Virtual Office into a visually stunning, investor-ready spatial workspace using the "Reality Distortion" design system. This epic merges original floor plan functionality with the "Unleashed" UX patterns from Epic 10, delivering the Orbit Gallery layout, theme system, avatar constellations, and attention beacons as the foundation for all subsequent features.

**Value Delivery:**
Visual polish wins investor demos. This epic elevates the product from a utility to a premium experience, providing role-adaptive views (Orbit for general use, Analyst for ops, Cinema for lobbies) and personalization (Neon, Zen, Obsidian themes). The floor plan becomes the "wow factor" that differentiates Virtual Office from chat-only tools.

**Design References:**
- UX Specification: `docs/ux-design-specification.md`
- Interactive Demo: `docs/ux-space-grid-v2.html`
- Color Themes: `docs/ux-color-themes.html`

**Current Status:** Foundation complete; **Unleashed visual overhaul starting**

### Stories (14 total - merged from Epic 3 + Epic 10)

---

**Story 3.1: Reality Distortion Engine (Theme System)** ⭐ PRIORITY

As a user,
I want to switch between different visual themes (Neon, Zen, Obsidian, Paper),
So that I can align the workspace with my current mood or lighting conditions.

**Acceptance Criteria:**
1. Theme switcher UI (dropdown or palette selector) in header/settings
2. CSS variable tokens for all themes (colors, gradients, shadows, glass effects)
3. "Neon Cyberpunk" theme: High contrast, cyan/magenta accents, void black base (`#050505`)
4. "Zen Garden" theme: Soft earth tones, paper textures, moss green (`#3D4C41`)
5. "Obsidian Stealth" theme: Monochrome dark, true black (`#000000`), minimal
6. "Paper White" theme: Pure white, ink black text, red signals
7. Theme preference persists in `users.preferences.theme`
8. Instant theme switching without page reload

**Technical Reference:** See `docs/ux-space-grid-v2.html` CSS variables

**Prerequisites:** None (foundation story)

---

**Story 3.2: Space Card V2 (Orbit Gallery Component)** ⭐ PRIORITY

As a user,
I want rich, interactive space cards that reveal details on hover,
So that I can see what's happening inside a room without entering it.

**Acceptance Criteria:**
1. New `SpaceCard` component implementing Orbit Gallery design (refactor from `SpaceElement.tsx`)
2. Gradient backgrounds based on space type/neighborhood
3. Status ribbons (Agenda Phase, Meeting Type) visible on card face
4. Card displays: space name, occupancy count, phase pill
5. Hover interaction expands card to reveal:
   - Full participant roster (avatars row)
   - Current agenda phase/topic
   - Latest activity log entry (monospace font)
6. Smooth transition animations for hover state (200ms, ease-elastic)
7. Theme-aware styling (inherits CSS variables from Story 3.1)

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.space-card` implementation

**Prerequisites:** Story 3.1

---

**Story 3.3: Avatar Constellation V2** ⭐ PRIORITY

As a user,
I want to see my colleagues' photos with clear status indicators,
So that I can instantly recognize who is speaking or listening.

**Acceptance Criteria:**
1. `AvatarConstellation` component (extend `UserAvatarPresence.tsx`)
2. Photo-first design (36px circular avatars with 2px border)
3. Animated status rings:
   - Box-shadow glow for "Speaking" (accent color)
   - Solid border for "Presenting"
   - Dimmed opacity for "Observer/Muted"
4. Smart stacking: negative margin overlap (-10px), max 4 visible
5. Overflow badge: "+N" for 5+ participants
6. Hover on avatar: translateY(-3px) scale(1.1) with z-index bump
7. Tooltips show name, role, and status

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.avatars-row` implementation

**Prerequisites:** Story 3.2

---

**Story 3.4: Attention Beacon System**

As a leader,
I want to see visual pulses on spaces that need attention,
So that I can quickly identify blockers or active discussions.

**Acceptance Criteria:**
1. `AttentionBeacon` component (animated pulse ring/halo)
2. Beacon indicator: 10px circle with box-shadow glow
3. Pulse animation: 2s infinite for normal, 1s for critical
4. Logic to trigger beacons based on:
   - "Blocker" logged in meeting
   - Occupancy > 80%
   - "Help Requested" signal
5. Visual severity levels:
   - Normal: theme accent color
   - Critical: red (#ff4d4d) with fast pulse
6. Beacons visible in all layout modes

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.beacon-indicator` CSS

**Prerequisites:** Story 3.2

---

**Story 3.5: Orbit Gallery Layout (Default View)** ⭐ PRIORITY

As a user,
I want the default floor plan to use the Orbit Gallery layout,
So that I have a balanced view of space and detail.

**Acceptance Criteria:**
1. Implement Orbit Gallery grid system: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
2. Integrate `SpaceCard` V2 into the grid
3. "Now Board" header region showing active beacons and summary metrics
4. Responsive behavior:
   - Desktop (≥1440px): 3-4 columns
   - Tablet (1024-1439px): 2 columns
   - Mobile (<1024px): 1 column
5. Glass-morphism controls bar: blur backdrop, subtle border
6. Replace Konva.js canvas view with this DOM-based grid (better accessibility)

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.layout-orbit` implementation

**Prerequisites:** Story 3.2, 3.3, 3.4

---

**Story 3.6: Analyst Matrix Layout (Dense View)**

As an operations manager,
I want a dense, data-rich view of all spaces,
So that I can monitor 20+ rooms simultaneously without scrolling.

**Acceptance Criteria:**
1. "Analyst Matrix" layout option in view switcher
2. Compact grid: `minmax(220px, 1fr)` with 1rem gap
3. Hide avatar constellation, show sparkline instead
4. Sparkline bar showing occupancy/activity percentage
5. Reduced card padding (1rem vs 1.5rem)
6. Text-heavy: Room Name, Phase, Occupancy numbers prominent
7. Maximum density: 30+ spaces visible on 1080p screen

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.layout-analyst` implementation

**Prerequisites:** Story 3.5

---

**Story 3.7: Cinema Mode Layout (Immersive View)**

As a user in a lobby or public screen,
I want a large-scale, immersive view of key spaces,
So that the office activity looks beautiful on a big screen.

**Acceptance Criteria:**
1. "Cinema Mode" layout option in view switcher
2. Large cards: `minmax(400px, 1fr)`
3. Full-screen cards for active spaces only
4. Auto-rotate/carousel feature (cycle through active rooms every 15s)
5. High-fidelity visuals: larger avatars, full background gradients
6. Hide UI chrome (headers, sidebars) option

**Technical Reference:** See `docs/ux-space-grid-v2.html` `.layout-cinema` implementation

**Prerequisites:** Story 3.5

---

**Story 3.8: Perspective Switcher UI**

As a user,
I want to easily toggle between Orbit, Analyst, and Cinema views,
So that I can choose the best layout for my current task.

**Acceptance Criteria:**
1. `PerspectiveSwitcher` component in controls bar
2. Three buttons: Orbit (default), Analyst, Cinema
3. Active button styling: background fill, text color, box-shadow
4. Instant layout switch via CSS class toggle on body
5. Keyboard shortcut hints (optional): O, A, C
6. Preference persists in localStorage or user profile

**Prerequisites:** Story 3.5, 3.6, 3.7

---

**Story 3.9: Space Grouping and Neighborhoods**

As an admin,
I want to organize spaces into neighborhoods (e.g., "Engineering", "Marketing"),
So that large office layouts are easier to navigate and understand.

**Acceptance Criteria:**
1. Zone/neighborhood creation UI in admin settings
2. Spaces can be assigned to neighborhoods
3. Grid displays neighborhood groupings via visual bands/sections
4. Neighborhood colors derived from theme CSS variables
5. Filter chips in Now Board to show/hide neighborhoods
6. Zone data stored in `spaces.metadata` or `neighborhoods` table

**Prerequisites:** Story 3.5

---

**Story 3.10: Now Board Header**

As a leader,
I want a summary bar showing the office pulse at a glance,
So that I can instantly see active beacons, key metrics, and filters.

**Acceptance Criteria:**
1. `NowBoard` component at top of floor plan
2. Shows: total spaces, active users, beacons count
3. Filter chips for neighborhoods
4. Search input for finding spaces
5. Live beacon alerts with severity icons
6. `aria-live` region for screen reader announcements

**Prerequisites:** Story 3.4, 3.5

---

**Story 3.11: Space Detail Hover Panel**

As a user,
I want detailed information about a space when I hover,
So that I can quickly see who's in a space and what's happening before I join.

**Acceptance Criteria:**
1. Hover on SpaceCard shows expanded details
2. Shows: full participant roster, agenda phase, activity log, transcript snippet
3. Primary action button (Join/Knock/Leave) prominent
4. Panel animation: smooth expand/collapse (200ms)
5. Click-stop protocol honored (data-avatar-interactive)
6. Mobile: tap to expand (bottom sheet pattern)

**Prerequisites:** Story 3.2

---

**Story 3.12: Space Capacity and "Room Full" Handling**

As a user,
I want clear visual indication when a space is at capacity,
So that I don't try to join full spaces and get blocked.

**Acceptance Criteria:**
1. Occupancy count visible on card (e.g., "6 Active")
2. Full spaces have visual treatment (dimmed, "Full" badge)
3. "Join" button disabled for full spaces with tooltip
4. Beacon triggers automatically at 80% capacity
5. Capacity validation enforced in API

**Prerequisites:** Story 3.2, 3.4

---

**Story 3.13: Real-Time Presence Animation**

As a user,
I want smooth animations when colleagues enter or exit spaces,
So that the floor plan feels alive and updates feel natural.

**Acceptance Criteria:**
1. Avatar fade-in when entering (300ms transition)
2. Avatar fade-out when leaving
3. Speaking status ring animates smoothly
4. Beacon pulses sync with presence changes
5. Performance: animations maintain 60 FPS with 20+ users

**Prerequisites:** Story 3.3

---

**Story 3.14: Mobile-Responsive Floor Plan**

As a mobile user,
I want to view and navigate the floor plan on my phone,
So that I can see team presence even when away from my desktop.

**Acceptance Criteria:**
1. Single-column card layout on mobile (<768px)
2. Touch gestures: tap to expand card details
3. Bottom sheet for space detail panel
4. Simplified controls bar (stacked layout)
5. Theme switching works on mobile
6. Performance acceptable on mid-range phones (30 FPS)

**Prerequisites:** Story 3.5, 3.11

---

**Story 3.15: Knock to Enter Workflow**

As a user,
I want to request access to restricted spaces by "knocking",
So that I can join private meetings when appropriate.

**Acceptance Criteria:**
1. Restricted spaces show "Knock to Enter" button instead of "Join" in SpaceCard hover panel
2. Clicking "Knock" sends notification to ALL users currently inside the space
3. All space occupants receive toast notification + sound with requester name and approve/deny buttons
4. ANY occupant can approve or deny the knock request
5. On approval: Requester receives success notification and is auto-joined to space
6. On denial: Requester receives "Access denied" notification
7. Pending knocks show "Waiting for approval..." status on the button
8. Knock expires after 5 minutes with timeout notification to requester

**Prerequisites:** Story 3.11

---

**Story 3.16: Auto-Remove Offline Users from Space Display**

As a user,
I want offline users to automatically disappear from the space view,
So that I only see who is actually present right now (Sococo-style behavior).

**Acceptance Criteria:**
1. When a user goes offline, their avatar is REMOVED from the space floor plan within 5 seconds
2. Offline users remain visible in DM/messaging contexts (to send offline messages)
3. Space occupant count updates immediately when user disconnects
4. `space_presence` table is updated on disconnect (user removed from space)
5. `space_presence_log` records the exit event with `exited_at` timestamp
6. UI shows smooth fade-out animation when avatar is removed
7. Reconnecting user (within grace period) returns to their last space automatically (see Story 3.17)

**Prerequisites:** Story 3.3 (Avatar Constellation)

---

**Story 3.17: Default Space Assignment & Reconnection Grace Period**

As an admin,
I want to assign default spaces to users and departments,
So that team members automatically appear in the right location.

As a user,
I want to return to my last space if my connection drops briefly,
So that I don't lose my context after network glitches.

**Acceptance Criteria:**
1. Admin can set a "default space" for each user in user management panel
2. Company can designate one space as the "company default" for first-time users
3. First-time users with no assigned space are placed in the company default space
4. Users can only be "inside" one space at a time (enforced at data layer)
5. When connection drops, system waits 5 minutes before removing user from space
6. If user reconnects within 5 minutes, they auto-rejoin their last space
7. After 5-minute timeout, user is removed from space (Story 3.16 behavior)
8. `users` table has `default_space_id` column
9. `companies` table has `default_space_id` column (company-wide default)

**Prerequisites:** Story 3.16, Epic 2 (company management)

---

**Epic 3 Summary:**
- **Total Stories:** 17
- **Estimated Effort:** 60-80 hours
- **Priority Stories:** 3.1 (Theme), 3.2 (SpaceCard), 3.3 (Avatars), 3.5 (Orbit Layout), 3.16 (Offline Removal), 3.17 (Default Space)
- **Design References:** `docs/ux-design-specification.md`, `docs/ux-space-grid-v2.html`
- **Key Risk:** CSS complexity for themes, performance of animated DOM elements, reconnection edge cases

---

## Epic 8A: Audio MVP (Sococo-Style) 🚧 URGENT

**Goal:** implement "simples assim" audio conversation. When a user enters a space, they can hear others. Mic defaults to muted. speaking indicator shows who is talking.

**Architecture:** P2P Mesh (Limit ~8 users/room). Signaling via Supabase Realtime.

**Stories (4 total)**

---

**Story 8A.1: WebRTC Manager & Signaling** ⭐ PRIORITY

As a developer,
I want to establish P2P connections between users in the same space,
So that audio streams can be exchanged directly.

**Acceptance Criteria:**
1.  `WebRTCManager` class handles `RTCPeerConnection` creation/teardown
2.  Signaling via `supabase.channel` (events: `signal`, `handshake`)
3.  On user join: send `handshake` -> receive `offers` -> send `answers`
4.  Handle ICE candidates exchange
5.  Clean up connections on user leave
6.  Limit: Show warning toast if >8 users in room ("Audio quality may degrade")

**Prerequisites:** Epic 1 (Realtime foundation)

---

**Story 8A.2: Audio Stream Handling & Permissions**

As a user,
I want to grant microphone access once,
So that I can be heard when I unmnute.

**Acceptance Criteria:**
1.  Request `navigator.mediaDevices.getUserMedia({ audio: true })` on first join
2.  Handle permission denied with helpful UI instruction
3.  Manage local `MediaStream` (keep active across room changes if desired, or re-request)
4.  Play remote audio streams via hidden `<audio>` elements
5.  Audio routing logic: Ensure audio output device selection works (browser default)

**Prerequisites:** Story 8A.1

---

**Story 8A.3: Speaking Indicator (Visualizer)**

As a user,
I want to see who is talking,
So that I can follow the conversation naturally.

**Acceptance Criteria:**
1.  Use `AudioContext` + `AnalyserNode` on remote streams
2.  Detect volume amplitude > threshold (e.g., -50dB)
3.  Update local React state `isSpeaking` for that user
4.  Trigger `AvatarConstellation` pulse animation (reusing Story 3.3 visual)
5.  Zero network traffic for this (purely client-side analysis)

**Prerequisites:** Story 8A.2, Story 3.3

---

**Story 8A.4: Mic Controls & Default State**

As a user,
I want to control my microphone status,
So that I don't broadcast background noise accidentally.

**Acceptance Criteria:**
1.  Default state on room entry: **MUTED**
2.  Mic toggle button in "Now Board" or Space Controls
3.  Sync mute state to other users via Supabase Presence (`is_muted` metadata)
4.  Show "Muted" icon on avatar when `is_muted: true`
5.  Hotkeys: `M` to toggle mute, Spacebar (PTT - nice to have)

**Prerequisites:** Story 8A.2

---

## Epic 8B: Enhanced Communication Tools (Video/Screen) ⏳ PLANNED

**Expanded Goal:**
Deliver user-facing messaging features to achieve feature parity with Slack/Teams: threaded conversations, reactions, message pins/stars, read receipts, infinite scroll, file attachments, voice notes, and conversation search. This epic focuses on the Timeline and Composer user experience.

**Value Delivery:**
This epic completes the core messaging UX, enabling teams to communicate with the same richness they expect from modern chat tools, making Virtual Office a viable Slack/Teams replacement.

**Task Alignment:** Tasks 2.5 + 3.0 from `tasks/tasks-0001-prd-unified-messaging-system.md`

**Current Status:**
- ✅ **Foundation Complete (Tasks 1.0 + 2.0):** Data contracts, APIs, unified drawer shell, conversation grouping
- 🚧 **In Progress:** Timeline UI rendering and composer features
- ⚠️ **Testing Strategy:** Manual testing only for investor demo - automated tests deferred to Epic 4B

### Stories (11 total - functional features only)

**Remaining Stories (Tasks 3.0 - Timeline & Composer Features):**

---

**Story 4A.1: Render Reply Indicators and Thread UI** (Task 3.1)

As a user,
I want to see reply threads visually in the message timeline,
So that I can follow conversation flow and respond to specific messages.

**Acceptance Criteria:**
1. Messages with replies show reply count badge (e.g., "3 replies")
2. Click reply badge expands thread inline (indented messages)
3. Thread UI shows parent message at top with replies below
4. "Reply" button on each message opens composer in reply mode
5. Reply composer shows preview of message being replied to with cancel option

**Manual Testing Checklist:**
- [ ] Verify reply thread display in drawer
- [ ] Test reply composition and thread expansion
- [ ] Verify real-time updates when others reply
- [ ] Check thread UI on different screen sizes

**Prerequisites:** Foundation complete (Tasks 1.0 + 2.0)

---

**Story 4A.2: Reaction Chips and Emoji Picker** (Task 3.1)

As a user,
I want to add emoji reactions to messages,
So that I can quickly respond without typing full messages.

**Acceptance Criteria:**
1. Hover over message shows reaction button (+emoji icon)
2. Click reaction button opens emoji picker popover
3. Emoji picker shows frequently used + all emojis with search
4. Selected emoji appears as reaction chip below message with count (👍 3)
5. Click existing reaction chip toggles user's reaction on/off
6. Reactions update in real-time for all participants

**Manual Testing Checklist:**
- [ ] Test emoji picker opens and closes correctly
- [ ] Verify reaction chips display with correct counts
- [ ] Test toggling reactions on/off
- [ ] Verify real-time reaction updates across users

**Prerequisites:** Story 4A.1

---

**Story 4A.3: Pinned and Starred Message Indicators** (Task 3.1)

As a user,
I want to pin important messages and star messages for later reference,
So that I can quickly find key information in busy conversations.

**Acceptance Criteria:**
1. Message context menu includes "Pin Message" and "Star Message" options
2. Pinned messages show pin icon and appear in "Pinned Messages" section at top of feed
3. Starred messages show star icon and are accessible via "Starred" filter
4. Unpin/unstar options available in context menu
5. Pin/star actions persist via API (`POST /api/messages/pin`, `/api/messages/star`)

**Manual Testing Checklist:**
- [ ] Test pin/star via context menu
- [ ] Verify pinned messages section displays correctly
- [ ] Test starred filter functionality
- [ ] Verify persistence after page refresh

**Prerequisites:** Story 4A.2

---

**Story 4A.4: Read Receipts Display** (Task 3.1)

As a user,
I want to see who has read my messages,
So that I know if my team saw important information.

**Acceptance Criteria:**
1. Sent messages show read status: "Sent", "Delivered", "Read by 3"
2. Hover over "Read by 3" shows tooltip with names and timestamps
3. DMs show specific read receipt: "Read by Jane at 2:45 PM"
4. Read receipts update in real-time as others view messages
5. Read receipt data fetched from `message_read_receipts` table

**Manual Testing Checklist:**
- [ ] Verify read status indicators display correctly
- [ ] Test tooltip showing reader names and timestamps
- [ ] Verify real-time updates as messages are read
- [ ] Test DM-specific read receipts

**Prerequisites:** Story 4A.3

---

**Story 4A.5: Infinite Scroll with Pagination** (Task 3.2)

As a user,
I want to scroll up through message history infinitely,
So that I can access old conversations without pagination buttons.

**Acceptance Criteria:**
1. Initial load shows last 50 messages
2. Scrolling to top triggers automatic load of older messages (50 more)
3. Loading indicator appears during fetch
4. Scroll position maintained after new messages load (no jump)
5. Performance: smooth scrolling with 500+ messages in conversation

**Manual Testing Checklist:**
- [ ] Test initial message load (last 50)
- [ ] Scroll to top and verify older messages load
- [ ] Verify scroll position doesn't jump
- [ ] Test with large conversation (100+ messages)

**Prerequisites:** Story 4A.4

---

**Story 4A.6: Auto-Scroll to New Messages with Indicator** (Task 3.2)

As a user,
I want the feed to auto-scroll when new messages arrive,
So that I see new content without manual scrolling.

**Acceptance Criteria:**
1. If user is near bottom (within 100px), auto-scroll to new message
2. If user is scrolled up, show "New Messages" button at bottom (floating)
3. Click "New Messages" button scrolls to bottom and marks messages read
4. Button shows count of unread messages (e.g., "3 new messages")
5. Auto-scroll respects user intent (doesn't scroll if user actively reading old messages)

**Manual Testing Checklist:**
- [ ] Test auto-scroll when at bottom
- [ ] Test "New Messages" button when scrolled up
- [ ] Verify button shows correct unread count
- [ ] Test that auto-scroll respects user intent

**Prerequisites:** Story 4A.5

---

**Story 4A.7: File Attachment Drag-and-Drop** (Task 3.3)

As a user,
I want to drag files into the composer to attach them,
So that I can share documents, images, and files easily.

**Acceptance Criteria:**
1. Drag file over composer shows drop zone with visual highlight
2. Drop file triggers upload to Supabase Storage
3. Upload progress indicator shows percentage
4. Attached file appears as preview chip with filename, size, and remove button
5. Send message includes attachment metadata in `message_attachments` table
6. Supported file types: images (jpg, png, gif), docs (pdf, docx), archives (zip)
7. Max file size: 10 MB per attachment

**Manual Testing Checklist:**
- [ ] Test drag-and-drop file upload
- [ ] Verify upload progress indicator
- [ ] Test file preview chip and remove button
- [ ] Test various file types (images, docs, archives)
- [ ] Test file size limit (10 MB)

**Prerequisites:** Story 4A.6

---

**Story 4A.8: File Attachment Preview** (Task 3.3)

As a user,
I want to preview attachments inline in the message feed,
So that I can view images and files without downloading.

**Acceptance Criteria:**
1. Image attachments display thumbnail in message (click to enlarge)
2. PDF attachments show first page preview
3. Other files show icon with filename and download button
4. Click image opens lightbox viewer with zoom controls
5. Download button triggers secure file download from Supabase Storage URL

**Manual Testing Checklist:**
- [ ] Test image thumbnail display and lightbox
- [ ] Test PDF preview rendering
- [ ] Test file download functionality
- [ ] Verify lightbox zoom controls work

**Prerequisites:** Story 4A.7

---

**Story 4A.9: Voice Note Recording** (Task 3.3)

As a user,
I want to record and send voice notes,
So that I can communicate quickly when typing is inconvenient.

**Acceptance Criteria:**
1. Microphone button in composer starts recording (request permission if needed)
2. Recording UI shows waveform visualization and duration counter
3. Stop button ends recording and shows playback preview
4. Send button uploads voice note to Supabase Storage and sends message
5. Voice notes display in feed with play/pause button and waveform
6. Voice note metadata stored in `message_attachments` table with `type: voice_note`

**Manual Testing Checklist:**
- [ ] Test microphone permission request
- [ ] Test recording with waveform visualization
- [ ] Test playback preview before sending
- [ ] Verify voice note upload and display in feed
- [ ] Test on different browsers (Chrome, Firefox, Safari)

**Prerequisites:** Story 4A.8

---

**Story 4A.10: Conversation Search** (Task 3.4)

As a user,
I want to search within a conversation for specific messages,
So that I can find past information quickly.

**Acceptance Criteria:**
1. Search input at top of message feed
2. Type query → real-time search highlights matching messages
3. Search matches message content, sender name, and attachment filenames
4. Jump to next/previous match with arrow buttons
5. Search persists across scrolling (maintains highlights)
6. Clear search button restores normal view

**Manual Testing Checklist:**
- [ ] Test search with various keywords
- [ ] Verify real-time highlighting
- [ ] Test next/previous navigation
- [ ] Verify search persists during scroll
- [ ] Test clear search functionality

**Prerequisites:** Story 4A.9

---

**Story 4A.11: Starred Messages Filter** (Task 3.4)

As a user,
I want to filter the feed to show only starred messages,
So that I can review important messages I've saved.

**Acceptance Criteria:**
1. "Show Starred Only" toggle button above feed
2. When enabled, feed displays only messages user has starred
3. Starred messages show in chronological order with context (conversation name)
4. Disable toggle returns to full conversation view
5. Starred filter works alongside search (can search within starred)

**Manual Testing Checklist:**
- [ ] Test starred filter toggle
- [ ] Verify only starred messages display when enabled
- [ ] Test chronological ordering
- [ ] Test filter combined with search

**Prerequisites:** Story 4A.10

---

**Epic 4A Summary:**
- **Total Stories:** 11 (functional features only)
- **Estimated Effort:** 22-30 hours
- **Testing Strategy:** Manual testing only - automated E2E tests deferred to Epic 4B
- **Dependencies:** Supabase Storage, Web APIs (MediaRecorder for voice notes)
- **Key Risk:** Attachment handling and voice note encoding across browsers
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Task 3.0
- **Change Note:** Story 4A.1 (Playwright tests) removed to unblock investor demo - automated testing moved to Epic 4B.8

---

## Epic 4B: Real-Time Messaging - Resilience & Scale 🚧 PLANNED

**Expanded Goal:**
Ensure enterprise-grade messaging reliability with offline resilience, reconnection handling, multi-client synchronization, and observability. Deliver analytics, notifications, and comprehensive testing to make messaging production-ready at scale.

**Value Delivery:**
This epic transforms messaging from functional to enterprise-ready, ensuring users never lose messages during network issues and admins have visibility into messaging health and engagement.

**Task Alignment:** Tasks 4.0 + 5.0 from `tasks/tasks-0001-prd-unified-messaging-system.md`

**Dependencies:** Epic 4A complete (Timeline & Composer features functional)

### Stories (8 total; Stories 4B.1-4B.8 = Original 4.23-4.30)

---

**Story 4B.1: Offline Message Queue** (Task 4.2)

As a user,
I want my messages to send automatically when my internet reconnects,
So that I don't lose messages during network interruptions.

**Acceptance Criteria:**
1. When offline, sent messages go to queue in `localStorage` with pending status
2. Messages show "Sending..." indicator in feed (gray checkmark)
3. On reconnect, queue automatically sends pending messages in order
4. Failed sends show "Failed to send" with retry button
5. Queue persists across page refreshes (stored in `localStorage`)

**Prerequisites:** Epic 4A complete

---

**Story 4B.2: Realtime Reconnection with Exponential Backoff** (Task 4.1)

As a developer,
I want Supabase Realtime to reconnect automatically with smart backoff,
So that users have a reliable real-time experience even with unstable networks.

**Acceptance Criteria:**
1. Detect Realtime connection loss via subscription status events
2. Attempt reconnection with exponential backoff: 1s, 2s, 4s, 8s, max 30s
3. Show connection status indicator in UI (connected/reconnecting/offline)
4. On reconnect, re-subscribe to all active channels (conversations, presence)
5. Fetch missed messages via polling for gap period
6. Log reconnection events for debugging

**Prerequisites:** Story 4B.1

---

**Story 4B.3: Polling Fallback for Missed Messages** (Task 4.3)

As a user,
I want the app to fetch missed messages when real-time is unavailable,
So that I don't miss important conversations.

**Acceptance Criteria:**
1. When Realtime is disconnected >30s, start polling API every 10s
2. Fetch messages newer than last received timestamp
3. Insert fetched messages into feed with proper ordering
4. Stop polling when Realtime reconnects
5. Polling respects rate limits (max 6 requests/minute)

**Prerequisites:** Story 4B.2

---

**Story 4B.4: Typing Indicators** (Task 4.4)

As a user,
I want to see when others are typing,
So that I know a response is coming and avoid interrupting.

**Acceptance Criteria:**
1. Typing in composer triggers typing event to Supabase Realtime channel
2. Other participants see "Jane is typing..." below message feed
3. Typing indicator shows for 3 seconds after last keystroke
4. Multiple typists show: "Jane, Bob, and Alice are typing..."
5. Typing events throttled (max 1 per second to avoid spam)

**Prerequisites:** Story 4B.3

---

**Story 4B.5: Multi-Client Read Receipt Sync** (Task 4.4)

As a user with multiple devices,
I want read receipts to sync across my devices,
So that messages marked read on desktop also show read on mobile.

**Acceptance Criteria:**
1. Mark message as read on device A → Read receipt updates via Realtime on device B
2. Opening conversation on any device marks all messages as read
3. Read status persists in `message_read_receipts` table per user
4. Unread count badge updates in real-time across devices
5. Race condition handling: last-write-wins for read timestamps

**Prerequisites:** Story 4B.4

---

**Story 4B.6: Messaging Analytics Events** (Task 5.1)

As a product manager,
I want analytics on message latency and engagement,
So that I can monitor messaging health and optimize performance.

**Acceptance Criteria:**
1. Track metrics: message send latency, delivery time, read time
2. Log events: message sent, message read, reaction added, file uploaded
3. Metrics emitted via `debugLogger.messaging` with structured format
4. Events include metadata: conversation_id, user_id, message_type, timestamp
5. Analytics dashboard (future) can query these logs

**Prerequisites:** Story 4B.5

---

**Story 4B.7: Desktop Notifications** (Task 5.3)

As a user,
I want desktop notifications for new messages when the app isn't focused,
So that I don't miss important communications.

**Acceptance Criteria:**
1. Request notification permission on first message received
2. Show notification for new DMs when app is in background (title, preview, avatar)
3. Show notification for @mentions in spaces
4. Click notification focuses app and opens relevant conversation in drawer
5. Respect user preferences (can disable notifications per conversation)
6. Notifications muted when user is actively viewing the conversation

**Manual Testing Checklist:**
- [ ] Test notification permission request flow
- [ ] Verify DM notifications show when app in background
- [ ] Test @mention notifications in spaces
- [ ] Verify clicking notification opens correct conversation
- [ ] Test notification preferences per conversation

**Prerequisites:** Story 4B.6

---

**Epic 4B Summary:**
- **Total Stories:** 7 (all functional)
- **Estimated Effort:** 14-20 hours
- **Testing Strategy:** Manual testing only - no automated tests
- **Dependencies:** Supabase Realtime, Web APIs (Notifications API)
- **Key Risk:** Offline reliability and reconnection complexity - thorough manual testing required
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Tasks 4.0 + 5.0
- **Change Note:** All automated testing eliminated - Playwright incompatible with Supabase tech stack complexity

---

**Combined Epic 4A + 4B Summary:**
- **Total Stories:** 18 functional stories (4A: 11 stories, 4B: 7 stories)
- **Combined Effort:** 36-50 hours
- **Testing Strategy:** Manual testing only - no automated tests
- **Implementation Order:** Complete Epic 4A first (user-facing features), then Epic 4B (resilience/scale)
- **Original Epic 4 Stories 4.1-4.10:** Complete (Tasks 1.0 + 2.0)
- **Remaining Stories:** 4A.1-4A.11 (Timeline/Composer) + 4B.1-4B.7 (Resilience/Scale)
- **Change Note:** All automated testing eliminated per technical assessment - Playwright incompatible with Supabase Realtime complexity

---

## Epic 5: Meeting Notes System 🚧 IN PROGRESS

**Expanded Goal:**
Enable seamless meeting note capture with AI-powered summaries and action item tracking for **external meetings** (Zoom, Google Meet, Microsoft Teams). Users can upload transcripts from third-party meeting tools and leverage AI to generate summaries and extract action items automatically. This makes Epic 5 valuable immediately without waiting for Epic 8's native video conferencing.

**Value Delivery:**
This epic reduces meeting overhead by automating note-taking and action tracking for external meetings, freeing participants to focus on discussion rather than documentation. Once Epic 8 (native video conferencing) is complete, the meeting notes system will seamlessly integrate with Virtual Office's native meetings.

**Current Status:** UI complete, AI integration pending

**Implementation Note:** This epic is designed to work with **external meeting transcripts** initially. When Epic 8 (Enhanced Communication Tools with WebRTC video conferencing) is implemented, native Virtual Office meetings will automatically integrate with the meeting notes system, enabling one-click transcript capture for internal meetings.

### Stories (6-10 total)

**Story 5.1: Meeting Note Creation UI**

As a user,
I want to create a meeting note for a space,
So that I can document discussions and decisions.

**Acceptance Criteria:**
1. "Create Meeting Note" button in space detail panel
2. Form includes: title, meeting date/time, participants (auto-populated from space)
3. Rich text editor for note content (markdown support)
4. Save button stores note in `meeting_notes` table
5. Note appears in space's "Meeting History" section

**Prerequisites:** None (standalone UI component)

---

**Story 5.2: Action Item Tracking**

As a meeting participant,
I want to add action items with assignees and due dates,
So that we track commitments made during meetings.

**Acceptance Criteria:**
1. Action item section in note editor (add/remove items dynamically)
2. Each item includes: description, assignee (dropdown of company users), due date, status (pending/completed)
3. Action items saved in `meeting_note_action_items` table with foreign key to note
4. Assigned users receive notification of new action items
5. Action items appear in user's personal dashboard/task list

**Prerequisites:** Story 5.1

---

**Story 5.3: Meeting Note Viewing and Editing**

As a user,
I want to view and edit past meeting notes,
So that I can reference decisions and update action items.

**Acceptance Criteria:**
1. Meeting notes list view shows all notes for a space (sorted by date, newest first)
2. Click note opens detail view with full content and action items
3. Edit button (for note creator or admin) allows editing content
4. Version history tracks edits (edited_by, timestamp)
5. Delete note option with confirmation dialog

**Prerequisites:** Story 5.2

---

**Story 5.4: AI Meeting Transcript Upload (External Meetings)** (Placeholder)

As a user,
I want to upload a meeting transcript from external tools (Zoom, Google Meet, Microsoft Teams),
So that AI can generate summaries and action items automatically for meetings held outside Virtual Office.

**Acceptance Criteria:**
1. Upload .txt or .vtt transcript file from external meeting platforms (Zoom, Google Meet, Microsoft Teams, etc.)
2. Transcript stored in `meeting_notes.transcript` field
3. "Generate Summary" button triggers AI processing
4. Loading indicator while AI processes (expected 10-30 seconds)
5. Error handling for failed AI calls (timeout, API errors)
6. Support for common transcript formats: plain text (.txt), WebVTT (.vtt), SRT (.srt)

**Implementation Note:** This story focuses on external meeting transcripts. When Epic 8 (native video conferencing) is complete, transcripts from Virtual Office meetings will be automatically available without manual upload.

**Prerequisites:** Story 5.3

---

**Story 5.5: AI-Generated Summary** (Placeholder - AI Service Integration)

As a user,
I want AI to generate a concise summary from the transcript,
So that I can quickly review key points without reading the full transcript.

**Acceptance Criteria:**
1. AI extracts key discussion points, decisions, and next steps
2. Summary formatted in markdown (bullet points, sections)
3. Summary saved in `meeting_notes.summary` field
4. User can edit AI-generated summary before saving
5. Regenerate summary option if initial result unsatisfactory
6. AI service: OpenAI GPT-4 or Anthropic Claude API

**Prerequisites:** Story 5.4

---

**Story 5.6: AI Action Item Extraction** (Placeholder - AI Service Integration)

As a user,
I want AI to automatically extract action items from the transcript,
So that I don't miss commitments made during discussions.

**Acceptance Criteria:**
1. AI identifies action items with format "Action: [description], Assignee: [name], Due: [date]"
2. Extracted items pre-populate action item section
3. User reviews and confirms items before saving
4. AI suggests assignees based on names mentioned in transcript
5. Fall back to manual assignment if AI can't determine assignee

**Prerequisites:** Story 5.5

---

**Story 5.7: Meeting Note Search**

As a user,
I want to search across all meeting notes,
So that I can find past discussions and decisions quickly.

**Acceptance Criteria:**
1. Search input in meeting notes list view
2. Search across title, content, summary, and action item descriptions
3. Results highlight matching text
4. Filter by date range, space, or assignee
5. Search index updates in real-time as notes are created/edited

**Prerequisites:** Story 5.3

---

**Story 5.8: Action Item Notifications and Reminders**

As a user,
I want notifications when I'm assigned action items and reminders as due dates approach,
So that I don't forget commitments.

**Acceptance Criteria:**
1. Notification when assigned new action item (email + in-app)
2. Daily digest of pending action items due within 3 days
3. Overdue reminder for items past due date
4. Mark item complete in UI → removes from reminders
5. Notification preferences configurable per user

**Prerequisites:** Story 5.2

---

**Epic 5 Summary:**
- **Total Stories:** 8
- **Estimated Effort:** 16-24 hours
- **Dependencies:** AI API (OpenAI/Anthropic for Stories 5.5-5.6)
- **Key Risk:** AI accuracy for action item extraction - may need manual review workflow

---

## Epic 6: Announcement System 🚧 IN PROGRESS

**Expanded Goal:**
Provide a company-wide announcement system with priority levels, expiration dates, and filtering to ensure important updates reach the entire team effectively.

**Value Delivery:**
This epic centralizes company communications, reducing reliance on email blasts and ensuring critical updates are visible to all team members in the virtual office.

**Current Status:** Basic posting functional, filtering pending

### Stories (4-6 total)

**Story 6.1: Announcement Creation (Admin)**

As an admin,
I want to post company-wide announcements,
So that I can share important updates with the entire team.

**Acceptance Criteria:**
1. "Create Announcement" button in admin dashboard
2. Form includes: title, content (rich text), priority (urgent/normal/low), expiration date (optional)
3. Preview mode shows how announcement will appear to users
4. Publish button saves to `announcements` table
5. All users see new announcement immediately (real-time via Supabase)

**Prerequisites:** None

---

**Story 6.2: Announcement Display for Users**

As a user,
I want to see company announcements prominently when I log in,
So that I don't miss important information.

**Acceptance Criteria:**
1. Announcement banner at top of dashboard for urgent announcements
2. Announcement center page shows all active announcements (sorted by priority then date)
3. Expired announcements automatically hidden from view
4. Read/unread status tracked per user
5. Dismiss button closes banner (but announcement still accessible in center)

**Prerequisites:** Story 6.1

---

**Story 6.3: Announcement Filtering and Search**

As a user,
I want to filter announcements by priority or search for specific topics,
So that I can find relevant information quickly.

**Acceptance Criteria:**
1. Filter dropdowns: priority (urgent/normal/low), date range, status (active/expired)
2. Search input matches title and content
3. Filters combine (AND logic): urgent + last 30 days + keyword
4. Clear filters button resets to show all announcements
5. Filter state persists in URL query params (shareable links)

**Prerequisites:** Story 6.2

---

**Story 6.4: Announcement Editing and Deletion**

As an admin,
I want to edit or delete announcements,
So that I can correct errors or remove outdated information.

**Acceptance Criteria:**
1. Edit button on announcement (admin only) opens edit form
2. Edited announcements show "Updated at [time]" indicator
3. Delete button with confirmation dialog
4. Deleted announcements removed from all users' views immediately
5. Audit log tracks edits and deletions (admin_id, action, timestamp)

**Prerequisites:** Story 6.1

---

**Story 6.5: Announcement Notifications**

As a user,
I want notifications for urgent announcements,
So that I don't miss critical company updates.

**Acceptance Criteria:**
1. Urgent announcements trigger desktop notification (if permissions granted)
2. Email notification sent for urgent announcements to all users
3. In-app notification badge shows unread announcement count
4. Notification includes announcement title and preview (first 100 characters)
5. Click notification opens announcement center

**Prerequisites:** Story 6.2

---

**Story 6.6: Announcement Analytics (Admin)**

As an admin,
I want to see how many users viewed each announcement,
So that I can gauge communication effectiveness.

**Acceptance Criteria:**
1. Admin view shows read count and percentage for each announcement
2. List of users who haven't read specific announcement (for urgent items)
3. Click-through tracking if announcement includes links
4. Export announcement metrics to CSV
5. Analytics stored in `announcement_views` table (user_id, announcement_id, viewed_at)

**Prerequisites:** Story 6.2

---

**Epic 6 Summary:**
- **Total Stories:** 6
- **Estimated Effort:** 12-18 hours
- **Dependencies:** Email service (for notifications), Supabase Realtime
- **Key Risk:** Email deliverability - need reliable SMTP provider

---

## Epic 7: AI-Powered Communication Enhancements ⏳ PLANNED

**Expanded Goal:**
Integrate advanced AI capabilities to enhance collaboration: real-time transcription, semantic search across all content, intelligent meeting summaries, and a context-aware AI assistant to help users find information and stay productive.

**Value Delivery:**
This epic differentiates Virtual Office from competitors by embedding AI deeply into workflows, reducing busywork and making communication more efficient.

**Dependencies:** Epic 5 complete (meeting notes infrastructure), AI service selection (OpenAI vs Anthropic)

### Stories (12-18 total)

**Story 7.1: AI Service Integration Setup**

As a developer,
I want a unified AI service layer,
So that we can easily switch between OpenAI and Anthropic APIs.

**Acceptance Criteria:**
1. Abstract AIService interface with methods: transcribe(), summarize(), search(), chat()
2. Implementations for OpenAI (GPT-4) and Anthropic (Claude)
3. Configuration to switch providers via environment variable
4. API key management in Supabase secrets
5. Error handling and retry logic for API failures
6. Rate limiting and cost tracking

**Prerequisites:** None

---

**Story 7.2: Real-Time Meeting Transcription**

As a meeting participant,
I want live transcription of our audio conversation,
So that we have accurate records and can follow along if I miss something.

**Acceptance Criteria:**
1. Enable transcription in meeting space (requires microphone permission)
2. Audio streamed to AI transcription service (OpenAI Whisper API)
3. Transcribed text appears in real-time below video/audio area
4. Speakers identified by voice (or labeled manually: "Speaker 1", "Speaker 2")
5. Full transcript saved in `meeting_notes.transcript` when meeting ends
6. Support multiple languages (English, Spanish, French, German)

**Prerequisites:** Story 7.1

---

**Story 7.3: Semantic Search Across Messages**

As a user,
I want to search for concepts, not just exact keywords,
So that I can find information even if I don't remember exact wording.

**Acceptance Criteria:**
1. Search input uses AI embeddings for semantic matching
2. Query "project deadline" matches messages about "due dates" and "delivery timeline"
3. Search across messages, meeting notes, and announcements
4. Results ranked by relevance (AI similarity score)
5. Fallback to keyword search if AI service unavailable
6. Embeddings generated and indexed for all new content (background job)

**Prerequisites:** Story 7.1

---

**Story 7.4: Intelligent Message Summarization**

As a user returning after time off,
I want AI to summarize conversations I missed,
So that I can catch up quickly without reading hundreds of messages.

**Acceptance Criteria:**
1. "Summarize unread" button in conversation header
2. AI generates summary of key points from unread messages (max 50 messages)
3. Summary highlights: decisions made, action items mentioned, questions asked
4. Summary presented in collapsible panel above message feed
5. Option to regenerate summary with different focus (e.g., "focus on decisions")

**Prerequisites:** Story 7.1

---

**Story 7.5: AI-Powered Meeting Recaps**

As a user,
I want an AI recap of meetings I attended,
So that I can review key points without re-watching recordings.

**Acceptance Criteria:**
1. "Generate Recap" button after meeting ends
2. AI analyzes transcript and generates recap with sections: Agenda, Decisions, Action Items, Next Steps
3. Recap saved in `meeting_notes.summary`
4. Attendees receive email with recap (opt-in setting)
5. Recap editable before sending

**Prerequisites:** Story 7.2, 7.4

---

**Story 7.6: Task and Reminder Extraction**

As a user,
I want AI to detect tasks mentioned in messages,
So that I don't miss commitments buried in conversations.

**Acceptance Criteria:**
1. AI scans messages for task patterns ("I'll", "we should", "need to", "@user can you")
2. Suggested tasks appear in sidebar with checkbox to confirm
3. Confirmed tasks added to user's task list with extracted context
4. Integration with action items from meetings (same task management UI)
5. Task extraction runs daily as background job

**Prerequisites:** Story 7.4

---

**Story 7.7: Smart Availability Predictions**

As a user,
I want AI to predict when colleagues will be available,
So that I can schedule discussions at optimal times.

**Acceptance Criteria:**
1. AI analyzes user presence history (from `space_presence_log`)
2. Predicts availability patterns: "Jane is usually online 9 AM - 5 PM EST"
3. Suggests best time to reach colleague (when both users likely online)
4. Availability predictions shown in user profile card
5. Prediction accuracy improves over time with more data

**Prerequisites:** Story 7.1

---

**Story 7.8: Context-Aware AI Assistant (Chat Interface)**

As a user,
I want to ask an AI assistant questions about my work,
So that I can find information without manual searching.

**Acceptance Criteria:**
1. AI assistant button opens chat panel (similar to messaging drawer)
2. User asks questions: "What did we decide about the pricing model?"
3. AI searches messages, meeting notes, announcements for relevant context
4. Responds with answer + source citations (links to specific messages/notes)
5. Conversation history persisted (user can reference previous questions)
6. Assistant respects user permissions (only searches content user can access)

**Prerequisites:** Story 7.3, 7.4

---

**Story 7.9: AI Translation for Global Teams**

As a global team member,
I want messages translated to my preferred language,
So that I can collaborate effectively across language barriers.

**Acceptance Criteria:**
1. User sets preferred language in profile settings
2. "Translate" button on messages in other languages
3. AI translates message and shows translation inline
4. Original message still visible (toggle between original and translation)
5. Real-time translation option (auto-translate all incoming messages)
6. Support 20+ languages via AI translation API

**Prerequisites:** Story 7.1

---

**Story 7.10: AI-Powered Search Suggestions**

As a user,
I want AI to suggest related searches and content,
So that I discover relevant information I might have missed.

**Acceptance Criteria:**
1. Search results include "Related" section with AI-suggested queries
2. "You might also be interested in" shows semantically similar messages/notes
3. Suggestions based on current search query + user's past interactions
4. Click suggestion runs new search or opens suggested content
5. Suggestions improve over time with user feedback (thumbs up/down)

**Prerequisites:** Story 7.3

---

**Story 7.11: AI Cost Monitoring and Limits**

As a product owner,
I want to monitor and control AI API costs,
So that we don't exceed budget on AI features.

**Acceptance Criteria:**
1. Dashboard shows AI usage: API calls, tokens consumed, cost per user
2. Configurable spending limits (daily/monthly caps)
3. Alerts when approaching limits (email to admin)
4. Graceful degradation when limits reached (disable AI features, show message to users)
5. Cost tracking stored in database for analytics

**Prerequisites:** Story 7.1

---

**Story 7.12: AI Feature Opt-Out**

As a privacy-conscious user,
I want to disable AI features for my data,
So that my messages aren't processed by third-party AI services.

**Acceptance Criteria:**
1. User settings include "Enable AI Features" toggle
2. When disabled, user's messages excluded from AI processing (transcription, search indexing, summaries)
3. User can still see AI-generated content from others (read-only)
4. Opt-out preference persisted in `users.preferences`
5. Clear explanation of what data AI processes (privacy notice)

**Prerequisites:** Story 7.1

---

**Epic 7 Summary:**
- **Total Stories:** 12
- **Estimated Effort:** 36-48 hours
- **Dependencies:** AI API (OpenAI GPT-4 or Anthropic Claude), Embeddings model, Whisper API
- **Key Risks:** AI costs can escalate quickly - need strict usage monitoring and limits

---

## Epic 8: Enhanced Communication Tools ⏳ PLANNED

**Expanded Goal:**
Add WebRTC-based video conferencing, screen sharing, and virtual whiteboard capabilities to enable synchronous collaboration directly within spaces, eliminating the need for external tools like Zoom.

**Value Delivery:**
This epic completes the collaboration suite, making Virtual Office a one-stop platform for remote team communication without switching between multiple apps.

**Dependencies:** Epic 4 complete (messaging foundation)

**Deferred Requirement (FR020):** Auto "In Meeting" status will be implemented in this epic - triggers when user starts video call or screen sharing, restores previous status when call ends.

### Stories (10-15 total)

**Story 8.1: WebRTC Infrastructure Setup**

As a developer,
I want a reliable WebRTC signaling infrastructure,
So that we can establish peer-to-peer video/audio connections.

**Acceptance Criteria:**
1. Signaling server using Socket.IO or Supabase Realtime for offer/answer exchange
2. STUN/TURN server configuration for NAT traversal (use Twilio or self-hosted coturn)
3. Connection quality monitoring (packet loss, latency, bandwidth)
4. Fallback to TURN relay if peer-to-peer fails
5. Support up to 10 simultaneous participants per space

**Prerequisites:** None

---

**Story 8.2: Audio-Only Calling**

As a user,
I want to start audio-only calls in a space,
So that I can have quick voice discussions without video overhead.

**Acceptance Criteria:**
1. "Start Call" button in space (microphone icon)
2. Audio-only mode uses less bandwidth than video
3. Participants see audio indicator (volume bars) for active speakers
4. Mute/unmute toggle with visual indicator
5. Leave call button ends connection gracefully

**Prerequisites:** Story 8.1

---

**Story 8.3: Video Conferencing**

As a user,
I want to enable video during calls,
So that I can see colleagues and have richer interactions.

**Acceptance Criteria:**
1. "Enable Video" button during call
2. Video tiles arranged in grid layout (up to 9 visible, gallery view)
3. Self-view mirror in corner with flip/disable option
4. Spotlight mode (featured speaker takes center, others in sidebar)
5. Video quality adapts to bandwidth (auto-downgrade if connection poor)

**Prerequisites:** Story 8.2

---

**Story 8.4: Screen Sharing**

As a user,
I want to share my screen during calls,
So that I can present work or collaborate on documents.

**Acceptance Criteria:**
1. "Share Screen" button during call
2. Select window/tab/entire screen to share
3. Shared screen appears in main video area for all participants
4. Screen sharer sees indicator that sharing is active
5. Stop sharing button ends screen share

**Prerequisites:** Story 8.3

---

**Story 8.5: Virtual Whiteboard**

As a team,
I want a shared whiteboard for brainstorming,
So that we can sketch ideas collaboratively during meetings.

**Acceptance Criteria:**
1. "Open Whiteboard" button in space opens canvas
2. Drawing tools: pen, highlighter, shapes, text, eraser
3. All participants see real-time updates (via WebSocket)
4. Save whiteboard as image (PNG export)
5. Whiteboard persists in space (reload shows previous content)

**Prerequisites:** Story 8.3

---

**Story 8.6: Call Recording**

As a meeting organizer,
I want to record calls for later reference,
So that absent team members can catch up.

**Acceptance Criteria:**
1. "Record" button (admin/organizer only)
2. All participants notified when recording starts
3. Recording captures audio, video, and screen shares
4. Recording saved to Supabase Storage
5. Recording accessible from meeting notes

**Prerequisites:** Story 8.3

---

**Story 8.7: Background Blur and Virtual Backgrounds**

As a user,
I want to blur my background or use virtual backgrounds,
So that I maintain privacy during video calls.

**Acceptance Criteria:**
1. Settings menu during call: Blur Background / None / Upload Image
2. Background processing uses client-side ML (TensorFlow.js or browser API)
3. Virtual backgrounds support custom images (company logos, scenes)
4. Performance: maintains 30 FPS video with background processing
5. Fallback to no processing on low-end devices

**Prerequisites:** Story 8.3

---

**Story 8.8: Call Quality Indicators**

As a user,
I want to see connection quality indicators,
So that I know if my audio/video is clear to others.

**Acceptance Criteria:**
1. Connection quality icon (green/yellow/red) near video tile
2. Tooltip shows details: latency (ms), packet loss (%), bandwidth (kbps)
3. Warning notification if quality degrades significantly
4. Suggestion to disable video or leave/rejoin if connection poor
5. Quality metrics logged for debugging

**Prerequisites:** Story 8.3

---

**Story 8.9: Picture-in-Picture Mode**

As a user,
I want to keep video call visible while using other apps,
So that I can multitask during meetings.

**Acceptance Criteria:**
1. "Pop-out" button opens call in floating window
2. Picture-in-picture window stays on top of other apps
3. Minimal controls visible in PiP: mute, video toggle, hang up
4. Click window to return to full Virtual Office interface
5. Browser Picture-in-Picture API for native support

**Prerequisites:** Story 8.3

---

**Story 8.10: Integration with Calendar (Future)**

As a user,
I want to schedule calls via calendar integration,
So that team members get invites and reminders.

**Acceptance Criteria:**
1. Google Calendar / Outlook integration (OAuth setup)
2. "Schedule Call" button creates calendar event with Virtual Office link
3. Event includes space link and auto-join time
4. Reminder notifications 5 minutes before scheduled call
5. Recurring meeting support

**Prerequisites:** Story 8.3

---

**Epic 8 Summary:**
- **Total Stories:** 10
- **Estimated Effort:** 30-45 hours
- **Dependencies:** WebRTC infrastructure, TURN server, TensorFlow.js (for backgrounds)
- **Key Risks:** WebRTC complexity and cross-platform compatibility - extensive testing needed

---

## Epic 9: Administrative Dashboard & Analytics ⏳ PLANNED

**Expanded Goal:**
Build a comprehensive admin dashboard providing insights into team collaboration, presence patterns, space utilization, and compliance reporting - empowering managers to optimize workflows and meet regulatory requirements.

**Value Delivery:**
This epic unlocks the management visibility that differentiates Virtual Office from consumer chat tools, enabling data-driven decisions and compliance with enterprise policies.

**Dependencies:** Epic 3, 4 complete (data collection exists in `space_presence_log` and messaging tables)

### Stories (8-12 total)

**Story 9.1: Admin Dashboard Home**

As an admin,
I want a dashboard overview of key metrics,
So that I can monitor team health and activity at a glance.

**Acceptance Criteria:**
1. Dashboard displays cards: active users (today), total messages (week), meeting hours (week), most used spaces
2. Trend graphs: daily active users (30 days), message volume over time
3. Quick links to detailed reports (presence, spaces, messages)
4. Real-time updates (metrics refresh every 30 seconds)
5. Role-based access: only admins see dashboard

**Prerequisites:** None

---

**Story 9.2: Presence Report Generation**

As a manager,
I want to generate reports showing user online/offline/busy/meeting hours,
So that I can track team working patterns for compliance.

**Acceptance Criteria:**
1. Report builder: select date range, user(s), and granularity (daily/weekly/monthly)
2. Report shows table: user, online hours, busy hours, meeting hours, offline hours
3. Visual chart: stacked bar graph per user
4. Export to CSV with columns: user_id, date, status, hours
5. Data sourced from `space_presence_log` table

**Prerequisites:** Story 9.1

---

**Story 9.3: Space Utilization Analytics**

As an admin,
I want insights into how spaces are used,
So that I can optimize office layout and capacity planning.

**Acceptance Criteria:**
1. Heatmap showing peak usage times for each space (hour-by-hour grid)
2. Metrics: average occupancy, max occupancy reached, utilization rate (% of capacity used)
3. Identify underutilized spaces (usage <20% of time)
4. Identify overutilized spaces (frequently at capacity)
5. Suggestions: "Consider adding a second Marketing room" (usage >80%)

**Prerequisites:** Story 9.1

---

**Story 9.4: User Activity Timeline**

As a manager,
I want to see a specific user's activity timeline,
So that I can understand their work patterns and collaboration.

**Acceptance Criteria:**
1. User search/select dropdown
2. Timeline view: entries for space joins/exits, messages sent, meetings attended
3. Filter by date range and activity type
4. Timeline shows duration spent in each space
5. Export timeline to PDF or CSV

**Prerequisites:** Story 9.2

---

**Story 9.5: Team Collaboration Patterns**

As an admin,
I want insights into who collaborates with whom,
So that I can identify silos and encourage cross-team interaction.

**Acceptance Criteria:**
1. Network graph showing users as nodes, collaboration frequency as edge thickness
2. Metrics: most frequent collaborators, cross-department interactions
3. Identify isolated users (low collaboration)
4. Department-level view: which departments collaborate most
5. Data from shared spaces, DM frequency, meeting co-attendance

**Prerequisites:** Story 9.3

---

**Story 9.6: Message Analytics**

As an admin,
I want analytics on messaging usage,
So that I can assess engagement and identify communication bottlenecks.

**Acceptance Criteria:**
1. Metrics: total messages (by day/week/month), messages per user, messages per space
2. Peak messaging times (heatmap by hour/day of week)
3. Average response time in DMs and space conversations
4. Identify silent users (low message activity) for engagement outreach
5. Filter by space, user, or date range

**Prerequisites:** Story 9.1

---

**Story 9.7: Compliance Audit Export**

As a compliance officer,
I want to export detailed activity logs,
So that I can provide audit trails to regulators.

**Acceptance Criteria:**
1. Audit export includes: user activity, message metadata (not content unless legally required), space access logs
2. Filter by user, date range, activity type (login, space entry, message sent)
3. Export format: CSV with columns: timestamp, user_id, action, metadata, ip_address (if logged)
4. Encrypted export option for sensitive data
5. Audit log of exports (who exported what data, when)

**Prerequisites:** Story 9.2, 9.4

---

**Story 9.8: Custom Report Builder**

As an admin,
I want to create custom reports with selected metrics,
So that I can answer specific business questions.

**Acceptance Criteria:**
1. Report builder UI: drag-and-drop metrics, dimensions, filters
2. Available metrics: presence hours, message counts, space usage, meeting duration
3. Dimensions: user, space, department, time period
4. Save report templates for reuse
5. Schedule automated reports (daily/weekly email delivery)

**Prerequisites:** Story 9.6

---

**Story 9.9: Real-Time Monitoring View**

As an admin,
I want a real-time view of current activity,
So that I can monitor the virtual office live.

**Acceptance Criteria:**
1. Live view shows: users currently online, active spaces, ongoing calls
2. Map view: see all users on floor plan with current locations
3. Activity feed: recent events (user joined space, message sent, call started)
4. Alerts for anomalies (sudden spike in activity, user inactive for 48 hours)
5. Updates in real-time via Supabase Realtime subscriptions

**Prerequisites:** Story 9.1

---

**Story 9.10: Performance and Health Metrics**

As a developer,
I want system performance metrics,
So that I can monitor Virtual Office health and optimize infrastructure.

**Acceptance Criteria:**
1. Metrics dashboard: API response times, database query performance, Realtime connection count
2. Error rate monitoring (failed API calls, Realtime disconnects)
3. Alerts for performance degradation (p95 latency >500ms, error rate >5%)
4. Integration with monitoring tools (Datadog, New Relic, or custom)
5. Uptime tracking and SLA reporting

**Prerequisites:** Story 9.1

---

**Story 9.11: User Management Tools**

As an admin,
I want tools to manage users efficiently,
So that I can handle onboarding, offboarding, and role changes.

**Acceptance Criteria:**
1. User list view with filters (role, status, department)
2. Bulk actions: deactivate users, change roles, send announcements
3. User detail view: activity summary, permissions, assigned spaces
4. Deactivate user option (soft delete, data retained for audit)
5. Reactivate user option (restore access)

**Prerequisites:** Story 9.1

---

**Story 9.12: Data Retention and Privacy Controls**

As an admin,
I want to configure data retention policies,
So that we comply with GDPR and company policies.

**Acceptance Criteria:**
1. Settings for message retention: 30 days, 90 days, 1 year, indefinite
2. Automatic deletion of old messages based on policy
3. User data export tool (GDPR right to data portability)
4. User data deletion tool (GDPR right to erasure)
5. Audit log of all privacy-related actions

**Prerequisites:** Story 9.7

---

**Epic 9 Summary:**
- **Total Stories:** 12
- **Estimated Effort:** 36-48 hours
- **Dependencies:** Analytics infrastructure, data aggregation jobs, charting library (Recharts/Chart.js)
- **Key Risks:** Performance with large datasets - need efficient database queries and caching

---

## Epic 10: MERGED INTO EPIC 3

> **Note:** Epic 10 (Advanced UX & Theming - Unleashed) has been merged into Epic 3 (Visual Experience & Floor Plan) as of 2025-11-25. All "Reality Distortion" theme system, Orbit Gallery, Avatar Constellation, and layout stories are now part of Epic 3.
>
> This merger prioritizes visual polish for investor demos while eliminating duplicate work between the two epics.

---

## Story Guidelines Reference

**Story Format:**

```
**Story [EPIC.N]: [Story Title]**

As a [user type],
I want [goal/desire],
So that [benefit/value].

**Acceptance Criteria:**
1. [Specific testable criterion]
2. [Another specific criterion]
3. [etc.]

**Prerequisites:** [Dependencies on previous stories, if any]
```

**Story Requirements:**
- **Vertical slices** - Complete, testable functionality delivery
- **Sequential ordering** - Logical progression within epic
- **No forward dependencies** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Integrate technical enablers into value-delivering stories

---

## Implementation Workflow

For each story:
1. Run `create-story` workflow (Scrum Master agent) to generate detailed implementation plan
2. Run `story-context` workflow to gather relevant codebase context
3. Run `dev-story` workflow (Developer agent) to implement with AI assistance
4. Run `review-story` workflow to validate against acceptance criteria
5. Mark story complete with `story-approved` workflow

**Progress Tracking:**
- All stories tracked in `docs/bmm-workflow-status.md`
- Update status file after each story completion
- Run `workflow-status` anytime to see current progress

---

**For implementation:** Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown.
