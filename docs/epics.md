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

## Epic 2: Authentication & Company Management ✅ COMPLETE

**Expanded Goal:**
Implement secure, company-based multi-tenancy with Supabase Auth, enabling organizations to create isolated workspaces and manage team members through invitation workflows with role-based access control.

**Value Delivery:**
This epic enabled the fundamental access control model: companies can onboard teams securely, admins can manage members, and all data is isolated per company through RLS policies.

**Key Achievements:**
- Supabase Auth with email/password authentication
- SSR-compatible auth flows using @supabase/ssr
- Company creation and settings management
- User invitation system with secure token-based acceptance
- Role-based access control (Admin/Member)
- Auth middleware protecting API routes

**Stories: ~6-8** (Completed retrospectively, documented for reference)

---

## Epic 3: Interactive Floor Plan & Space Management 🚧 IN PROGRESS

**Expanded Goal:**
Create an intuitive, interactive floor plan using Konva.js that allows users to visualize their virtual office, see real-time colleague presence, and navigate between spaces. Enable admins to design custom office layouts with draggable spaces, templates, and professional visual styling that makes the virtual office feel like a real workspace.

**Value Delivery:**
The floor plan is the core differentiator from chat-only tools, providing spatial awareness and ambient presence. This epic delivers the foundation plus critical UX/design improvements to make the interface professional and delightful.

**Current Status:** Basic functionality complete; **major UX/design improvements needed**

### Stories (12-15 total)

**Story 3.1: Visual Design Overhaul**

As a user,
I want the floor plan spaces to have modern, professional visual design,
So that the virtual office feels polished and intuitive to use.

**Acceptance Criteria:**
1. Spaces display with rounded corners, subtle shadows, and professional color palette
2. Hover states clearly indicate interactive elements (cursor changes, highlight effect)
3. Active/selected space has distinct visual treatment (border, glow)
4. Space types (meeting room, focus area, lounge) have distinct visual styles (colors, icons)
5. Click targets are large enough for easy selection (minimum 40x40px interactive areas)

**Prerequisites:** None (visual refresh of existing components)

---

**Story 3.2: Space Occupancy Visualization**

As a user,
I want to see how many people are in each space at a glance,
So that I can quickly identify active areas and decide where to join.

**Acceptance Criteria:**
1. Each space displays occupancy count (e.g., "3/10")
2. Visual indicator shows occupancy level (color-coded: empty/low/medium/high/full)
3. User avatars stack or cluster within space bounds (up to 5 visible, then "+N more")
4. Tooltip on hover shows full participant list
5. Occupancy updates in real-time as users enter/exit spaces

**Prerequisites:** Story 3.1 (visual foundation)

---

**Story 3.3: Customizable Space Styling**

As an admin,
I want to customize the appearance of spaces (colors, icons, borders),
So that I can visually organize the office layout (e.g., marketing spaces blue, engineering spaces green).

**Acceptance Criteria:**
1. Space edit modal includes color picker for background/border
2. Icon library available for space types (10+ professional icons)
3. Border style options (solid, dashed, thick, thin)
4. Changes preview in real-time before saving
5. Custom styles persist in `spaces` table and render correctly on floor plan

**Prerequisites:** Story 3.1

---

**Story 3.4: Improved Space Selection UX**

As a user,
I want clear visual feedback when selecting and interacting with spaces,
So that I always know what space I'm focused on and what actions are available.

**Acceptance Criteria:**
1. Selected space highlights with clear border and optional glow effect
2. Context menu appears on right-click with actions (Join, Edit, Delete, View Details)
3. Double-click on space triggers default action (Join for members, Edit for admins)
4. Keyboard navigation supported (Tab to cycle spaces, Enter to activate)
5. Visual feedback for disabled actions (grayed out "Join" if space is full)

**Prerequisites:** Story 3.1

---

**Story 3.5: Space Grouping and Zones**

As an admin,
I want to organize spaces into zones or floors (e.g., "1st Floor", "Marketing Wing"),
So that large office layouts are easier to navigate and understand.

**Acceptance Criteria:**
1. Zone creation UI in admin settings (name, color, description)
2. Spaces can be assigned to zones via drag-and-drop or selection
3. Floor plan displays zone boundaries with subtle background colors or labels
4. Filter/toggle to show/hide specific zones
5. Zone data stored in `spaces.metadata` or new `zones` table

**Prerequisites:** Story 3.3

---

**Story 3.6: Enhanced Zoom and Pan Controls**

As a user,
I want intuitive zoom and pan controls with visual indicators,
So that I can easily navigate large floor plans without getting lost.

**Acceptance Criteria:**
1. Mouse wheel zoom centers on cursor position
2. Zoom controls (+ / - buttons) visible in corner with current zoom level (e.g., "100%")
3. "Fit to screen" button resets view to show entire floor plan
4. Pan with mouse drag (cursor changes to grab hand)
5. Mini-map in corner shows current viewport within full floor plan (for large offices)

**Prerequisites:** Story 3.4

---

**Story 3.7: Space Templates Gallery**

As an admin,
I want a visual gallery of pre-designed space templates,
So that I can quickly create professional-looking spaces without starting from scratch.

**Acceptance Criteria:**
1. Template gallery modal shows 8+ templates with previews (Meeting Room, Focus Area, Lounge, etc.)
2. Each template includes icon, default colors, capacity, and description
3. One-click to add template to floor plan at cursor position
4. Templates are configurable (admins can create custom templates)
5. Template data stored in `spaces` table with `is_template: true` flag

**Prerequisites:** Story 3.3

---

**Story 3.8: Space Capacity and "Room Full" Handling**

As a user,
I want clear visual indication when a space is at capacity,
So that I don't try to join full spaces and get blocked.

**Acceptance Criteria:**
1. Spaces display capacity badge (e.g., "10/10 - Full")
2. Full spaces have visual treatment (grayed out, "Full" label, lock icon)
3. "Join" button disabled for full spaces with tooltip explaining why
4. Option to "Knock to Enter" even when full (admin can expand capacity temporarily)
5. Capacity validation enforced in API (`POST /api/spaces/join`)

**Prerequisites:** Story 3.2

---

**Story 3.9: Real-Time Presence Animation**

As a user,
I want smooth animations when colleagues enter or exit spaces,
So that the floor plan feels alive and updates feel natural rather than jarring.

**Acceptance Criteria:**
1. User avatars fade in when entering spaces (300ms transition)
2. Avatars fade out when leaving spaces
3. Movement between spaces shows smooth transition (avatar slides from old to new location)
4. Presence status changes (online → away) animate smoothly (color transition)
5. Performance: animations maintain 60 FPS even with 20+ users on floor plan

**Prerequisites:** Story 3.2

---

**Story 3.10: Space Detail Panel Redesign**

As a user,
I want a modern, informative space detail panel,
So that I can quickly see who's in a space and what's happening before I join.

**Acceptance Criteria:**
1. Panel slides in from right side when space is selected (not a modal)
2. Shows space name, type icon, description, capacity, current occupants
3. Participant list with avatars, names, and status indicators
4. Recent messages preview from space conversation (last 3 messages)
5. Primary action button (Join/Knock/Leave) prominent at bottom

**Prerequisites:** Story 3.4

---

**Story 3.11: Drag-and-Drop Space Positioning Polish**

As an admin,
I want smooth, snapping drag-and-drop for positioning spaces,
So that I can create organized, grid-aligned floor plans easily.

**Acceptance Criteria:**
1. Spaces snap to grid when dragging (configurable grid size: 10px, 20px, 50px)
2. Drag ghost/preview shows where space will land
3. Collision detection prevents overlapping spaces (visual warning + prevent drop)
4. Alignment guides appear when space aligns with other spaces (horizontal/vertical lines)
5. Undo/redo support for space movements

**Prerequisites:** Story 3.4

---

**Story 3.12: Mobile-Responsive Floor Plan (Basic)**

As a mobile user,
I want to view and navigate the floor plan on my phone,
So that I can see team presence even when away from my desktop.

**Acceptance Criteria:**
1. Floor plan renders on mobile devices (responsive canvas scaling)
2. Touch gestures supported (pinch to zoom, two-finger pan)
3. Space detail panel adapted for mobile (bottom sheet instead of side panel)
4. Mobile view prioritizes viewing over editing (admin edit features hidden on mobile)
5. Performance acceptable on mid-range phones (30 FPS minimum)

**Prerequisites:** Story 3.6, 3.10

---

**Epic 3 Summary:**
- **Total Stories:** 12
- **Estimated Effort:** 24-36 hours
- **Dependencies:** Konva.js library, existing floor plan component
- **Key Risk:** Performance with 50+ spaces and real-time updates - need optimization testing

---

## Epic 4A: Real-Time Messaging - Timeline & Composer 🚧 IN PROGRESS

**Expanded Goal:**
Deliver user-facing messaging features to achieve feature parity with Slack/Teams: threaded conversations, reactions, message pins/stars, read receipts, infinite scroll, file attachments, voice notes, and conversation search. This epic focuses on the Timeline and Composer user experience.

**Value Delivery:**
This epic completes the core messaging UX, enabling teams to communicate with the same richness they expect from modern chat tools, making Virtual Office a viable Slack/Teams replacement.

**Task Alignment:** Tasks 2.5 + 3.0 from `tasks/tasks-0001-prd-unified-messaging-system.md`

**Current Status:**
- ✅ **Foundation Complete (Tasks 1.0 + 2.0):** Data contracts, APIs, unified drawer shell, conversation grouping
- 🚧 **In Progress:** Timeline UI rendering and composer features

### Stories (12 total; Stories 4A.1-4A.12 = Original 4.11-4.22)

**Remaining Stories (Tasks 2.5, 3.0):**

---

**Story 4A.1: Playwright E2E Tests for Drawer Interactions** (Task 2.5)

As a QA engineer,
I want end-to-end tests validating drawer interactions,
So that we ensure the messaging drawer works correctly across different scenarios.

**Acceptance Criteria:**
1. Test: Open drawer → Select DM conversation → Send message → Verify realtime delivery
2. Test: Filter conversations by pinned → Verify only pinned conversations show
3. Test: Switch between room and DM tabs → Verify correct conversation lists load
4. Test: Navigate to different space on floor plan → Verify drawer stays open and stable
5. Test: Archive conversation → Verify it moves to archived section
6. All tests pass in CI/CD pipeline

**Prerequisites:** Tasks 1.0 + 2.0 complete (drawer and conversation list)

---

**Story 4A.2: Render Reply Indicators and Thread UI** (Task 3.1)

As a user,
I want to see reply threads visually in the message timeline,
So that I can follow conversation flow and respond to specific messages.

**Acceptance Criteria:**
1. Messages with replies show reply count badge (e.g., "3 replies")
2. Click reply badge expands thread inline (indented messages)
3. Thread UI shows parent message at top with replies below
4. "Reply" button on each message opens composer in reply mode
5. Reply composer shows preview of message being replied to with cancel option

**Prerequisites:** Story 4A.1

---

**Story 4A.3: Reaction Chips and Emoji Picker** (Task 3.1)

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

**Prerequisites:** Story 4A.2

---

**Story 4A.4: Pinned and Starred Message Indicators** (Task 3.1)

As a user,
I want to pin important messages and star messages for later reference,
So that I can quickly find key information in busy conversations.

**Acceptance Criteria:**
1. Message context menu includes "Pin Message" and "Star Message" options
2. Pinned messages show pin icon and appear in "Pinned Messages" section at top of feed
3. Starred messages show star icon and are accessible via "Starred" filter
4. Unpin/unstar options available in context menu
5. Pin/star actions persist via API (`POST /api/messages/pin`, `/api/messages/star`)

**Prerequisites:** Story 4A.3

---

**Story 4A.5: Read Receipts Display** (Task 3.1)

As a user,
I want to see who has read my messages,
So that I know if my team saw important information.

**Acceptance Criteria:**
1. Sent messages show read status: "Sent", "Delivered", "Read by 3"
2. Hover over "Read by 3" shows tooltip with names and timestamps
3. DMs show specific read receipt: "Read by Jane at 2:45 PM"
4. Read receipts update in real-time as others view messages
5. Read receipt data fetched from `message_read_receipts` table

**Prerequisites:** Story 4A.4

---

**Story 4A.6: Infinite Scroll with Pagination** (Task 3.2)

As a user,
I want to scroll up through message history infinitely,
So that I can access old conversations without pagination buttons.

**Acceptance Criteria:**
1. Initial load shows last 50 messages
2. Scrolling to top triggers automatic load of older messages (50 more)
3. Loading indicator appears during fetch
4. Scroll position maintained after new messages load (no jump)
5. Performance: smooth scrolling with 500+ messages in conversation

**Prerequisites:** Story 4A.5

---

**Story 4A.7: Auto-Scroll to New Messages with Indicator** (Task 3.2)

As a user,
I want the feed to auto-scroll when new messages arrive,
So that I see new content without manual scrolling.

**Acceptance Criteria:**
1. If user is near bottom (within 100px), auto-scroll to new message
2. If user is scrolled up, show "New Messages" button at bottom (floating)
3. Click "New Messages" button scrolls to bottom and marks messages read
4. Button shows count of unread messages (e.g., "3 new messages")
5. Auto-scroll respects user intent (doesn't scroll if user actively reading old messages)

**Prerequisites:** Story 4A.6

---

**Story 4A.8: File Attachment Drag-and-Drop** (Task 3.3)

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

**Prerequisites:** Story 4A.7

---

**Story 4A.9: File Attachment Preview** (Task 3.3)

As a user,
I want to preview attachments inline in the message feed,
So that I can view images and files without downloading.

**Acceptance Criteria:**
1. Image attachments display thumbnail in message (click to enlarge)
2. PDF attachments show first page preview
3. Other files show icon with filename and download button
4. Click image opens lightbox viewer with zoom controls
5. Download button triggers secure file download from Supabase Storage URL

**Prerequisites:** Story 4A.8

---

**Story 4A.10: Voice Note Recording** (Task 3.3)

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

**Prerequisites:** Story 4A.9

---

**Story 4A.11: Conversation Search** (Task 3.4)

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

**Prerequisites:** Story 4A.10

---

**Story 4A.12: Starred Messages Filter** (Task 3.4)

As a user,
I want to filter the feed to show only starred messages,
So that I can review important messages I've saved.

**Acceptance Criteria:**
1. "Show Starred Only" toggle button above feed
2. When enabled, feed displays only messages user has starred
3. Starred messages show in chronological order with context (conversation name)
4. Disable toggle returns to full conversation view
5. Starred filter works alongside search (can search within starred)

**Prerequisites:** Story 4A.11

---

**Epic 4A Summary:**
- **Total Stories:** 12
- **Estimated Effort:** 24-32 hours
- **Dependencies:** Supabase Storage, Web APIs (MediaRecorder for voice notes)
- **Key Risk:** Attachment handling and voice note encoding across browsers
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Tasks 2.5 + 3.0

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

**Prerequisites:** Story 4B.6

---

**Story 4B.8: Playwright Tests for Offline and Realtime** (Task 4.5)

As a QA engineer,
I want E2E tests covering offline scenarios and reconnection,
So that we ensure messaging reliability under adverse network conditions.

**Acceptance Criteria:**
1. Test: Send message while offline → Goes to queue → Auto-sends on reconnect
2. Test: Disconnect Realtime → Polling fallback activates → Messages received via polling
3. Test: Reconnection with exponential backoff → Verify retry intervals
4. Test: Duplicate message prevention → Same message doesn't appear twice after reconnect
5. Test: Multi-client read receipts → Mark read on device 1 → Syncs to device 2

**Prerequisites:** Story 4B.7

---

**Epic 4B Summary:**
- **Total Stories:** 8
- **Estimated Effort:** 16-24 hours
- **Dependencies:** Supabase Realtime, Web APIs (Notifications API)
- **Key Risk:** Offline reliability and reconnection complexity - extensive testing required
- **Task Reference:** `tasks/tasks-0001-prd-unified-messaging-system.md` Tasks 4.0 + 5.0

---

**Combined Epic 4A + 4B Summary:**
- **Total Stories:** 20 (4A: 12 stories, 4B: 8 stories)
- **Combined Effort:** 40-56 hours
- **Implementation Order:** Complete Epic 4A first (user-facing features), then Epic 4B (resilience/scale)
- **Original Epic 4 Stories 4.1-4.10:** Complete (Tasks 1.0 + 2.0)
- **Remaining Stories:** 4A.1-4A.12 (Timeline/Composer) + 4B.1-4B.8 (Resilience/Scale)

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
