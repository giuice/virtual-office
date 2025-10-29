# Technical Specification: Real-Time Messaging - Timeline & Composer

Date: 2025-10-23
Author: Giuliano
Epic ID: 4A
Status: Draft

---

## Overview

Epic 4A delivers user-facing messaging features to achieve feature parity with Slack/Teams: threaded conversations, emoji reactions, message pins/stars, read receipts, infinite scroll pagination, file attachments, voice notes, and conversation search. This epic focuses on the Timeline (message feed) and Composer (message input) user experience, building upon the completed foundation from Tasks 1.0 + 2.0 (data contracts, APIs, unified drawer shell, conversation grouping).

This epic transforms messaging from functional (Tasks 1.0 + 2.0: data layer complete) to production-ready with rich UX features that match modern collaboration tools. Epic 4A addresses Tasks 2.5 + 3.0 from the unified messaging task breakdown, delivering 12 stories (4A.1-4A.12) that cover E2E testing, thread UI, reactions, pins/stars, read receipts, infinite scroll, attachments, voice notes, and search.

## Objectives and Scope

**In Scope:**
- Story 4A.1: Playwright E2E tests for drawer interactions (open, filter, tab switching, archiving)
- Story 4A.2: Render reply indicators and thread UI with inline expansion
- Story 4A.3: Emoji reaction chips with picker popover and real-time updates
- Story 4A.4: Pinned and starred message indicators with filter UI
- Story 4A.5: Read receipts display with tooltips showing reader names/timestamps
- Story 4A.6: Infinite scroll pagination maintaining scroll position
- Story 4A.7: Auto-scroll to new messages with "New Messages" indicator button
- Story 4A.8: File attachment drag-and-drop with upload progress and preview
- Story 4A.9: File attachment preview (images inline, PDFs first page, others as icons)
- Story 4A.10: Voice note recording with waveform visualization and playback
- Story 4A.11: Conversation-level search with highlighting and navigation
- Story 4A.12: Starred messages filter toggle

**Out of Scope:**
- Offline message queue and resilience (Epic 4B: Stories 4B.1-4B.3)
- Realtime reconnection with exponential backoff (Epic 4B: Story 4B.2)
- Typing indicators and multi-client sync (Epic 4B: Stories 4B.4-4B.5)
- Analytics events and desktop notifications (Epic 4B: Stories 4B.6-4B.7)
- Video/screen sharing (Epic 8)
- AI-powered features like semantic search (Epic 7)

## System Architecture Alignment

**Foundation Components (Tasks 1.0 + 2.0 Complete):**
- Database schema with `conversation_preferences`, `message_read_receipts`, `message_pins`, `message_stars` tables
- Extended `IConversationRepository` with grouped queries, pinned conversations, unread summaries
- Extended `IMessageRepository` with attachments, reactions, read receipts support
- API routes: `/api/conversations/*`, `/api/messages/*` with RLS enforcement
- `MessagingDrawer.tsx` unified drawer shell
- `ConversationList.tsx` with grouping, pin/star/archive support
- Repository Pattern with Supabase implementations

**Epic 4A Build Upon:**
- **Message Feed:** `EnhancedMessageFeed.tsx` → extend for replies, reactions, pins, infinite scroll
- **Message Item:** `message-item.tsx` → add UI for threads, reactions, read receipts
- **Composer:** `EnhancedMessageComposer.tsx` → add attachments, voice notes, emoji picker
- **Query Hooks:** `useMessages.ts` → implement pagination cursors
- **Realtime Hooks:** `useMessageSubscription.ts` → stable (reconnection deferred to Epic 4B)
- **Storage:** Supabase Storage for attachments and voice notes
- **Testing:** Playwright config at `playwright.config.ts`

**Architecture Constraints:**
- Repository Pattern: All data access via `IConversationRepository` and `IMessageRepository`
- Supabase Server Client: API routes use `createSupabaseServerClient()` for RLS context
- Supabase Browser Client: Components use `createSupabaseBrowserClient()` for realtime
- RLS Policies: All tables enforce company_id isolation and user permissions
- TypeScript Strict Mode: Explicit types for all props, state, and API contracts

## Detailed Design

### Services and Modules

| Module | Responsibility | Inputs | Outputs | Owner |
|--------|---------------|--------|---------|-------|
| `EnhancedMessageFeed.tsx` | Renders message timeline with threads, reactions, pins, infinite scroll | `conversationId`, `messages[]`, pagination cursor | Message list UI with interaction affordances | Frontend |
| `message-item.tsx` | Individual message renderer with reply preview, reactions, read receipts | `Message`, `currentUserId`, reaction callbacks | Single message component with actions menu | Frontend |
| `EnhancedMessageComposer.tsx` | Message input with attachments, voice notes, emoji picker | `conversationId`, `replyToMessage?` | Send message action, upload progress | Frontend |
| `useMessages.ts` | Query hook for message data with pagination | `conversationId`, `cursor`, `limit` | `{ messages, hasMore, loadMore, isLoading }` | Frontend Hook |
| `useMessageSubscription.ts` | Realtime subscription for new messages | `conversationId` | Realtime message updates | Frontend Hook |
| `SupabaseMessageRepository` | Message CRUD with attachments, reactions, pins | Message entity, attachment metadata | Database operations | Backend Repository |
| `/api/messages/create` | Message send endpoint with attachment upload | POST body: `{ conversation_id, content, attachment?, parent_id? }` | `{ message_id, status, attachment_url? }` | API Route |
| `/api/messages/react` | Emoji reaction endpoint | POST body: `{ message_id, emoji }` | `{ reaction_id, aggregated_reactions }` | API Route |
| `/api/messages/pin` | Pin/unpin message endpoint | POST body: `{ message_id, pinned: boolean }` | `{ pin_id, status }` | API Route |
| `/api/messages/star` | Star/unstar message endpoint | POST body: `{ message_id, starred: boolean }` | `{ star_id, status }` | API Route |
| Supabase Storage | File/voice note storage | File upload multipart | Secure URL with expiry | Supabase Service |

### Data Models and Contracts

**Key Database Tables:**

```typescript
// messages table (existing, extended)
{
  id: UUID,
  conversation_id: UUID,
  sender_id: UUID,
  content: string,
  parent_message_id: UUID | null,  // for threads
  created_at: timestamp,
  updated_at: timestamp,
  company_id: UUID
}

// message_attachments table (existing, extended)
{
  id: UUID,
  message_id: UUID,
  file_name: string,
  file_type: string,
  file_size: number,
  storage_path: string,
  thumbnail_url: string | null,
  voice_note_duration: number | null,  // for voice notes
  voice_note_waveform: JSON | null,    // waveform data
  created_at: timestamp,
  company_id: UUID
}

// message_reactions table (existing)
{
  id: UUID,
  message_id: UUID,
  user_id: UUID,
  emoji: string,
  created_at: timestamp,
  company_id: UUID
}

// message_pins table (existing)
{
  id: UUID,
  message_id: UUID,
  pinned_by: UUID,
  pinned_at: timestamp,
  company_id: UUID
}

// message_stars table (existing)
{
  id: UUID,
  message_id: UUID,
  starred_by: UUID,
  starred_at: timestamp,
  company_id: UUID
}

// message_read_receipts table (existing)
{
  id: UUID,
  message_id: UUID,
  user_id: UUID,
  read_at: timestamp,
  company_id: UUID
}
```

**TypeScript Interfaces:**

```typescript
// From src/types/messaging.ts (extended)
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  parentMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Extended fields for Epic 4A
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  isPinned?: boolean;
  isStarredByUser?: boolean;
  readBy?: ReadReceipt[];
  replyCount?: number;
}

interface MessageAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  thumbnailUrl?: string;
  voiceNoteDuration?: number;
  voiceNoteWaveform?: number[];
}

interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
  userReacted: boolean;
}

interface ReadReceipt {
  userId: string;
  userName: string;
  readAt: Date;
}
```

### APIs and Interfaces

**Message Creation with Attachment:**
```
POST /api/messages/create
Headers: { Authorization: Bearer <token> }
Body: {
  conversation_id: string,
  content: string,
  attachment?: File,
  parent_message_id?: string  // for replies
}
Response: {
  message_id: string,
  status: "sent" | "uploading",
  attachment_url?: string
}
Error Codes: 400 (invalid), 401 (unauthorized), 413 (file too large), 500 (server error)
```

**Emoji Reaction:**
```
POST /api/messages/react
Headers: { Authorization: Bearer <token> }
Body: {
  message_id: string,
  emoji: string,
  action: "add" | "remove"
}
Response: {
  reaction_id: string,
  aggregated_reactions: MessageReaction[]
}
Error Codes: 400 (invalid emoji), 401 (unauthorized), 404 (message not found)
```

**Pin/Star Message:**
```
POST /api/messages/pin
POST /api/messages/star
Headers: { Authorization: Bearer <token> }
Body: {
  message_id: string,
  pinned/starred: boolean
}
Response: {
  id: string,
  status: "success"
}
```

**Paginated Message Fetch:**
```
GET /api/messages?conversation_id=<id>&cursor=<timestamp>&limit=50
Headers: { Authorization: Bearer <token> }
Response: {
  messages: Message[],
  next_cursor: string | null,
  has_more: boolean
}
```

**Search Messages:**
```
GET /api/messages/search?conversation_id=<id>&query=<text>
Headers: { Authorization: Bearer <token> }
Response: {
  results: Message[],
  total_count: number
}
```

### Workflows and Sequencing

**Story 4A.2: Thread Reply Flow**
1. User hovers over message → "Reply" button appears
2. Click "Reply" → Composer enters reply mode
3. Composer shows parent message preview with cancel button
4. User types reply and sends
5. API creates message with `parent_message_id` set
6. Thread UI shows reply count badge on parent
7. Click badge → Thread expands inline with indented replies

**Story 4A.3: Reaction Flow**
1. User hovers over message → "+emoji" button appears
2. Click button → Emoji picker popover opens
3. User selects emoji (or searches)
4. API call: `POST /api/messages/react` with emoji
5. Realtime update broadcasts to all participants
6. Reaction chip appears below message with count
7. Click existing reaction → Toggle user's reaction on/off

**Story 4A.8: File Attachment Flow**
1. User drags file over composer → Drop zone highlight
2. Drop file → File validation (type, size < 10MB)
3. Upload starts → Progress indicator (0-100%)
4. On complete → Preview chip appears (thumbnail for images)
5. User clicks send → Message created with attachment metadata
6. API stores file in Supabase Storage, returns URL
7. Message appears in feed with attachment preview

**Story 4A.10: Voice Note Flow**
1. User clicks microphone button → Permission request
2. Grant permission → Recording starts
3. Waveform visualization animates during recording
4. Click stop → Recording ends, playback preview shown
5. User reviews → Click send
6. Upload to Supabase Storage with metadata
7. Voice note appears in feed with play/pause control

## Non-Functional Requirements

### Performance

- **Message Render Latency:** < 100ms for rendering 50 messages in feed
- **Infinite Scroll:** Load next 50 messages in < 500ms from database
- **Attachment Upload:** Show progress indicator; complete 10MB file in < 30s on average connection
- **Voice Note Recording:** Real-time waveform visualization at 60 FPS
- **Emoji Picker:** Open picker popover in < 200ms with smooth scrolling
- **Search:** Return results within 1 second for queries across 1000+ messages
- **Realtime Latency:** New messages/reactions appear within 2 seconds (Supabase Realtime SLA)
- **Scroll Performance:** Maintain 60 FPS during infinite scroll with 500+ messages loaded

**Performance Monitoring:**
- Track message send latency (composer submit → API response)
- Track attachment upload time and failure rate
- Monitor infinite scroll performance (time to render new batch)
- Alert if p95 latency exceeds thresholds

### Security

- **Authentication:** All API routes protected by Supabase Auth middleware (`createSupabaseServerClient`)
- **Authorization:** RLS policies enforce company_id isolation and conversation membership
  - Users can only read messages in conversations they're part of
  - Users can only pin/star/react to messages in accessible conversations
  - Attachment URLs signed with expiry (Supabase Storage security)
- **File Upload Validation:**
  - Server-side file type validation (whitelist: images, PDFs, docs, archives)
  - File size limit: 10 MB per attachment
  - Malware scanning for uploaded files (future: integrate ClamAV or similar)
- **XSS Prevention:** Sanitize message content before rendering (escape HTML, prevent script injection)
- **CSRF Protection:** API routes use Supabase auth tokens, no session cookies
- **Rate Limiting:** Message send: 10 requests/minute per user; reaction: 30 requests/minute

**Security Audit Requirements:**
- RLS policy review for all new API endpoints
- Penetration testing for file upload flows
- Code review for XSS vectors in message rendering

### Reliability/Availability

- **Message Delivery:** 99.9% delivery success rate (excluding network failures)
- **Attachment Storage:** 99.99% availability via Supabase Storage SLA
- **Graceful Degradation:**
  - If Supabase Realtime unavailable → Show warning, polling fallback (Epic 4B)
  - If Storage API unavailable → Disable attachment upload, show error message
  - If emoji picker CDN fails → Fallback to basic emoji list
- **Error Recovery:**
  - Failed message sends show "Retry" button (offline queue in Epic 4B)
  - Failed attachment uploads allow re-upload without losing message content
  - Duplicate message prevention via idempotency keys (send once, receive once)
- **Data Consistency:**
  - Read receipts eventually consistent (may lag 1-2 seconds during high load)
  - Reaction counts accurate within 5 seconds
  - Pinned messages list updates in real-time

### Observability

- **Logging:**
  - Structured logs for all API calls: `debugLogger.messaging.info({ action, messageId, conversationId, latency })`
  - Error logs with stack traces for failed operations
  - Attachment upload/download events logged with file size and duration
- **Metrics:**
  - Message send rate (messages/second per conversation)
  - Attachment upload success/failure rate
  - Reaction addition rate
  - Search query latency (p50, p95, p99)
  - Infinite scroll pagination performance
- **Traces:**
  - End-to-end tracing for message send flow (composer → API → DB → realtime broadcast)
  - Attachment upload trace (validation → storage → DB update)
- **Alerts:**
  - Message send failure rate > 5% over 5 minutes
  - Attachment upload failure rate > 10% over 5 minutes
  - API latency p95 > 2 seconds
  - Supabase Realtime disconnection rate > 5% of connections
- **Dashboards:**
  - Real-time messaging health dashboard (send rate, error rate, latency)
  - Attachment usage dashboard (storage consumed, upload trends)
  - User engagement metrics (messages sent, reactions used, searches performed)

## Dependencies and Integrations

**External Dependencies (from package.json):**

| Dependency | Version | Purpose | Critical Path |
|------------|---------|---------|---------------|
| `@supabase/supabase-js` | ^2.49.4 | Database client, Realtime, Storage | Yes - Core data layer |
| `@supabase/ssr` | ^0.7.0 | Server-side auth for API routes | Yes - Authentication |
| `@tanstack/react-query` | ^5.72.2 | Data fetching, caching, mutations | Yes - State management |
| `@radix-ui/react-*` | ^1.x | Accessible UI primitives (dropdowns, popovers, tooltips) | Yes - Component library |
| `lucide-react` | ^0.546.0 | Icon library for UI affordances | No - Can fallback to emojis |
| `date-fns` | ^4.1.0 | Date formatting for timestamps | No - Can use native Intl |
| `next` | ^15.5.2 | Framework (App Router, Server Actions, API Routes) | Yes - Core framework |
| `react` / `react-dom` | ^19.1.0 | UI rendering | Yes - Core framework |
| `typescript` | ^5 | Type safety | Yes - Development |

**Supabase Services:**
- **Supabase PostgreSQL:** Message storage, relationships, RLS enforcement
- **Supabase Realtime:** Live message updates, reaction broadcasts
- **Supabase Storage:** File attachments and voice notes with signed URLs
- **Supabase Auth:** User authentication and session management

**Internal Module Dependencies:**

| Epic 4A Module | Depends On (Foundation) |
|----------------|------------------------|
| `EnhancedMessageFeed.tsx` | `useMessages`, `useMessageSubscription`, `message-item.tsx` |
| `message-item.tsx` | `src/types/messaging.ts`, `EnhancedAvatarV2`, Radix UI components |
| `EnhancedMessageComposer.tsx` | `createSupabaseBrowserClient`, Supabase Storage, `useMessages` mutations |
| `useMessages.ts` | `IMessageRepository`, `@tanstack/react-query` |
| `useMessageSubscription.ts` | `createSupabaseBrowserClient`, Supabase Realtime channels |
| `/api/messages/*` | `createSupabaseServerClient`, `SupabaseMessageRepository` |

**Browser APIs:**
- **MediaRecorder API:** Voice note recording (Story 4A.10)
- **File API:** Drag-and-drop file handling (Story 4A.8)
- **Intersection Observer API:** Infinite scroll trigger (Story 4A.6)
- **Clipboard API:** Copy message content (future enhancement)

**Testing Dependencies:**
- **Vitest:** Unit and component tests (`^3.1.1`)
- **@testing-library/react:** Component testing utilities (`^16.3.0`)
- **@playwright/test:** E2E browser automation (`^1.51.1`)
- **happy-dom / jsdom:** DOM simulation for Vitest

**Version Constraints:**
- Next.js 15.3.0+ required for App Router stability
- React 19.1.0 required for new concurrent features
- Supabase JS SDK 2.49.4+ for latest Realtime improvements
- TypeScript 5+ for satisfies operator and const type parameters

## Acceptance Criteria (Authoritative)

**Story 4A.1: Playwright E2E Tests for Drawer Interactions**
1. Test: Open drawer → Select DM conversation → Send message → Verify realtime delivery
2. Test: Filter conversations by pinned → Verify only pinned conversations show
3. Test: Switch between room and DM tabs → Verify correct conversation lists load
4. Test: Navigate to different space on floor plan → Verify drawer stays open and stable
5. Test: Archive conversation → Verify it moves to archived section
6. All tests pass in CI/CD pipeline

**Story 4A.2: Render Reply Indicators and Thread UI**
1. Messages with replies show reply count badge (e.g., "3 replies")
2. Click reply badge expands thread inline (indented messages)
3. Thread UI shows parent message at top with replies below
4. "Reply" button on each message opens composer in reply mode
5. Reply composer shows preview of message being replied to with cancel option

**Story 4A.3: Reaction Chips and Emoji Picker**
1. Hover over message shows reaction button (+emoji icon)
2. Click reaction button opens emoji picker popover
3. Emoji picker shows frequently used + all emojis with search
4. Selected emoji appears as reaction chip below message with count (👍 3)
5. Click existing reaction chip toggles user's reaction on/off
6. Reactions update in real-time for all participants

**Story 4A.4: Pinned and Starred Message Indicators**
1. Message context menu includes "Pin Message" and "Star Message" options
2. Pinned messages show pin icon and appear in "Pinned Messages" section at top of feed
3. Starred messages show star icon and are accessible via "Starred" filter
4. Unpin/unstar options available in context menu
5. Pin/star actions persist via API (`POST /api/messages/pin`, `/api/messages/star`)

**Story 4A.5: Read Receipts Display**
1. Sent messages show read status: "Sent", "Delivered", "Read by 3"
2. Hover over "Read by 3" shows tooltip with names and timestamps
3. DMs show specific read receipt: "Read by Jane at 2:45 PM"
4. Read receipts update in real-time as others view messages
5. Read receipt data fetched from `message_read_receipts` table

**Story 4A.6: Infinite Scroll with Pagination**
1. Initial load shows last 50 messages
2. Scrolling to top triggers automatic load of older messages (50 more)
3. Loading indicator appears during fetch
4. Scroll position maintained after new messages load (no jump)
5. Performance: smooth scrolling with 500+ messages in conversation

**Story 4A.7: Auto-Scroll to New Messages with Indicator**
1. If user is near bottom (within 100px), auto-scroll to new message
2. If user is scrolled up, show "New Messages" button at bottom (floating)
3. Click "New Messages" button scrolls to bottom and marks messages read
4. Button shows count of unread messages (e.g., "3 new messages")
5. Auto-scroll respects user intent (doesn't scroll if user actively reading old messages)

**Story 4A.8: File Attachment Drag-and-Drop**
1. Drag file over composer shows drop zone with visual highlight
2. Drop file triggers upload to Supabase Storage
3. Upload progress indicator shows percentage
4. Attached file appears as preview chip with filename, size, and remove button
5. Send message includes attachment metadata in `message_attachments` table
6. Supported file types: images (jpg, png, gif), docs (pdf, docx), archives (zip)
7. Max file size: 10 MB per attachment

**Story 4A.9: File Attachment Preview**
1. Image attachments display thumbnail in message (click to enlarge)
2. PDF attachments show first page preview
3. Other files show icon with filename and download button
4. Click image opens lightbox viewer with zoom controls
5. Download button triggers secure file download from Supabase Storage URL

**Story 4A.10: Voice Note Recording**
1. Microphone button in composer starts recording (request permission if needed)
2. Recording UI shows waveform visualization and duration counter
3. Stop button ends recording and shows playback preview
4. Send button uploads voice note to Supabase Storage and sends message
5. Voice notes display in feed with play/pause button and waveform
6. Voice note metadata stored in `message_attachments` table with `type: voice_note`

**Story 4A.11: Conversation Search**
1. Search input at top of message feed
2. Type query → real-time search highlights matching messages
3. Search matches message content, sender name, and attachment filenames
4. Jump to next/previous match with arrow buttons
5. Search persists across scrolling (maintains highlights)
6. Clear search button restores normal view

**Story 4A.12: Starred Messages Filter**
1. "Show Starred Only" toggle button above feed
2. When enabled, feed displays only messages user has starred
3. Starred messages show in chronological order with context (conversation name)
4. Disable toggle returns to full conversation view
5. Starred filter works alongside search (can search within starred)

## Traceability Mapping

| AC# | Story | Spec Section | Components/APIs | Test Strategy |
|-----|-------|--------------|-----------------|---------------|
| 4A.1.1-4A.1.6 | E2E Tests | Testing Framework | Playwright, MessagingDrawer, ConversationList | E2E test suite in `__tests__/api/playwright/` |
| 4A.2.1-4A.2.5 | Thread UI | Workflows → Thread Reply Flow | `message-item.tsx`, `EnhancedMessageComposer`, `/api/messages/create` | Vitest: Thread rendering, API: parent_message_id handling |
| 4A.3.1-4A.3.6 | Reactions | Workflows → Reaction Flow | `message-item.tsx`, EmojiPicker, `/api/messages/react` | Vitest: Reaction toggle, Playwright: Realtime reaction sync |
| 4A.4.1-4A.4.5 | Pin/Star | APIs → Pin/Star endpoints | `message-item.tsx`, `/api/messages/pin`, `/api/messages/star` | Vitest: Pin/star UI state, API: RLS enforcement |
| 4A.5.1-4A.5.5 | Read Receipts | Data Models → message_read_receipts | `message-item.tsx`, `SupabaseMessageRepository` | Vitest: Read receipt aggregation, API: Multi-user read tracking |
| 4A.6.1-4A.6.5 | Infinite Scroll | NFR → Performance | `EnhancedMessageFeed`, `useMessages` pagination | Vitest: Pagination cursor logic, E2E: Scroll performance |
| 4A.7.1-4A.7.5 | Auto-Scroll | Workflows → Auto-scroll logic | `EnhancedMessageFeed`, Intersection Observer | Vitest: Scroll position detection, E2E: New message indicator |
| 4A.8.1-4A.8.7 | Attachment Upload | Workflows → File Attachment Flow | `EnhancedMessageComposer`, Supabase Storage, `/api/messages/create` | Vitest: File validation, E2E: Upload progress, Storage: URL security |
| 4A.9.1-4A.9.5 | Attachment Preview | Data Models → message_attachments | `message-item.tsx`, AttachmentPreview component | Vitest: Preview rendering, E2E: Lightbox interaction |
| 4A.10.1-4A.10.6 | Voice Notes | Workflows → Voice Note Flow | `EnhancedMessageComposer`, MediaRecorder API, Supabase Storage | Vitest: Waveform generation, E2E: Record → Upload → Playback |
| 4A.11.1-4A.11.6 | Search | APIs → Search endpoint | SearchInput, `/api/messages/search` | Vitest: Search query building, API: Full-text search performance |
| 4A.12.1-4A.12.5 | Starred Filter | Data Models → message_stars | `EnhancedMessageFeed`, FilterToggle | Vitest: Filter state management, API: Starred query optimization |

## Risks, Assumptions, Open Questions

**Risks:**
1. **Attachment Upload Performance (HIGH):**
   - Risk: 10 MB file uploads may timeout on slow connections
   - Mitigation: Implement chunked uploads for files > 5MB; show cancel button; fallback to smaller file size limit if CDN unavailable
   
2. **Voice Note Browser Compatibility (MEDIUM):**
   - Risk: MediaRecorder API not supported in all browsers (Safari < 14.1)
   - Mitigation: Feature detection; show "Voice notes not supported" message; graceful degradation to text-only composer
   
3. **Infinite Scroll Memory Leak (MEDIUM):**
   - Risk: Loading 500+ messages may cause memory issues on mobile devices
   - Mitigation: Implement message virtualization (react-window); unload messages when scrolled out of view; monitor heap usage
   
4. **Emoji Picker Performance (LOW):**
   - Risk: Rendering 1000+ emojis may lag on low-end devices
   - Mitigation: Lazy-load emoji sections; implement search debouncing; use emoji CDN with caching
   
5. **Read Receipt Race Conditions (LOW):**
   - Risk: Multiple users reading simultaneously may cause receipt duplication
   - Mitigation: Unique constraint on (message_id, user_id); upsert logic in API; eventual consistency acceptable

**Assumptions:**
1. Foundation from Tasks 1.0 + 2.0 is stable and tested (data contracts, APIs, drawer shell)
2. Supabase Realtime has < 2 second latency for message delivery (per Supabase SLA)
3. Users have modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
4. Supabase Storage has sufficient quota for team file uploads (plan limits: 1GB free, 100GB pro)
5. MediaRecorder API produces WebM format voice notes (compatible with modern browsers)
6. Emoji picker library (e.g., emoji-mart) handles emoji rendering and search efficiently

**Open Questions:**
1. **Q: Should we support message editing and deletion in Epic 4A?**
   - A: Defer to future epic; focus on creation/display features first
   
2. **Q: What's the max conversation history to load (infinite scroll limit)?**
   - A: Load up to 1000 messages per conversation; older messages require search/filter
   
3. **Q: Do we need message translation for global teams?**
   - A: Defer to Epic 7 (AI Communication Enhancements)
   
4. **Q: Should pinned messages persist across sessions or be user-specific?**
   - A: Pinned messages are conversation-level (visible to all); starred messages are user-specific
   
5. **Q: Do we support batch reactions (multiple emojis at once)?**
   - A: No, one reaction per user per message; user can change reaction
   
6. **Q: What happens to attachments when message is deleted (future)?**
   - A: Mark attachment as orphaned but retain for audit; implement cleanup job after 30 days

## Test Strategy Summary

**Test Levels:**

1. **Unit Tests (Vitest):**
   - Target: 80% coverage for hooks and utilities
   - Focus: `useMessages` pagination logic, reaction aggregation, file validation, waveform generation
   - Location: `__tests__/` co-located with source files
   - Run: `npm run test` (CI: every commit)

2. **Component Tests (Testing Library + Vitest):**
   - Target: 70% coverage for UI components
   - Focus: `message-item.tsx` rendering variants, `EnhancedMessageComposer` input handling, emoji picker interactions
   - Mock: API calls, Supabase clients, browser APIs (MediaRecorder)
   - Run: `npm run test` (CI: every commit)

3. **Integration Tests (Vitest + Mocked Supabase):**
   - Target: Critical flows covered (send message → store → retrieve)
   - Focus: Repository methods, API route handlers, RLS policy enforcement
   - Mock: Supabase Realtime broadcasts
   - Run: `npm run test` (CI: every commit)

4. **E2E Tests (Playwright):**
   - Target: All 12 acceptance criteria scenarios
   - Focus: Drawer interactions, realtime message delivery, attachment upload, thread navigation
   - Environment: Test database with seeded data
   - Run: `npm run test:api` (CI: pre-merge, nightly)
   - Location: `__tests__/api/playwright/epic-4A-*.spec.ts`

**Test Data Strategy:**
- Seed test database with sample conversations, messages, users
- Use Playwright fixtures for authenticated user contexts
- Generate varied test messages (short, long, with attachments, with reactions)
- Test edge cases: empty conversations, 500+ message conversations, network delays

**Accessibility Testing:**
- Keyboard navigation for composer, emoji picker, message actions
- Screen reader labels for all interactive elements
- Focus management when opening/closing drawer, expanding threads
- WCAG 2.1 Level AA compliance verification with axe-core

**Performance Testing:**
- Lighthouse scores: Performance > 85, Accessibility > 95
- Measure infinite scroll render time with 500 messages
- Test attachment upload with 10 MB file on throttled 3G network
- Voice note recording performance on mobile devices

**Regression Prevention:**
- Snapshot tests for message item rendering variants
- Visual regression tests for emoji picker UI
- API contract tests to catch breaking changes in request/response shapes

**CI/CD Integration:**
- Pre-commit: Lint, type-check, unit tests
- Pre-merge: Full test suite (unit + integration + E2E)
- Post-merge: Deploy to staging, run smoke tests
- Nightly: Full regression suite + performance benchmarks

## Post-Review Follow-ups

- 4A.1: Replace fixed waits in Playwright helpers with response/state-driven waits for pin/unpin and archive/unarchive (helpers/drawer-helpers.ts)
- 4A.1: Add explicit realtime subscription-ready signal and update tests to wait for it (MessagingContext.tsx + drawer-helpers.ts)
- 4A.1: Introduce Playwright storageState-based auth to reduce flakiness and speed up tests (fixtures/messaging.ts)
- 4A.1: Add CI workflow to run Playwright 3x and upload HTML report; enforce < 5 minutes total (GitHub Actions)
- 4A.1: Expand E2E README and ensure stable data-testid coverage across drawer controls
