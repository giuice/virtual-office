# Virtual Office - Epic Breakdown

**Author:** Giuliano
**Date:** 2025-10-23
**Project Level:** 3 (Complex System)
**Target Scale:** 85-120 stories across 10 epics

---

## Overview

Doc gives epic breakdown for Virtual Office, expanding on epic list in [PRD](./PRD.md).

Each epic has:
- Goal + value
- Full story breakdown
- Acceptance criteria per story
- Story order + deps

**Epic Sequencing Principles:**
- Epic 1 sets base + initial features
- Epic 2 gives auth + company mgmt
- **Epic 3 delivers "Unleashed" visual UX + floor plan** (merged from original Epic 3 + Epic 10)
- Epic 4A/4B adds messaging features inheriting visual base
- Later epics build stepwise; each deliver big end-to-end value
- Stories vertical slices, sequential order
- No forward deps - each story builds only on previous work

---

## Epic 1: Core Infrastructure & Supabase Migration ✅ COMPLETE

**Goal:**
Establish a modern, scalable base for Virtual Office using Next.js 16, React 19, and Supabase, replacing the legacy Firebase build. Build the Repository Pattern for clean data-access abstraction and set up CI/CD for reliable deployments.

**Value:**
This epic delivered technical base enabling all subsequent features: type-safe dev w/ TypeScript, real-time capabilities via Supabase, + maintainable arch via Repository Pattern.

**Done:**
- Next.js 16.1.6 + React 19.2.4 + TypeScript 6 stack
- Supabase PostgreSQL DB w/ RLS policies
- Repository Pattern build (interfaces + Supabase builds)
- Initial DB schema (companies, users, spaces, chats, msgs)
- Dev workflow w/ linting, type-checking, + testing infrastructure

**Stories: ~8-10** (Completed retrospectively, documented for reference)

---

## Epic 2: Authentication & Company Management 🚨 HOTFIX REQUIRED

**Goal:**
Build secure, company-based multi-tenancy w/ Supabase Auth, letting orgs create isolated spaces + manage team via invite workflows w/ role-based access control.

**Value:**
This epic enabled core access control model: companies can onboard teams safely, admins can manage members, + all data isolated per company via RLS policies.

**Status:** ⚠️ PARTIALLY COMPLETE - Invite flow broken, needs hotfix

**Done:**
- Supabase Auth w/ email/password auth ✅
- SSR-compatible auth flows using @supabase/ssr ✅
- Company create + settings mgmt ✅
- Role-based access control (Admin/Member) ✅
- Auth middleware protecting API routes ✅

**Issues (Hotfix):**
- User invite system uses fake UUID not Supabase Auth ❌
- No email confirm feedback after signup ❌
- No way to copy/share invite links ❌

**Biz Model:** Freemium - 10 users free per company

### Hotfix Stories (3 total)

---

**Story 2.1: Registration UX Feedback** ⭐ PRIORITY

As new user registering on platform: want clear feedback after signup about next steps; so I understand email confirm process + can access platform.

**Acceptance Criteria:**
1. After signup success, show clear msg w/ email confirm instructions
2. Show user email in confirm msg
3. "Resend confirm email" button calls Supabase resend API
4. On login page, detect unconfirmed email + show resend option
5. After email confirm, redirect to `/onboarding` page
6. Onboarding shows "Create Company" / "Join via Invite Code" options

**Tech Ref:** 
- `src/app/(auth)/signup/page.tsx` - Add success state
- `src/app/(auth)/login/page.tsx` - Detect unconfirmed email
- Supabase API: `supabase.auth.resend({ type: 'signup', email })`

**Prereq:** None (independent fix)
**Estimate:** 2-3 hours

---

**Story 2.2: Invitation Accept Flow** ⭐ PRIORITY

As user who received invite link: want to click link + get guided via signup/login; so can join company invited me.

**Acceptance Criteria:**
1. Remove all fake UUID logic from `/join` page
2. `/join?token=xxx` validates token before auth UI
3. Show Supabase Auth UI (Google + Email/Password) if not logged in
4. After auth success, auto-call `/api/invitations/accept` w/ token
5. Update user's `company_id` + invite status to `accepted`
6. Redirect to `/dashboard` w/ success toast
7. Show clear error for invalid/expired tokens
8. Show warning if user already belongs to company

**Tech Ref:**
- `src/app/join/page.tsx` - Complete rewrite required
- `src/app/api/invitations/accept/route.ts` - Ensure uses server client
- DB function `public.handle_new_user()` inserts user w/o setting `company_id`

**Prereq:** Story 2.1 (signup UX)
**Estimate:** 4-6 hours

---

**Story 2.3: Invitation Link Copy & User Limit** ⭐ PRIORITY

As company admin inviting new member: want to see + copy invite link; so can share manually it while email sending is not built.

**Acceptance Criteria:**
1. After invite created, show success state w/ copyable link
2. Copy button copies full URL w/ visual feedback ("Link copiado!")
3. Show pending invites list w/ email, status, created date
4. "Copy link" action for pending invites
5. "Revoke" action for pending invites
6. Enforce 10-user limit (Freemium model)
7. Count includes current users + pending invites
8. Clear messaging when limit reached w/ upgrade prompt

**Tech Ref:**
- `src/components/dashboard/invite-user-dialog.tsx` - Add success state
- `src/app/api/invitations/create/route.ts` - Return full URL
- `src/app/api/invitations/list/route.ts` - NEW: List invites

**Prereq:** Story 2.2 (invite accept flow)
**Estimate:** 3-4 hours

---

**Stories: 3 hotfix + ~6-8 completed retrospectively**

---

## Epic 3: Visual Experience & Floor Plan (Unleashed) 🚧 IN PROGRESS

**Goal:**
Transform Virtual Office into high-polish, investor-ready spatial space using "Reality Distortion" design system. Epic merges original floor plan features w/ "Unleashed" UX patterns from Epic 10, delivering Orbit Gallery layout, theme system, avatar constellations, + attention beacons As base for all subsequent features.

**Value:**
Visual polish wins investor demos. This epic lifts product utility -> premium UX, giving role-adaptive views (Orbit for general use, Analyst for ops, Cinema for lobbies) + personalization (Neon, Zen, Obsidian themes). floor plan becomes "wow factor" sets apart Virtual Office from chat-only tools.

**Design Refs:**
- UX Specification: `docs/ux-design-specification.md`
- Interactive Demo: `docs/ux-space-grid-v2.html`
- Color Themes: `docs/ux-color-themes.html`

**Status:** Base complete; **Unleashed visual overhaul starting**

### Stories (14 total - merged from Epic 3 + Epic 10)

---

**Story 3.1: Reality Distortion Engine (Theme System)** ⭐ PRIORITY

As user: want to switch between many visual themes (Neon, Zen, Obsidian, Paper); so can align space w/ my current mood / lighting conditions.

**Acceptance Criteria:**
1. Theme switcher UI (dropdown / palette selector) in header/settings
2. CSS variable tokens for all themes (colors, gradients, shadows, glass effects)
3. "Neon Cyberpunk" theme: High contrast, cyan/magenta accents, void black base (`#050505`)
4. "Zen Garden" theme: Soft earth tones, paper textures, moss green (`#3D4C41`)
5. "Obsidian Stealth" theme: Monochrome dark, true black (`#000000`), minimal
6. "Paper White" theme: Pure white, ink black text, red signals
7. Theme pref persists in `users.preferences.theme`
8. Instant theme switching w/o page reload

**Tech Ref:** See `docs/ux-space-grid-v2.html` CSS variables

**Prereq:** None (base story)

---

**Story 3.2: Space Card V2 (Orbit Gallery Component)** ⭐ PRIORITY

As user: want rich, interactive space cards reveal details on hover; so can see what's happening inside room w/o entering it.

**Acceptance Criteria:**
1. New `SpaceCard` component implementing Orbit Gallery design (refactor from `src/components/floor-plan/modern/ModernSpaceCard.tsx`)
2. Gradient backgrounds based on space type/neighborhood
3. Status ribbons (Agenda Phase, Mtg Type) shown on card face
4. Card displays: space name, occupancy count, phase pill
5. Hover interaction expands card to reveal:
   - Full person roster (avatars row)
   - Current agenda phase/topic
   - Latest activity log entry (monospace font)
6. Smooth transition animations for hover state (200ms, ease-elastic)
7. Theme-aware styling (inherits CSS variables from Story 3.1)

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.space-card` build

**Prereq:** Story 3.1

---

**Story 3.3: Avatar Constellation V2** ⭐ PRIORITY

As user: want to see my colleagues' photos w/ clear status indicators; so can instantly recognize who is speaking / listening.

**Acceptance Criteria:**
1. `AvatarConstellation` component (extend `UserAvatarPresence.tsx`)
2. Photo-first design (36px circular avatars w/ 2px border)
3. Animated status rings:
   - Box-shadow glow for "Speaking" (accent color)
   - Solid border for "Presenting"
   - Dimmed opacity for "Observer/Muted"
4. Smart stacking: negative margin overlap (-10px), max 4 shown
5. Overflow badge: "+N" for 5+ people
6. Hover on avatar: translateY(-3px) scale(1.1) w/ z-index bump
7. Tooltips show name, role, + status

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.avatars-row` build

**Prereq:** Story 3.2

---

**Story 3.4: Attention Beacon System**

As leader: want to see visual pulses on spaces need attention; so can fast identify blockers / active discussions.

**Acceptance Criteria:**
1. `AttentionBeacon` component (animated pulse ring/halo)
2. Beacon indicator: 10px circle w/ box-shadow glow
3. Pulse animation: 2s infinite for normal, 1s for critical
4. Logic to trigger beacons based on:
   - "Blocker" logged in mtg
   - Occupancy > 80%
   - "Help Requested" signal
5. Visual severity levels:
   - Normal: theme accent color
   - Critical: red (#ff4d4d) w/ fast pulse
6. Beacons shown in all layout modes

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.beacon-indicator` CSS

**Prereq:** Story 3.2

---

**Story 3.5: Orbit Gallery Layout (Default View)** ⭐ PRIORITY

As user: want default floor plan to use Orbit Gallery layout; so have balanced view of space + detail.

**Acceptance Criteria:**
1. Build Orbit Gallery grid system: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
2. Add `SpaceCard` V2 into grid
3. "Now Board" header region showing active beacons + summary metrics
4. Adaptive behavior:
   - Desktop (≥1440px): 3-4 columns
   - Tablet (1024-1439px): 2 columns
   - Mobile (<1024px): 1 column
5. Glass-morphism controls bar: blur backdrop, subtle border
6. Replace Konva.js canvas view w/ this DOM-based grid (better a11y)

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.layout-orbit` build

**Prereq:** Story 3.2, 3.3, 3.4

---

**Story 3.6: Analyst Matrix Layout (Dense View)**

As n operations mgr: want dense, data-rich view of all spaces; so can monitor 20+ rooms at once w/o scrolling.

**Acceptance Criteria:**
1. "Analyst Matrix" layout option in view switcher
2. Compact grid: `minmax(220px, 1fr)` w/ 1rem gap
3. Hide avatar constellation, show sparkline instead
4. Sparkline bar showing occupancy/activity percentage
5. Reduced card padding (1rem vs 1.5rem)
6. Text-heavy: Room Name, Phase, Occupancy numbers prominent
7. Maximum density: 30+ spaces shown on 1080p screen

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.layout-analyst` build

**Prereq:** Story 3.5

---

**Story 3.7: Cinema Mode Layout (Immersive View)**

As user in lobby / public screen: want large-scale, immersive view of key spaces; so office activity looks good on big screen.

**Acceptance Criteria:**
1. "Cinema Mode" layout option in view switcher
2. Large cards: `minmax(400px, 1fr)`
3. Full-screen cards for active spaces only
4. Auto-rotate/carousel feature (cycle via active rooms every 15s)
5. High-fidelity visuals: larger avatars, full background gradients
6. Hide UI chrome (headers, sidebars) option

**Tech Ref:** See `docs/ux-space-grid-v2.html` `.layout-cinema` build

**Prereq:** Story 3.5

---

**Story 3.8: Perspective Switcher UI**

As user: want to easily toggle between Orbit, Analyst, + Cinema views; so can choose best layout for my current task.

**Acceptance Criteria:**
1. `PerspectiveSwitcher` component in controls bar
2. Three buttons: Orbit (default), Analyst, Cinema
3. Active button styling: background fill, text color, box-shadow
4. Instant layout switch via CSS class toggle on body
5. Keyboard shortcut hints (optional): O, C
6. Pref persists in localStorage / user profile

**Prereq:** Story 3.5, 3.6, 3.7

---

**Story 3.9: Space Grouping and Neighborhoods**

As n admin: want to organize spaces into neighborhoods (e.g., "Engineering", "Marketing"); so large office layouts are easier to navigate + understand.

**Acceptance Criteria:**
1. Zone/neighborhood create UI in admin settings
2. Spaces can be assigned to neighborhoods
3. Grid displays neighborhood groupings via visual bands/sections
4. Neighborhood colors derived from theme CSS variables
5. Filter chips in Now Board to show/hide neighborhoods
6. Zone data stored in `spaces.metadata` / `neighborhoods` table

**Prereq:** Story 3.5

---

**Story 3.10: Now Board Header**

As leader: want summary bar showing office pulse at glance; so can instantly see active beacons, key metrics, + filters.

**Acceptance Criteria:**
1. `NowBoard` component at top of floor plan
2. Shows: total spaces, active users, beacons count
3. Filter chips for neighborhoods
4. Search input for finding spaces
5. Live beacon alerts w/ severity icons
6. `aria-live` region for screen reader announcements

**Prereq:** Story 3.4, 3.5

---

**Story 3.11: Space Detail Hover Panel**

As user: want detailed info about space when I hover; so can fast see who's in space + what's happening before I join.

**Acceptance Criteria:**
1. Hover on SpaceCard shows expanded details
2. Shows: full person roster, agenda phase, activity log, transcript snippet
3. Primary action button (Join/Knock/Leave) prominent
4. Panel animation: smooth expand/collapse (200ms)
5. Click-stop protocol honored (data-avatar-interactive)
6. Mobile: tap to expand (bottom sheet pattern)

**Prereq:** Story 3.2

---

**Story 3.12: Space Capacity and "Room Full" Handling**

As user: want clear visual indication when space is at capacity; so do not try to join full spaces + get blocked.

**Acceptance Criteria:**
1. Occupancy count shown on card (e.g., "6 Active")
2. Full spaces have visual treatment (dimmed, "Full" badge)
3. "Join" button disabled for full spaces w/ tooltip
4. Beacon triggers auto at 80% capacity
5. Capacity validate enforced in API

**Prereq:** Story 3.2, 3.4

---

**Story 3.13: Real-Time Presence Animation**

As user: want smooth animations when colleagues enter / exit spaces; so floor plan feels alive + updates feel natural.

**Acceptance Criteria:**
1. Avatar fade-in when entering (300ms transition)
2. Avatar fade-out when leaving
3. Speaking status ring animates smoothly
4. Beacon pulses sync w/ presence changes
5. Perf: animations maintain 60 FPS w/ 20+ users

**Prereq:** Story 3.3

---

**Story 3.14: Mobile-Responsive Floor Plan**

As mobile user: want to view + navigate floor plan on my phone; so can see team presence even when away from my desktop.

**Acceptance Criteria:**
1. Single-column card layout on mobile (<768px)
2. Touch gestures: tap to expand card details
3. Bottom sheet for space detail panel
4. Simplified controls bar (stacked layout)
5. Theme switching works on mobile
6. Perf acceptable on mid-range phones (30 FPS)

**Prereq:** Story 3.5, 3.11

---

**Story 3.16: Knock to Enter Workflow**

As user: want to request access to restricted spaces by "knocking"; so can join private mtgs when right.

**Acceptance Criteria:**
1. Restricted spaces show "Knock to Enter" button not "Join" in SpaceCard hover panel
2. Clicking "Knock" sends notice to ALL users now inside space
3. All space occupants receive toast notice + sound w/ requester name + approve/deny buttons
4. ANY occupant can approve / deny knock request
5. On approval: Requester receives success notice + is auto-joined to space
6. On denial: Requester receives "Access denied" notice
7. Pending knocks show "Waiting for approval..." status on button
8. Knock expires after 5 minutes w/ timeout notice to requester

**Prereq:** Story 3.11

---

**Story 3.17: Auto-Remove Offline Users from Space Display**

As user: want offline users to auto disappear from space view; so I only see who is present right now (Sococo-style behavior).

**Acceptance Criteria:**
1. When user goes offline, their avatar is REMOVED from space floor plan within 5 seconds
2. Offline users remain shown in DM/messaging contexts (to send offline msgs)
3. Space occupant count updates now when user disconnects
4. `space_presence` table is updated on disconnect (user removed from space)
5. `space_presence_log` records exit event w/ `exited_at` timestamp
6. UI shows smooth fade-out animation when avatar is removed
7. Reconnecting user (within grace period) returns to their last space auto (see Story 3.18)

**Prereq:** Story 3.3 (Avatar Constellation)

---

**Story 3.18: Default Space Assignment & Reconnection Grace Period**

As n admin: want to assign default spaces to users + departments; so team members auto appear in right location.

As user: want to return to my last space if my connection drops briefly; so do not lose my context after network glitches.

**Acceptance Criteria:**
1. Admin can set "default space" for each user in user mgmt panel
2. Company can designate one space As "company default" for first-time users
3. First-time users w/ no assigned space are placed in company default space
4. Users can only be "inside" one space at time (enforced at data layer)
5. When connection drops, system waits 5 minutes before removing user from space
6. If user reconnects within 5 minutes, they auto-rejoin their last space
7. After 5-minute timeout, user is removed from space (Story 3.17 behavior)
8. `users` table has `default_space_id` column
9. `companies` table has `default_space_id` column (company-wide default)

**Prereq:** Story 3.17, Epic 2 (company mgmt)

---

**Epic 3 Summary:**
- **Total Stories:** 17
- **Effort:** 60-80 hours
- **Priority:** 3.1 (Theme), 3.2 (SpaceCard), 3.3 (Avatars), 3.5 (Orbit Layout), 3.17 (Offline Removal), 3.18 (Default Space)
- **Design Refs:** `docs/ux-design-specification.md`, `docs/ux-space-grid-v2.html`
- **Risk:** CSS complexity for themes, perf of animated DOM elements, reconnection edge cases

---

## Epic 8A: Audio MVP (Sococo-Style) 🚧 URGENT

**Goal:** implement "simples assim" audio chat. When user enters space, they can hear others. Mic defaults to muted. speaking indicator shows who is talking.

**Arch:** P2P Mesh (Limit ~8 users/room). Signaling via Supabase Realtime.

**Stories (4 total)**

---

**Story 8A.1: WebRTC Manager & Signaling** ⭐ PRIORITY

As developer: want to establish P2P connections between users in same space; so audio streams can be exchanged directly.

**Acceptance Criteria:**
1.  `WebRTCManager` class handles `RTCPeerConnection` create/teardown
2.  Signaling via `supabase.channel` (events: `signal`, `handshake`)
3.  On user join: send `handshake` -> receive `offers` -> send `answers`
4.  Handle ICE candidates exchange
5.  Clean up connections on user leave
6.  Limit: Show warning toast if >8 users in room ("Audio quality may degrade")

**Prereq:** Epic 1 (Realtime base)

---

**Story 8A.2: Audio Stream Handling & Permissions**

As user: want to grant microphone access once; so can be heard when I unmnute.

**Acceptance Criteria:**
1.  Request `navigator.mediaDevices.getUserMedia({ audio: true })` on first join
2.  Handle permission denied w/ helpful UI instruction
3.  Manage local `MediaStream` (keep active across room changes if desired, / re-request)
4.  Play remote audio streams via hidden `<audio>` elements
5.  Audio routing logic: Ensure audio output device selection works (browser default)

**Prereq:** Story 8A.1

---

**Story 8A.3: Speaking Indicator (Visualizer)**

As user: want to see who is talking; so can follow chat naturally.

**Acceptance Criteria:**
1.  Use `AudioContext` + `AnalyserNode` on remote streams
2.  Detect volume amplitude > threshold (e.g., -50dB)
3.  Update local React state `isSpeaking` for user
4.  Trigger `AvatarConstellation` pulse animation (reusing Story 3.3 visual)
5.  Zero network traffic for this (purely client-side analysis)

**Prereq:** Story 8A.2, Story 3.3

---

**Story 8A.4: Mic Controls & Default State**

As user: want to control my microphone status; so do not broadcast background noise accidentally.

**Acceptance Criteria:**
1.  Default state on room entry: **MUTED**
2.  Mic toggle button in "Now Board" / Space Controls
3.  Sync mute state to other users via Supabase Presence (`is_muted` metadata)
4.  Show "Muted" icon on avatar when `is_muted: true`
5.  Hotkeys: `M` to toggle mute, Spacebar (PTT - nice to have)

**Prereq:** Story 8A.2

---

## Epic 8B: Enhanced Communication Tools (Video/Screen) ⏳ PLANNED

**Goal:**
Deliver user-facing messaging features to achieve feature parity w/ Slack/Teams: threaded chats, reactions, msg pins/stars, read receipts, infinite scroll, file attachments, voice notes, + chat search. This epic focuses on Timeline + Composer user UX.

**Value:**
This epic completes core messaging UX, enabling teams to communicate w/ same richness they expect from modern chat tools, making Virtual Office viable Slack/Teams replacement.

**Task Alignment:** Tasks 2.5 + 3.0 from `tasks/tasks-0001-prd-unified-messaging-system.md`

**Status:**
- ✅ **Base Complete (Tasks 1.0 + 2.0): ** Data contracts, APIs, unified drawer shell, chat grouping
- 🚧 **In Progress: ** Timeline UI rendering + composer features
- ⚠️ **Testing Strategy: ** Manual testing only for investor demo - automated tests deferred to Epic 4B

### Stories (11 total - functional features only)

**Remaining Stories (Tasks 3.0 - Timeline & Composer Features):**

---

**Story 4A.1: Render Reply Indicators and Thread UI** (Task 3.1)

As user: want to see reply threads visually in msg timeline; so can follow chat flow + respond to specific msgs.

**Acceptance Criteria:**
1. Msgs w/ replies show reply count badge (e.g., "3 replies")
2. Click reply badge expands thread inline (indented msgs)
3. Thread UI shows parent msg at top w/ replies below
4. "Reply" button on each msg opens composer in reply mode
5. Reply composer shows preview of msg being replied to w/ cancel option

**Manual Testing Checklist:**
- [ ] Verify reply thread show in drawer
- [ ] Test reply composition + thread expansion
- [ ] Verify real-time updates when others reply
- [ ] Check thread UI on many screen sizes

**Prereq:** Base complete (Tasks 1.0 + 2.0)

---

**Story 4A.2: Reaction Chips and Emoji Picker** (Task 3.1)

As user: want to add emoji reactions to msgs; so can fast respond w/o typing full msgs.

**Acceptance Criteria:**
1. Hover over msg shows reaction button (+emoji icon)
2. Click reaction button opens emoji picker popover
3. Emoji picker shows frequently used + all emojis w/ search
4. Selected emoji appears as reaction chip below msg w/ count (👍 3)
5. Click existing reaction chip toggles user's reaction on/off
6. Reactions update in real-time for all people

**Manual Testing Checklist:**
- [ ] Test emoji picker opens + closes correctly
- [ ] Verify reaction chips show w/ correct counts
- [ ] Test toggling reactions on/off
- [ ] Verify real-time reaction updates across users

**Prereq:** Story 4A.1

---

**Story 4A.3: Pinned and Starred Message Indicators** (Task 3.1)

As user: want to pin key msgs + star msgs for later reference; so can fast find key info in busy chats.

**Acceptance Criteria:**
1. Msg context menu includes "Pin Msg" + "Star Msg" options
2. Pinned msgs show pin icon + appear in "Pinned Msgs" section at top of feed
3. Starred msgs show star icon + are accessible via "Starred" filter
4. Unpin/unstar options available in context menu
5. Pin/star actions persist via API (`POST /api/messages/[messageId]/pin`, `/api/messages/star`)

**Manual Testing Checklist:**
- [ ] Test pin/star via context menu
- [ ] Verify pinned msgs section displays correctly
- [ ] Test starred filter features
- [ ] Verify persistence after page refresh

**Prereq:** Story 4A.2

---

**Story 4A.4: Read Receipts Display** (Task 3.1)

As user: want to see who has read my msgs; so I know if my team saw key info.

**Acceptance Criteria:**
1. Sent msgs show read status: "Sent", "Delivered", "Read by 3"
2. Hover over "Read by 3" shows tooltip w/ names + timestamps
3. DMs show specific read receipt: "Read by Jane at 2: 45 PM"
4. Read receipts update in real-time as others view msgs
5. Read receipt data fetched from `message_read_receipts` table

**Manual Testing Checklist:**
- [ ] Verify read status indicators show correctly
- [ ] Test tooltip showing reader names + timestamps
- [ ] Verify real-time updates as msgs are read
- [ ] Test DM-specific read receipts

**Prereq:** Story 4A.3

---

**Story 4A.5: Infinite Scroll with Pagination** (Task 3.2)

As user: want to scroll up via msg history infinitely; so can access old chats w/o pagination buttons.

**Acceptance Criteria:**
1. Initial load shows last 50 msgs
2. Scrolling to top triggers automatic load of older msgs (50 more)
3. Loading indicator appears during fetch
4. Scroll position maintained after new msgs load (no jump)
5. Perf: smooth scrolling w/ 500+ msgs in chat

**Manual Testing Checklist:**
- [ ] Test initial msg load (last 50)
- [ ] Scroll to top + verify older msgs load
- [ ] Verify scroll position doesn't jump
- [ ] Test w/ large chat (100+ msgs)

**Prereq:** Story 4A.4

---

**Story 4A.6: Auto-Scroll to New Messages with Indicator** (Task 3.2)

As user: want feed to auto-scroll when new msgs arrive; so I see new content w/o manual scrolling.

**Acceptance Criteria:**
1. If user is near bottom (within 100px), auto-scroll to new msg
2. If user is scrolled up, show "New Msgs" button at bottom (floating)
3. Click "New Msgs" button scrolls to bottom + marks msgs read
4. Button shows count of unread msgs (e.g., "3 new msgs")
5. Auto-scroll respects user intent (doesn't scroll if user actively reading old msgs)

**Manual Testing Checklist:**
- [ ] Test auto-scroll when at bottom
- [ ] Test "New Msgs" button when scrolled up
- [ ] Verify button shows correct unread count
- [ ] Test auto-scroll respects user intent

**Prereq:** Story 4A.5

---

**Story 4A.7: File Attachment Drag-and-Drop** (Task 3.3)

As user: want to drag files into composer to attach them; so can share documents, images, + files easily.

**Acceptance Criteria:**
1. Drag file over composer shows drop zone w/ visual highlight
2. Drop file triggers upload to Supabase Storage
3. Upload progress indicator shows percentage
4. Attached file appears as preview chip w/ filename, size, + remove button
5. Send msg includes attachment metadata in `message_attachments` table
6. Supported file types: images (jpg, png, gif), docs (pdf, docx), archives (zip)
7. Max file size: 10 MB per attachment

**Manual Testing Checklist:**
- [ ] Test drag-+-drop file upload
- [ ] Verify upload progress indicator
- [ ] Test file preview chip + remove button
- [ ] Test various file types (images, docs, archives)
- [ ] Test file size limit (10 MB)

**Prereq:** Story 4A.6

---

**Story 4A.8: File Attachment Preview** (Task 3.3)

As user: want to preview attachments inline in msg feed; so can view images + files w/o downloading.

**Acceptance Criteria:**
1. Image attachments show thumbnail in msg (click to enlarge)
2. PDF attachments show first page preview
3. Other files show icon w/ filename + download button
4. Click image opens lightbox viewer w/ zoom controls
5. Download button triggers secure file download from Supabase Storage URL

**Manual Testing Checklist:**
- [ ] Test image thumbnail show + lightbox
- [ ] Test PDF preview rendering
- [ ] Test file download features
- [ ] Verify lightbox zoom controls work

**Prereq:** Story 4A.7

---

**Story 4A.9: Voice Note Recording** (Task 3.3)

As user: want to record + send voice notes; so can communicate fast when typing is inconvenient.

**Acceptance Criteria:**
1. Microphone button in composer starts recording (request permission if needed)
2. Recording UI shows waveform visualization + duration counter
3. Stop button ends recording + shows playback preview
4. Send button uploads voice note to Supabase Storage + sends msg
5. Voice notes show in feed w/ play/pause button + waveform
6. Voice note metadata stored in `message_attachments` table w/ `type: voice_note`

**Manual Testing Checklist:**
- [ ] Test microphone permission request
- [ ] Test recording w/ waveform visualization
- [ ] Test playback preview before sending
- [ ] Verify voice note upload + show in feed
- [ ] Test on many browsers (Chrome, Firefox, Safari)

**Prereq:** Story 4A.8

---

**Story 4A.10: Conversation Search** (Task 3.4)

As user: want to search within chat for specific msgs; so can find past info fast.

**Acceptance Criteria:**
1. Search input at top of msg feed
2. Type query → real-time search highlights matching msgs
3. Search matches msg content, sender name, + attachment filenames
4. Jump to next/previous match w/ arrow buttons
5. Search persists across scrolling (maintains highlights)
6. Clear search button restores normal view

**Manual Testing Checklist:**
- [ ] Test search w/ various keywords
- [ ] Verify real-time highlighting
- [ ] Test next/previous navigation
- [ ] Verify search persists during scroll
- [ ] Test clear search features

**Prereq:** Story 4A.9

---

**Story 4A.11: Starred Messages Filter** (Task 3.4)

As user: want to filter feed to show only starred msgs; so can review key msgs I've saved.

**Acceptance Criteria:**
1. "Show Starred Only" toggle button above feed
2. When enabled, feed displays only msgs user has starred
3. Starred msgs show in chronological order w/ context (chat name)
4. Disable toggle returns to full chat view
5. Starred filter works alongside search (can search within starred)

**Manual Testing Checklist:**
- [ ] Test starred filter toggle
- [ ] Verify only starred msgs show when enabled
- [ ] Test chronological ordering
- [ ] Test filter combined w/ search

**Prereq:** Story 4A.10

---

**Epic 4A Summary:**
- **Total Stories:** 11 (functional features only)
- **Effort:** 22-30 hours
- **Testing Strategy:** Manual testing only - automated E2E tests deferred to Epic 4B
- **Dependencies:** Supabase Storage, Web APIs (MediaRecorder for voice notes)
- **Risk:** Attachment handling + voice note encoding across browsers
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Task 3.0
- **Change Note:** Story 4A.1 (Playwright tests) removed to unblock investor demo - automated testing moved to Epic 4B.8

---

## Epic 4B: Real-Time Messaging - Resilience & Scale 🚧 PLANNED

**Goal:**
Ensure enterprise-grade messaging reliability w/ offline resilience, reconnection handling, multi-client synchronization, + observability. Deliver analytics, notices, + full testing to make messaging production-ready at scale.

**Value:**
This epic transforms messaging from functional to enterprise-ready, ensuring users never lose msgs during network issues + admins have visibility into messaging health + engagement.

**Task Alignment:** Tasks 4.0 + 5.0 from `tasks/tasks-0001-prd-unified-messaging-system.md`

**Dependencies:** Epic 4A complete (Timeline & Composer features functional)

### Stories (8 total; Stories 4B.1-4B.8 = Original 4.23-4.30)

---

**Story 4B.1: Offline Message Queue** (Task 4.2)

As user: want my msgs to send auto when my internet reconnects; so do not lose msgs during network interruptions.

**Acceptance Criteria:**
1. When offline, sent msgs go to queue in `localStorage` w/ pending status
2. Msgs show "Sending..." indicator in feed (gray checkmark)
3. On reconnect, queue auto sends pending msgs in order
4. Failed sends show "Failed to send" w/ retry button
5. Queue persists across page refreshes (stored in `localStorage`)

**Prereq:** Epic 4A complete

---

**Story 4B.2: Realtime Reconnection with Exponential Backoff** (Task 4.1)

As developer: want Supabase Realtime to reconnect auto w/ smart backoff; so users have reliable real-time UX even w/ unstable networks.

**Acceptance Criteria:**
1. Detect Realtime connection loss via subscription status events
2. Attempt reconnection w/ exponential backoff: 1s, 2s, 4s, 8s, max 30s
3. Show connection status indicator in UI (connected/reconnecting/offline)
4. On reconnect, re-subscribe to all active channels (chats, presence)
5. Fetch missed msgs via polling for gap period
6. Log reconnection events for debugging

**Prereq:** Story 4B.1

---

**Story 4B.3: Polling Fallback for Missed Messages** (Task 4.3)

As user: want app to fetch missed msgs when real-time is unavailable; so do not miss key chats.

**Acceptance Criteria:**
1. When Realtime is disconnected >30s, start polling API every 10s
2. Fetch msgs newer than last received timestamp
3. Insert fetched msgs into feed w/ proper ordering
4. Stop polling when Realtime reconnects
5. Polling respects rate limits (max 6 requests/minute)

**Prereq:** Story 4B.2

---

**Story 4B.4: Typing Indicators** (Task 4.4)

As user: want to see when others are typing; so I know response is coming + avoid interrupting.

**Acceptance Criteria:**
1. Typing in composer triggers typing event to Supabase Realtime channel
2. Other people see "Jane is typing..." below msg feed
3. Typing indicator shows for 3 seconds after last keystroke
4. Multiple typists show: "Jane, Bob, + Alice are typing..."
5. Typing events throttled (max 1 per second to avoid spam)

**Prereq:** Story 4B.3

---

**Story 4B.5: Multi-Client Read Receipt Sync** (Task 4.4)

As user w/ multiple devices: want read receipts to sync across my devices; so msgs marked read on desktop also show read on mobile.

**Acceptance Criteria:**
1. Mark msg as read on device → Read receipt updates via Realtime on device B
2. Opening chat on any device marks all msgs as read
3. Read status persists in `message_read_receipts` table per user
4. Unread count badge updates in real-time across devices
5. Race condition handling: last-write-wins for read timestamps

**Prereq:** Story 4B.4

---

**Story 4B.6: Messaging Analytics Events** (Task 5.1)

As product mgr: want analytics on msg latency + engagement; so can monitor messaging health + optimize perf.

**Acceptance Criteria:**
1. Track metrics: msg send latency, delivery time, read time
2. Log events: msg sent, msg read, reaction added, file uploaded
3. Metrics emitted via `debugLogger.messaging` w/ structured format
4. Events include metadata: conversation_id, user_id, message_type, timestamp
5. Analytics dashboard (future) can query these logs

**Prereq:** Story 4B.5

---

**Story 4B.7: Desktop Notifications** (Task 5.3)

As user: want desktop notices for new msgs when app isn't focused; so do not miss key communications.

**Acceptance Criteria:**
1. Request notice permission on first msg received
2. Show notice for new DMs when app is in background (title, preview, avatar)
3. Show notice for @mentions in spaces
4. Click notice focuses app + opens relevant chat in drawer
5. Respect user prefs (can disable notices per chat)
6. Notices muted when user is actively viewing chat

**Manual Testing Checklist:**
- [ ] Test notice permission request flow
- [ ] Verify DM notices show when app in background
- [ ] Test @mention notices in spaces
- [ ] Verify clicking notice opens correct chat
- [ ] Test notice prefs per chat

**Prereq:** Story 4B.6

---

**Epic 4B Summary:**
- **Total Stories:** 7 (all functional)
- **Effort:** 14-20 hours
- **Testing Strategy:** Manual testing only - no automated tests
- **Dependencies:** Supabase Realtime, Web APIs (Notices API)
- **Risk:** Offline reliability + reconnection complexity - thorough manual testing required
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Tasks 4.0 + 5.0
- **Change Note:** All automated testing eliminated - Playwright incompatible w/ Supabase tech stack complexity

---

**Combined Epic 4A + 4B Summary:**
- **Total Stories:** 18 functional stories (4A: 11 stories, 4B: 7 stories)
- **Combined Effort:** 36-50 hours
- **Testing Strategy:** Manual testing only - no automated tests
- **Implementation Order:** Complete Epic 4A first (user-facing features), then Epic 4B (resilience/scale)
- **Original Epic 4 Stories 4.1-4.10:** Complete (Tasks 1.0 + 2.0)
- **Remaining Stories:** 4A.1-4A.11 (Timeline/Composer) + 4B.1-4B.7 (Resilience/Scale)
- **Change Note:** All automated testing eliminated per technical assessment - Playwright incompatible w/ Supabase Realtime complexity

---

## Epic 5: Meeting Notes System 🚧 IN PROGRESS

**Goal:**
Enable seamless mtg note capture w/ AI-powered summaries + action item tracking for **external mtgs** (Zoom, Google Meet, Microsoft Teams). Users can upload transcripts from third-party mtg tools + leverage AI to generate summaries + extract action items auto. This makes Epic 5 valuable now w/o waiting for Epic 8's native video conferencing.

**Value:**
This epic reduces mtg overhead by automating note-taking + action tracking for external mtgs, freeing people to focus on discussion rather than documentation. Once Epic 8 (native video conferencing) is complete, mtg notes system seamlessly add w/ Virtual Office's native mtgs.

**Status:** UI complete, AI integration pending

**Implementation Note:** This epic is designed to work w/ **external mtg transcripts** initially. When Epic 8 (Enhanced Comms Tools w/ WebRTC video conferencing) is built, native Virtual Office mtgs auto add w/ mtg notes system, enabling one-click transcript capture for internal mtgs.

### Stories (6-10 total)

**Story 5.1: Meeting Note Creation UI**

As user: want to create mtg note for space; so can document discussions + decisions.

**Acceptance Criteria:**
1. "Create Mtg Note" button in space detail panel
2. Form includes: title, mtg date/time, people (auto-populated from space)
3. Rich text editor for note content (markdown support)
4. Save button stores note in `meeting_notes` table
5. Note appears in space's "Mtg History" section

**Prereq:** None (standalone UI component)

---

**Story 5.2: Action Item Tracking**

As mtg person: want to add action items w/ assignees + due dates; so we track commitments made during mtgs.

**Acceptance Criteria:**
1. Action item section in note editor (add/remove items dynamically)
2. Each item includes: description, assignee (dropdown of company users), due date, status (pending/completed)
3. Action items saved in `meeting_note_action_items` table w/ foreign key to note
4. Assigned users receive notice of new action items
5. Action items appear in user's personal dashboard/task list

**Prereq:** Story 5.1

---

**Story 5.3: Meeting Note Viewing and Editing**

As user: want to view + edit past mtg notes; so can reference decisions + update action items.

**Acceptance Criteria:**
1. Mtg notes list view shows all notes for space (sorted by date, newest first)
2. Click note opens detail view w/ full content + action items
3. Edit button (for note creator / admin) allows editing content
4. Version history tracks edits (edited_by, timestamp)
5. Delete note option w/ confirm dialog

**Prereq:** Story 5.2

---

**Story 5.4: AI Meeting Transcript Upload (External Meetings)** (Placeholder)

As user: want to upload mtg transcript from external tools (Zoom, Google Meet, Microsoft Teams); so AI can generate summaries + action items auto for mtgs held outside Virtual Office.

**Acceptance Criteria:**
1. Upload.txt /.vtt transcript file from external mtg platforms (Zoom, Google Meet, Microsoft Teams, etc.)
2. Transcript stored in `meeting_notes.transcript` field
3. "Generate Summary" button triggers AI processing
4. Loading indicator while AI processes (expected 10-30 seconds)
5. Error handling for failed AI calls (timeout, API errors)
6. Support for common transcript formats: plain text (.txt), WebVTT (.vtt), SRT (.srt)

**Implementation Note:** This story focuses on external mtg transcripts. When Epic 8 (native video conferencing) is complete, transcripts from Virtual Office mtgs be auto available w/o manual upload.

**Prereq:** Story 5.3

---

**Story 5.5: AI-Generated Summary** (Placeholder - AI Service Integration)

As user: want AI to generate concise summary from transcript; so can fast review key points w/o reading full transcript.

**Acceptance Criteria:**
1. AI extracts key discussion points, decisions, + next steps
2. Summary formatted in markdown (bullet points, sections)
3. Summary saved in `meeting_notes.summary` field
4. User can edit AI-generated summary before saving
5. Regenerate summary option if initial result unsatisfactory
6. AI service: OpenAI GPT-4 / Anthropic Claude API

**Prereq:** Story 5.4

---

**Story 5.6: AI Action Item Extraction** (Placeholder - AI Service Integration)

As user: want AI to auto extract action items from transcript; so do not miss commitments made during discussions.

**Acceptance Criteria:**
1. AI identifies action items w/ format "Action: [description], Assignee: [name], Due: [date]"
2. Extracted items pre-populate action item section
3. User reviews + confirms items before saving
4. AI suggests assignees based on names mentioned in transcript
5. Fall back to manual assignment if AI can't determine assignee

**Prereq:** Story 5.5

---

**Story 5.7: Meeting Note Search**

As user: want to search across all mtg notes; so can find past discussions + decisions fast.

**Acceptance Criteria:**
1. Search input in mtg notes list view
2. Search across title, content, summary, + action item descriptions
3. Results highlight matching text
4. Filter by date range, space, / assignee
5. Search index updates in real-time as notes are created/edited

**Prereq:** Story 5.3

---

**Story 5.8: Action Item Notifications and Reminders**

As user: want notices when I'm assigned action items + reminders as due dates approach; so do not forget commitments.

**Acceptance Criteria:**
1. Notice when assigned new action item (email + in-app)
2. Daily digest of pending action items due within 3 days
3. Overdue reminder for items past due date
4. Mark item complete in UI → removes from reminders
5. Notice prefs configurable per user

**Prereq:** Story 5.2

---

**Epic 5 Summary:**
- **Total Stories:** 8
- **Effort:** 16-24 hours
- **Dependencies:** AI API (OpenAI/Anthropic for Stories 5.5-5.6)
- **Risk:** AI accuracy for action item extraction - may need manual review workflow

---

## Epic 6: Announcement System 🚧 IN PROGRESS

**Goal:**
Provide company-wide announcement system w/ priority levels, expiration dates, + filtering to ensure key updates reach entire team effectively.

**Value:**
This epic centralizes company communications, reducing reliance on email blasts + ensuring critical updates are shown to all team members in virtual office.

**Status:** Basic posting functional, filtering pending

### Stories (4-6 total)

**Story 6.1: Announcement Creation (Admin)**

As n admin: want to post company-wide announcements; so can share key updates w/ entire team.

**Acceptance Criteria:**
1. "Create Announcement" button in admin dashboard
2. Form includes: title, content (rich text), priority (urgent/normal/low), expiration date (optional)
3. Preview mode shows how announcement appear to users
4. Publish button saves to `announcements` table
5. All users see new announcement now (real-time via Supabase)

**Prereq:** None

---

**Story 6.2: Announcement Display for Users**

As user: want to see company announcements prominently when I log in; so do not miss key info.

**Acceptance Criteria:**
1. Announcement banner at top of dashboard for urgent announcements
2. Announcement center page shows all active announcements (sorted by priority then date)
3. Expired announcements auto hidden from view
4. Read/unread status tracked per user
5. Dismiss button closes banner (but announcement still accessible in center)

**Prereq:** Story 6.1

---

**Story 6.3: Announcement Filtering and Search**

As user: want to filter announcements by priority / search for specific topics; so can find relevant info fast.

**Acceptance Criteria:**
1. Filter dropdowns: priority (urgent/normal/low), date range, status (active/expired)
2. Search input matches title + content
3. Filters combine (+ logic): urgent + last 30 days + keyword
4. Clear filters button resets to show all announcements
5. Filter state persists in URL query params (shareable links)

**Prereq:** Story 6.2

---

**Story 6.4: Announcement Editing and Deletion**

As n admin: want to edit / delete announcements; so can correct errors / remove outdated info.

**Acceptance Criteria:**
1. Edit button on announcement (admin only) opens edit form
2. Edited announcements show "Updated at [time]" indicator
3. Delete button w/ confirm dialog
4. Deleted announcements removed from all users' views now
5. Audit log tracks edits + deletions (admin_id, action, timestamp)

**Prereq:** Story 6.1

---

**Story 6.5: Announcement Notifications**

As user: want notices for urgent announcements; so do not miss critical company updates.

**Acceptance Criteria:**
1. Urgent announcements trigger desktop notice (if permissions granted)
2. Email notice sent for urgent announcements to all users
3. In-app notice badge shows unread announcement count
4. Notice includes announcement title + preview (first 100 characters)
5. Click notice opens announcement center

**Prereq:** Story 6.2

---

**Story 6.6: Announcement Analytics (Admin)**

As n admin: want to see how many users viewed each announcement; so can gauge comms effectiveness.

**Acceptance Criteria:**
1. Admin view shows read count + percentage for each announcement
2. List of users who haven't read specific announcement (for urgent items)
3. Click-via tracking if announcement includes links
4. Export announcement metrics to CSV
5. Analytics stored in `announcement_views` table (user_id, announcement_id, viewed_at)

**Prereq:** Story 6.2

---

**Epic 6 Summary:**
- **Total Stories:** 6
- **Effort:** 12-18 hours
- **Dependencies:** Email service (for notices), Supabase Realtime
- **Risk:** Email deliverability - need reliable SMTP provider

---

## Epic 7: AI-Powered Communication Enhancements ⏳ PLANNED

**Goal:**
Add advanced AI capabilities to enhance collab: real-time transcription, semantic search across all content, intelligent mtg summaries, + context-aware AI assistant to help users find info + stay productive.

**Value:**
This epic sets apart Virtual Office from competitors by embedding AI deeply into workflows, reducing busywork + making comms more efficient.

**Dependencies:** Epic 5 complete (mtg notes infrastructure), AI service selection (OpenAI vs Anthropic)

### Stories (12-18 total)

**Story 7.1: AI Service Integration Setup**

As developer: want unified AI service layer; so we can easily switch between OpenAI + Anthropic APIs.

**Acceptance Criteria:**
1. Abstract AIService interface w/ methods: transcribe(), summarize(), search(), chat()
2. Implementations for OpenAI (GPT-4) + Anthropic (Claude)
3. Config to switch providers via environment variable
4. API key mgmt in Supabase secrets
5. Error handling + retry logic for API failures
6. Rate limiting + cost tracking

**Prereq:** None

---

**Story 7.2: Real-Time Meeting Transcription**

As mtg person: want live transcription of our audio chat; so we have accurate records + can follow along if I miss something.

**Acceptance Criteria:**
1. Enable transcription in mtg space (requires microphone permission)
2. Audio streamed to AI transcription service (OpenAI Whisper API)
3. Transcribed text appears in real-time below video/audio area
4. Speakers identified by voice (/ labeled manually: "Speaker 1", "Speaker 2")
5. Full transcript saved in `meeting_notes.transcript` when mtg ends
6. Support multiple languages (English, Spanish, French, German)

**Prereq:** Story 7.1

---

**Story 7.3: Semantic Search Across Messages**

As user: want to search for concepts, not exact keywords; so can find info even if do not remember exact wording.

**Acceptance Criteria:**
1. Search input uses AI embeddings for semantic matching
2. Query "project deadline" matches msgs about "due dates" + "delivery timeline"
3. Search across msgs, mtg notes, + announcements
4. Results ranked by relevance (AI similarity score)
5. Fallback to keyword search if AI service unavailable
6. Embeddings generated + indexed for all new content (background job)

**Prereq:** Story 7.1

---

**Story 7.4: Intelligent Message Summarization**

As user returning after time off: want AI to summarize chats I missed; so can catch up fast w/o reading hundreds of msgs.

**Acceptance Criteria:**
1. "Summarize unread" button in chat header
2. AI generates summary of key points from unread msgs (max 50 msgs)
3. Summary highlights: decisions made, action items mentioned, questions asked
4. Summary presented in collapsible panel above msg feed
5. Option to regenerate summary w/ many focus (e.g., "focus on decisions")

**Prereq:** Story 7.1

---

**Story 7.5: AI-Powered Meeting Recaps**

As user: want AI recap of mtgs I attended; so can review key points w/o re-watching recordings.

**Acceptance Criteria:**
1. "Generate Recap" button after mtg ends
2. AI analyzes transcript + generates recap w/ sections: Agenda, Decisions, Action Items, Next Steps
3. Recap saved in `meeting_notes.summary`
4. Attendees receive email w/ recap (opt-in setting)
5. Recap editable before sending

**Prereq:** Story 7.2, 7.4

---

**Story 7.6: Task and Reminder Extraction**

As user: want AI to detect tasks mentioned in msgs; so do not miss commitments buried in chats.

**Acceptance Criteria:**
1. AI scans msgs for task patterns ("I'll", "we ", "need to", "@user can you")
2. Suggested tasks appear in sidebar w/ checkbox to confirm
3. Confirmed tasks added to user's task list w/ extracted context
4. Integration w/ action items from mtgs (same task mgmt UI)
5. Task extraction runs daily as background job

**Prereq:** Story 7.4

---

**Story 7.7: Smart Availability Predictions**

As user: want AI to predict when colleagues be available; so can schedule discussions at optimal times.

**Acceptance Criteria:**
1. AI analyzes user presence history (from `space_presence_log`)
2. Predicts availability patterns: "Jane is usually online 9 AM - 5 PM EST"
3. Suggests best time to reach colleague (when both users likely online)
4. Availability predictions shown in user profile card
5. Prediction accuracy improves over time w/ more data

**Prereq:** Story 7.1

---

**Story 7.8: Context-Aware AI Assistant (Chat Interface)**

As user: want to ask AI assistant questions about my work; so can find info w/o manual searching.

**Acceptance Criteria:**
1. AI assistant button opens chat panel (similar to messaging drawer)
2. User asks questions: "What did we decide about pricing model?"
3. AI searches msgs, mtg notes, announcements for relevant context
4. Responds w/ answer + source citations (links to specific msgs/notes)
5. Chat history persisted (user can reference previous questions)
6. Assistant respects user permissions (only searches content user can access)

**Prereq:** Story 7.3, 7.4

---

**Story 7.9: AI Translation for Global Teams**

As global team member: want msgs translated to my preferred language; so can collaborate effectively across language barriers.

**Acceptance Criteria:**
1. User sets preferred language in profile settings
2. "Translate" button on msgs in other languages
3. AI translates msg + shows translation inline
4. Original msg still shown (toggle between original + translation)
5. Real-time translation option (auto-translate all incoming msgs)
6. Support 20+ languages via AI translation API

**Prereq:** Story 7.1

---

**Story 7.10: AI-Powered Search Suggestions**

As user: want AI to suggest related searches + content; so I discover relevant info I might have missed.

**Acceptance Criteria:**
1. Search results include "Related" section w/ AI-suggested queries
2. "You might also be interested in" shows semantically similar msgs/notes
3. Suggestions based on current search query + user's past interactions
4. Click suggestion runs new search / opens suggested content
5. Suggestions improve over time w/ user feedback (thumbs up/down)

**Prereq:** Story 7.3

---

**Story 7.11: AI Cost Monitoring and Limits**

As product owner: want to monitor + control AI API costs; so we don't exceed budget on AI features.

**Acceptance Criteria:**
1. Dashboard shows AI usage: API calls, tokens consumed, cost per user
2. Configurable spending limits (daily/monthly caps)
3. Alerts when approaching limits (email to admin)
4. Graceful degradation when limits reached (disable AI features, show msg to users)
5. Cost tracking stored in DB for analytics

**Prereq:** Story 7.1

---

**Story 7.12: AI Feature Opt-Out**

As privacy-conscious user: want to disable AI features for my data; so my msgs aren't processed by third-party AI services.

**Acceptance Criteria:**
1. User settings include "Enable AI Features" toggle
2. When disabled, user's msgs excluded from AI processing (transcription, search indexing, summaries)
3. User can still see AI-generated content from others (read-only)
4. Opt-out pref persisted in `users.preferences`
5. Clear explanation of what data AI processes (privacy notice)

**Prereq:** Story 7.1

---

**Epic 7 Summary:**
- **Total Stories:** 12
- **Effort:** 36-48 hours
- **Dependencies:** AI API (OpenAI GPT-4 / Anthropic Claude), Embeddings model, Whisper API
- **Key Risks:** AI costs can escalate fast - need strict usage monitoring + limits

---

## Epic 8: Enhanced Communication Tools ⏳ PLANNED

**Goal:**
Add WebRTC-based video conferencing, screen sharing, + virtual whiteboard capabilities to enable synchronous collab directly within spaces, eliminating need for external tools like Zoom.

**Value:**
This epic completes collab suite, making Virtual Office one-stop platform for remote team comms w/o switching between multiple apps.

**Dependencies:** Epic 4 complete (messaging base)

**Deferred Requirement (FR020):** Auto "In Mtg" status be built in this epic - triggers when user starts video call / screen sharing, restores previous status when call ends.

### Stories (10-15 total)

**Story 8.1: WebRTC Infrastructure Setup**

As developer: want reliable WebRTC signaling infrastructure; so we can establish peer-to-peer video/audio connections.

**Acceptance Criteria:**
1. Signaling server using Socket.IO / Supabase Realtime for offer/answer exchange
2. STUN/TURN server config for NAT traversal (use Twilio / self-hosted coturn)
3. Connection quality monitoring (packet loss, latency, bandwidth)
4. Fallback to TURN relay if peer-to-peer fails
5. Support up to 10 simultaneous people per space

**Prereq:** None

---

**Story 8.2: Audio-Only Calling**

As user: want to start audio-only calls in space; so can have quick voice discussions w/o video overhead.

**Acceptance Criteria:**
1. "Start Call" button in space (microphone icon)
2. Audio-only mode uses less bandwidth than video
3. People see audio indicator (volume bars) for active speakers
4. Mute/unmute toggle w/ visual indicator
5. Leave call button ends connection gracefully

**Prereq:** Story 8.1

---

**Story 8.3: Video Conferencing**

As user: want to enable video during calls; so can see colleagues + have richer interactions.

**Acceptance Criteria:**
1. "Enable Video" button during call
2. Video tiles arranged in grid layout (up to 9 shown, gallery view)
3. Self-view mirror in corner w/ flip/disable option
4. Spotlight mode (featured speaker takes center, others in sidebar)
5. Video quality adapts to bandwidth (auto-downgrade if connection poor)

**Prereq:** Story 8.2

---

**Story 8.4: Screen Sharing**

As user: want to share my screen during calls; so can present work / collaborate on documents.

**Acceptance Criteria:**
1. "Share Screen" button during call
2. Select window/tab/entire screen to share
3. Shared screen appears in main video area for all people
4. Screen sharer sees indicator sharing is active
5. Stop sharing button ends screen share

**Prereq:** Story 8.3

---

**Story 8.5: Virtual Whiteboard**

As team: want shared whiteboard for brainstorming; so we can sketch ideas collaboratively during mtgs.

**Acceptance Criteria:**
1. "Open Whiteboard" button in space opens canvas
2. Drawing tools: pen, highlighter, shapes, text, eraser
3. All people see real-time updates (via WebSocket)
4. Save whiteboard as image (PNG export)
5. Whiteboard persists in space (reload shows previous content)

**Prereq:** Story 8.3

---

**Story 8.6: Call Recording**

As mtg organizer: want to record calls for later reference; so absent team members can catch up.

**Acceptance Criteria:**
1. "Record" button (admin/organizer only)
2. All people notified when recording starts
3. Recording captures audio, video, + screen shares
4. Recording saved to Supabase Storage
5. Recording accessible from mtg notes

**Prereq:** Story 8.3

---

**Story 8.7: Background Blur and Virtual Backgrounds**

As user: want to blur my background / use virtual backgrounds; so I maintain privacy during video calls.

**Acceptance Criteria:**
1. Settings menu during call: Blur Background / None / Upload Image
2. Background processing uses client-side ML (TensorFlow.js / browser API)
3. Virtual backgrounds support custom images (company logos, scenes)
4. Perf: maintains 30 FPS video w/ background processing
5. Fallback to no processing on low-end devices

**Prereq:** Story 8.3

---

**Story 8.8: Call Quality Indicators**

As user: want to see connection quality indicators; so I know if my audio/video is clear to others.

**Acceptance Criteria:**
1. Connection quality icon (green/yellow/red) near video tile
2. Tooltip shows details: latency (ms), packet loss (%), bandwidth (kbps)
3. Warning notice if quality degrades significantly
4. Suggestion to disable video / leave/rejoin if connection poor
5. Quality metrics logged for debugging

**Prereq:** Story 8.3

---

**Story 8.9: Picture-in-Picture Mode**

As user: want to keep video call shown while using other apps; so can multitask during mtgs.

**Acceptance Criteria:**
1. "Pop-out" button opens call in floating window
2. Picture-in-picture window stays on top of other apps
3. Minimal controls shown in PiP: mute, video toggle, hang up
4. Click window to return to full Virtual Office interface
5. Browser Picture-in-Picture API for native support

**Prereq:** Story 8.3

---

**Story 8.10: Integration with Calendar (Future)**

As user: want to schedule calls via calendar integration; so team members get invites + reminders.

**Acceptance Criteria:**
1. Google Calendar / Outlook integration (OAuth setup)
2. "Schedule Call" button creates calendar event w/ Virtual Office link
3. Event includes space link + auto-join time
4. Reminder notices 5 minutes before scheduled call
5. Recurring mtg support

**Prereq:** Story 8.3

---

**Epic 8 Summary:**
- **Total Stories:** 10
- **Effort:** 30-45 hours
- **Dependencies:** WebRTC infrastructure, TURN server, TensorFlow.js (for backgrounds)
- **Key Risks:** WebRTC complexity + cross-platform compatibility - extensive testing needed

---

## Epic 9: Administrative Dashboard & Analytics ⏳ PLANNED

**Goal:**
Build full admin dashboard giving insights into team collab, presence patterns, space use, + compliance reporting - empowering managers to optimize workflows + meet regulatory requirements.

**Value:**
This epic unlocks mgmt visibility sets apart Virtual Office from consumer chat tools, enabling data-driven decisions + compliance w/ enterprise policies.

**Dependencies:** Epic 3, 4 complete (data collection exists in `space_presence_log` + messaging tables)

### Stories (8-12 total)

**Story 9.1: Admin Dashboard Home**

As n admin: want dashboard overview of key metrics; so can monitor team health + activity at glance.

**Acceptance Criteria:**
1. Dashboard displays cards: active users (today), total msgs (week), mtg hours (week), most used spaces
2. Trend graphs: daily active users (30 days), msg volume over time
3. Quick links to detailed reports (presence, spaces, msgs)
4. Real-time updates (metrics refresh every 30 seconds)
5. Role-based access: only admins see dashboard

**Prereq:** None

---

**Story 9.2: Presence Report Generation**

As mgr: want to generate reports showing user online/offline/busy/mtg hours; so can track team working patterns for compliance.

**Acceptance Criteria:**
1. Report builder: select date range, user(s), + granularity (daily/weekly/monthly)
2. Report shows table: user, online hours, busy hours, mtg hours, offline hours
3. Visual chart: stacked bar graph per user
4. Export to CSV w/ columns: user_id, date, status, hours
5. Data sourced from `space_presence_log` table

**Prereq:** Story 9.1

---

**Story 9.3: Space Utilization Analytics**

As n admin: want insights into how spaces are used; so can optimize office layout + capacity planning.

**Acceptance Criteria:**
1. Heatmap showing peak usage times for each space (hour-by-hour grid)
2. Metrics: average occupancy, max occupancy reached, use rate (% of capacity used)
3. Identify underutilized spaces (usage <20% of time)
4. Identify overutilized spaces (frequently at capacity)
5. Suggestions: "Consider adding second Marketing room" (usage >80%)

**Prereq:** Story 9.1

---

**Story 9.4: User Activity Timeline**

As mgr: want to see specific user's activity timeline; so can understand their work patterns + collab.

**Acceptance Criteria:**
1. User search/select dropdown
2. Timeline view: entries for space joins/exits, msgs sent, mtgs attended
3. Filter by date range + activity type
4. Timeline shows duration spent in each space
5. Export timeline to PDF / CSV

**Prereq:** Story 9.2

---

**Story 9.5: Team Collaboration Patterns**

As n admin: want insights into who collaborates w/ whom; so can identify silos + encourage cross-team interaction.

**Acceptance Criteria:**
1. Network graph showing users as nodes, collab frequency as edge thickness
2. Metrics: most frequent collaborators, cross-department interactions
3. Identify isolated users (low collab)
4. Department-level view: which departments collaborate most
5. Data from shared spaces, DM frequency, mtg co-attendance

**Prereq:** Story 9.3

---

**Story 9.6: Message Analytics**

As n admin: want analytics on messaging usage; so can assess engagement + identify comms bottlenecks.

**Acceptance Criteria:**
1. Metrics: total msgs (by day/week/month), msgs per user, msgs per space
2. Peak messaging times (heatmap by hour/day of week)
3. Average response time in DMs + space chats
4. Identify silent users (low msg activity) for engagement outreach
5. Filter by space, user, / date range

**Prereq:** Story 9.1

---

**Story 9.7: Compliance Audit Export**

As compliance officer: want to export detailed activity logs; so can provide audit trails to regulators.

**Acceptance Criteria:**
1. Audit export includes: user activity, msg metadata (not content unless legally required), space access logs
2. Filter by user, date range, activity type (login, space entry, msg sent)
3. Export format: CSV w/ columns: timestamp, user_id, action, metadata, ip_address (if logged)
4. Encrypted export option for sensitive data
5. Audit log of exports (who exported what data, when)

**Prereq:** Story 9.2, 9.4

---

**Story 9.8: Custom Report Builder**

As n admin: want to create custom reports w/ selected metrics; so can answer specific business questions.

**Acceptance Criteria:**
1. Report builder UI: drag-+-drop metrics, dimensions, filters
2. Available metrics: presence hours, msg counts, space usage, mtg duration
3. Dimensions: user, space, department, time period
4. Save report templates for reuse
5. Schedule automated reports (daily/weekly email delivery)

**Prereq:** Story 9.6

---

**Story 9.9: Real-Time Monitoring View**

As n admin: want real-time view of current activity; so can monitor virtual office live.

**Acceptance Criteria:**
1. Live view shows: users now online, active spaces, ongoing calls
2. Map view: see all users on floor plan w/ current locations
3. Activity feed: recent events (user joined space, msg sent, call started)
4. Alerts for anomalies (sudden spike in activity, user inactive for 48 hours)
5. Updates in real-time via Supabase Realtime subscriptions

**Prereq:** Story 9.1

---

**Story 9.10: Performance and Health Metrics**

As developer: want system perf metrics; so can monitor Virtual Office health + optimize infrastructure.

**Acceptance Criteria:**
1. Metrics dashboard: API response times, DB query perf, Realtime connection count
2. Error rate monitoring (failed API calls, Realtime disconnects)
3. Alerts for perf degradation (p95 latency >500ms, error rate >5%)
4. Integration w/ monitoring tools (Datadog, New Relic, / custom)
5. Uptime tracking + SLA reporting

**Prereq:** Story 9.1

---

**Story 9.11: User Management Tools**

As n admin: want tools to manage users efficiently; so can handle onboarding, offboarding, + role changes.

**Acceptance Criteria:**
1. User list view w/ filters (role, status, department)
2. Bulk actions: deactivate users, change roles, send announcements
3. User detail view: activity summary, permissions, assigned spaces
4. Deactivate user option (soft delete, data retained for audit)
5. Reactivate user option (restore access)

**Prereq:** Story 9.1

---

**Story 9.12: Data Retention and Privacy Controls**

As n admin: want to config data retention policies; so we comply w/ GDPR + company policies.

**Acceptance Criteria:**
1. Settings for msg retention: 30 days, 90 days, 1 year, indefinite
2. Automatic deletion of old msgs based on policy
3. User data export tool (GDPR right to data portability)
4. User data deletion tool (GDPR right to erasure)
5. Audit log of all privacy-related actions

**Prereq:** Story 9.7

---

**Epic 9 Summary:**
- **Total Stories:** 12
- **Effort:** 36-48 hours
- **Dependencies:** Analytics infrastructure, data aggregation jobs, charting library (Recharts/Chart.js)
- **Key Risks:** Perf w/ large datasets - need efficient DB queries + caching

---

## Epic 10: MERGED INTO EPIC 3

> **Note:** Epic 10 (Advanced UX & Theming - Unleashed) has been merged into Epic 3 (Visual UX & Floor Plan) as of 2025-11-25. All "Reality Distortion" theme system, Orbit Gallery, Avatar Constellation, + layout stories are now part of Epic 3.
>
> This merger prioritizes visual polish for investor demos while eliminating duplicate work between two epics.

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
- **Vertical slices** - Complete, testable features delivery
- **Sequential ordering** - Logical progression within epic
- **No forward deps** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Add technical enablers into value-delivering stories

---

## Implementation Workflow

For each story:
1. Run `create-story` workflow (Scrum Master agent) to generate detailed build plan
2. Run `story-context` workflow to gather relevant codebase context
3. Run `dev-story` workflow (Developer agent) to implement w/ AI assistance
4. Run `review-story` workflow to validate against acceptance criteria
5. Mark story complete w/ `story-approved` workflow

**Progress Tracking:**
- All stories tracked in `docs/bmm-workflow-status.yaml`
- Update status file after each story completion
- Run `workflow-status` anytime to see current progress

---

**For implementation:** Use `create-story` workflow to generate individual story build plans from this epic breakdown.
