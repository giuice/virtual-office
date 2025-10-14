# Task 2.0 Session Handoff - Unified Drawer UX & Conversation Surfacing

**Objective:** Implement the unified messaging drawer UX with conversation surfacing, grouping, pinning, and navigation sync.

**Status:** Ready to start (Task 1.0 completed)

---

## Quick Start Command

```bash
# When starting the new session, use this command:
# "Let's proceed with task 2.0 - Unified Drawer UX & Conversation Surfacing
#  from @tasks/tasks-0001-prd-unified-messaging-system.md using
#  @ai-dev-tasks/process-task-list.md. Please start with task 2.1"
```

---

## Context: What Was Completed in Task 1.0

### ✅ Backend Foundation (Tasks 1.1-1.5)
All backend APIs, repository methods, types, and tests are complete:

**Data Layer:**
- ✅ Types extended with `ConversationPreferences`, `MessagePin`, `MessageStar`, `ReadReceipt`
- ✅ Repository interfaces updated with 14+ new methods
- ✅ Supabase implementations complete with snake_case/camelCase mapping
- ✅ Migrations created (need to be applied - see below)

**API Layer:**
- ✅ Conversation preferences API (`GET/PATCH /api/conversations/preferences`)
- ✅ Grouped conversations (`GET /api/conversations/get?grouped=true`)
- ✅ Pinned conversations (`GET /api/conversations/get?pinned=true`)
- ✅ Unread summary (`GET /api/conversations/get?summary=true`)
- ✅ Archive per-user (`PATCH /api/conversations/archive`)
- ✅ Message status with auto read receipts (`PATCH /api/messages/status`)

**Client API:**
- ✅ `messagingApi.getGroupedConversations()`
- ✅ `messagingApi.getPinnedConversations()`
- ✅ `messagingApi.getUnreadSummary()`
- ✅ `messagingApi.getConversationPreferences(conversationId)`
- ✅ `messagingApi.updateConversationPreferences(conversationId, preferences)`

**Testing:**
- ✅ 180 tests passing across 9 test files
- ✅ 28 new messaging client tests
- ✅ Test files refactored (<500 lines each)

**Documentation:**
- 📄 `tasks/audit-report-messaging-gaps.md` - Comprehensive gap analysis
- 📄 `tasks/task-1.5-test-coverage-report.md` - Test coverage details

---

## Task 2.0 Overview

**Goal:** Build the unified messaging drawer UI that surfaces conversations with grouping, pinning, unread counts, and proper state management.

### Subtasks (5 total)

**2.1** - Map drawer state requirements
**2.2** - Refactor ConversationList component
**2.3** - Integrate search/start conversation flows
**2.4** - Room navigation sync
**2.5** - Update Playwright tests

---

## Critical Pre-Work: Database Migrations

**⚠️ IMPORTANT:** Before starting UI work, verify migrations are applied.

### Migration Files (Already Created)
Located in `src/migrations/`:

1. **`20251009_messaging_features_phase1_new_tables.sql`**
   - Creates: `conversation_preferences`, `message_read_receipts`, `message_pins`, `message_stars`
   - Includes RLS policies for all tables

2. **`20251009_messaging_features_phase2_extend_tables.sql`**
   - Extends `message_attachments` for voice notes
   - Deprecates global `is_archived` in favor of per-user preferences

3. **`20251009_messaging_features_phase3_realtime.sql`**
   - Adds new tables to Supabase Realtime publication

### How to Apply Migrations

**Option A - Using Supabase MCP Tools:**
```bash
# In the new session, use:
mcp__supabase__list_migrations  # Check current status
mcp__supabase__apply_migration  # Apply each migration
```

**Option B - Supabase Dashboard:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy/paste each migration file
3. Execute in order (phase1 → phase2 → phase3)

**Verification:**
```bash
# Check tables exist
mcp__supabase__list_tables

# Should see:
# - conversation_preferences
# - message_read_receipts
# - message_pins
# - message_stars
```

---

## Key Files for Task 2.0

### Components to Build/Refactor

**Messaging Drawer (Task 2.1):**
- `src/components/messaging/MessagingDrawer.tsx` - Main drawer shell
- `src/contexts/messaging/MessagingContext.tsx` - State management

**Conversation List (Task 2.2):**
- `src/components/messaging/ConversationList.tsx` - List with grouping/pins

**Search/Start Flows (Task 2.3):**
- Integration with company directory
- Create DM flow
- Join room flow

**Navigation Sync (Task 2.4):**
- Floor plan context integration
- Prevent drawer toggles on room changes

**Tests (Task 2.5):**
- `__tests__/api/playwright/messages-api.spec.ts`

### Existing Hooks to Use

**Data Hooks:**
- `src/hooks/useConversations.ts` - Query/realtime for conversation lists
- `src/hooks/useMessages.ts` - Message data with pagination
- `src/hooks/realtime/useMessageSubscription.ts` - Realtime updates
- `src/hooks/useTypingIndicator.ts` - Typing status

**Client API:**
- `src/lib/messaging-api.ts` - All client methods ready to use

---

## Task 2.1 - Map Drawer State Requirements

### Objectives
1. Define drawer state shape in `MessagingContext.tsx`
2. Ensure state survives route changes
3. Support minimize/restore controls
4. Handle active conversation tracking

### Key Considerations

**State Shape:**
```typescript
interface MessagingContextState {
  isDrawerOpen: boolean;
  isMinimized: boolean;
  activeConversationId: string | null;
  activeView: 'list' | 'conversation' | 'search';
  // ... other state
}
```

**State Persistence:**
- Use `localStorage` or `sessionStorage` for drawer open/minimized state
- Active conversation should survive page refreshes
- Minimize/restore should be smooth (CSS transitions)

**Integration Points:**
- Floor plan navigation (don't close drawer on room change)
- Space changes (may want to filter room conversations)
- Presence updates (show online status in conversation list)

### Files to Create/Modify
- `src/contexts/messaging/MessagingContext.tsx`
- `src/components/messaging/MessagingDrawer.tsx`
- Consider: `src/hooks/useMessagingDrawer.ts` (custom hook for drawer logic)

### Anti-Duplication Check
Before creating new files:
1. Check if `MessagingContext.tsx` already exists
2. Check for existing drawer state patterns in other contexts
3. Reuse existing presence/auth context patterns

---

## Task 2.2 - Refactor ConversationList

### Objectives
1. Group conversations by type (DMs vs Rooms)
2. Show pinned conversations at top
3. Display unread badges
4. Use canonical avatars (EnhancedAvatarV2)
5. Respect click-stop guards

### Key Features

**Grouping:**
```typescript
// Use the new API method
const { direct, rooms } = await messagingApi.getGroupedConversations();

// Display:
// [Pinned Conversations]
// [Direct Messages]
//   - User 1 (3 unread)
//   - User 2
// [Rooms]
//   - Kitchen (5 unread)
//   - Meeting Room
```

**Pinned Section:**
- Use `messagingApi.getPinnedConversations()`
- Show at very top, above grouped sections
- Visual indicator (pin icon)
- Drag to reorder (optional for 2.2, can defer)

**Unread Badges:**
- Use `messagingApi.getUnreadSummary()` for counts
- Show badge on conversation item
- Update in realtime via `useMessageSubscription`

**Avatars:**
- Use `EnhancedAvatarV2` (canonical component)
- For DMs: User avatar with presence indicator
- For Rooms: Room icon or multi-avatar

**Click-Stop Guards:**
- Follow pattern from `src/components/floor-plan/SpaceElement.tsx`
- Mark interactive children with `data-avatar-interactive`
- Prevent parent click when interacting with avatar menus

### Files to Modify
- `src/components/messaging/ConversationList.tsx`

### Dependencies
- `src/components/avatar/EnhancedAvatarV2.tsx` (already exists)
- `src/hooks/useConversations.ts` (may need to extend)
- `src/lib/messaging-api.ts` (already has methods)

---

## Task 2.3 - Search/Start Conversation Flows

### Objectives
1. Add search bar to find conversations
2. Implement "Start DM" flow with user search
3. Implement "Join Room" flow
4. Wire with company directory data

### Key Features

**Search Conversations:**
- Filter existing conversations by name/participant
- Client-side filtering is fine for MVP
- Highlight matches

**Start DM Flow:**
1. Search company directory (use existing company context)
2. Select user
3. Call `messagingApi.createConversation()` or `messagingApi.resolveConversation()`
4. Open conversation in drawer

**Join Room Flow:**
1. Show available rooms (from floor plan context)
2. Select room
3. Call `messagingApi.joinConversation(conversationId)`
4. Subscribe to room conversation

### Files to Create/Modify
- `src/components/messaging/ConversationSearch.tsx` (new)
- `src/components/messaging/StartConversationDialog.tsx` (new)
- `src/components/messaging/ConversationList.tsx` (integrate search)

### Integration Points
- `src/contexts/CompanyContext.tsx` - User directory
- `src/contexts/FloorPlanContext.tsx` (or equivalent) - Room data
- `src/lib/messaging-api.ts` - Create/join methods

---

## Task 2.4 - Room Navigation Sync

### Objectives
1. Keep drawer stable during room navigation
2. Sync active room conversation with floor plan state
3. Prevent unintended drawer toggles

### Key Considerations

**Scenarios to Handle:**

**Scenario 1: User enters room from floor plan**
- Floor plan → Click room → Enter room
- **Behavior:** Drawer should switch to room conversation if open
- **Do NOT:** Close and reopen drawer

**Scenario 2: User switches rooms**
- In Room A → Move to Room B
- **Behavior:** Drawer updates to Room B conversation
- **Preserve:** Drawer open/minimized state

**Scenario 3: User opens DM while in room**
- In Room A with drawer showing Room A
- Click user → Open DM
- **Behavior:** Drawer switches to DM conversation
- **Do NOT:** Close room or change floor plan state

**Implementation:**
- Listen to floor plan context changes
- Update `activeConversationId` based on current room
- Add flag to prevent drawer close on navigation
- May need to add `src/hooks/useRoomSync.ts`

### Files to Modify
- `src/contexts/messaging/MessagingContext.tsx`
- `src/components/messaging/MessagingDrawer.tsx`
- Integration with floor plan context (find existing file)

---

## Task 2.5 - Update Playwright Tests

### Objectives
1. Add E2E tests for drawer interactions
2. Test conversation filtering
3. Test cross-room switching
4. Verify drawer state persistence

### Test Scenarios

**Drawer Operations:**
- ✅ Open/close drawer
- ✅ Minimize/restore drawer
- ✅ State persists across page refresh

**Conversation List:**
- ✅ Group by DMs and Rooms
- ✅ Show pinned conversations
- ✅ Display unread counts
- ✅ Click conversation opens it

**Search/Start:**
- ✅ Search filters conversations
- ✅ Start DM creates conversation
- ✅ Join room adds to list

**Navigation Sync:**
- ✅ Enter room opens room conversation
- ✅ Switch rooms updates conversation
- ✅ Open DM doesn't close drawer

### File to Modify
- `__tests__/api/playwright/messages-api.spec.ts`

---

## Missing Backend Work (Deferred to Later)

The following repository methods **exist** but **do not have API routes yet**.
These are NOT needed for Task 2.0 but should be implemented in Task 3.0:

**Message Pins:** (for pinning messages within conversation)
- `POST /api/messages/pin`
- `DELETE /api/messages/pin`
- `GET /api/messages/pinned`

**Message Stars:** (for starring/bookmarking messages)
- `POST /api/messages/star`
- `DELETE /api/messages/star`
- `GET /api/messages/starred`

**Read Receipt Queries:**
- `GET /api/messages/receipts?messageId={id}`
- `GET /api/messages/unread?conversationId={id}`

Note: Read receipts are automatically created when status is updated to READ.

---

## Development Workflow

### Step-by-Step Process

1. **Start New Session**
   - Use the quick start command above
   - Reference this file: `@tasks/task-2.0-session-handoff.md`

2. **Verify Migrations** (Critical!)
   - Check migrations are applied
   - Verify tables exist in Supabase

3. **Follow Anti-Duplication Protocol**
   - Before creating new components, search for existing patterns
   - Reuse `EnhancedAvatarV2`, existing contexts, hooks
   - Keep files under 500 lines

4. **Build Incrementally**
   - Complete each subtask (2.1 → 2.2 → 2.3 → 2.4 → 2.5)
   - Test after each subtask
   - Keep all existing tests passing (180 tests)

5. **Test Coverage**
   - Add component tests for new UI components
   - Update Playwright tests for E2E flows
   - Ensure no regressions in existing tests

### Testing Strategy

**Unit Tests (Vitest + Testing Library):**
```bash
# Run all tests
npm test

# Run specific tests
npm test -- __tests__/messaging/

# Watch mode
npm run test:watch
```

**E2E Tests (Playwright):**
```bash
# Run API tests
npm run test:api

# Debug mode
npm run test:api:debug

# UI mode
npm run test:api:ui
```

---

## Key Principles (from CLAUDE.md)

**Immutable Rules:**
1. ✅ Do not guess. Verify. If unknown, say "I don't know."
2. ✅ Run Anti-Duplication Protocol before creating files
3. ✅ Keep files under 500 lines
4. ✅ Never state "done" - always end with "Status: Pending user confirmation"

**Naming:**
- PascalCase: React components + filenames
- kebab-case: directories, non-component files
- camelCase: variables, functions, hooks
- Hooks: `use-*.ts`

**File Organization:**
- Place in existing feature folders
- Do NOT create new top-level directories
- Follow existing structure in `src/components/messaging/`

**UI Interaction - Click-Stop Standard:**
- Mark interactive children: `data-avatar-interactive`
- Parent guard: Check `event.currentTarget.contains()` and `closest()`
- Stop propagation on portal menus

---

## Expected Deliverables for Task 2.0

### Code Artifacts
1. ✅ `MessagingContext.tsx` with complete state management
2. ✅ `MessagingDrawer.tsx` with minimize/restore controls
3. ✅ `ConversationList.tsx` with grouping, pins, unread badges
4. ✅ Search/start conversation UI components
5. ✅ Room navigation sync logic
6. ✅ Updated Playwright tests

### Documentation
1. ✅ Update `tasks/tasks-0001-prd-unified-messaging-system.md` (mark 2.1-2.5 complete)
2. ✅ Create task completion report (like `task-1.5-test-coverage-report.md`)

### Testing
1. ✅ All existing 180 tests still passing
2. ✅ New component tests for drawer/list components
3. ✅ Playwright E2E tests for drawer workflows

---

## Quick Reference: Available APIs

```typescript
// Conversation queries
const { direct, rooms } = await messagingApi.getGroupedConversations({ includeArchived: false });
const pinned = await messagingApi.getPinnedConversations();
const { totalUnread, directUnread, roomUnread } = await messagingApi.getUnreadSummary();

// Conversation preferences
const prefs = await messagingApi.getConversationPreferences(conversationId);
await messagingApi.updateConversationPreferences(conversationId, { isPinned: true });

// Conversation management
const conversation = await messagingApi.createConversation({ type: 'direct', participants: [...] });
const conversation = await messagingApi.resolveConversation({ type: 'room', roomId });
await messagingApi.joinConversation(conversationId);

// Conversation state
await messagingApi.setConversationArchiveStatus(conversationId, userId, true);
await messagingApi.markConversationAsRead(conversationId, userId);

// Messages
const { messages, nextCursor, hasMore } = await messagingApi.getMessages(conversationId, { limit: 50 });
const message = await messagingApi.sendMessage({ conversationId, content, type: 'text' });

// Message status
await messagingApi.updateMessageStatus(messageId, MessageStatus.READ, userId);
```

---

## Common Pitfalls to Avoid

1. **❌ Don't use browser Supabase client in API routes**
   - Always use `createSupabaseServerClient()` in route handlers
   - Reason: `auth.uid()` requires server context for RLS

2. **❌ Don't create new avatar components**
   - Use `EnhancedAvatarV2` (canonical)
   - Other avatar components are deprecated

3. **❌ Don't exceed 500 lines per file**
   - Extract hooks for complex logic
   - Split large components into subcomponents

4. **❌ Don't create duplicate types**
   - Check `src/types/messaging.ts` first
   - Extend existing types, don't create new ones

5. **❌ Don't skip the Anti-Duplication Protocol**
   - Search codebase before creating files
   - Document what you reused/extended

---

## Support Files

**Task Planning:**
- `tasks/tasks-0001-prd-unified-messaging-system.md` - Main task list
- `ai-dev-tasks/process-task-list.md` - Task execution protocol
- `tasks/task-2.0-session-handoff.md` - This file

**Context:**
- `tasks/audit-report-messaging-gaps.md` - Gap analysis
- `tasks/task-1.5-test-coverage-report.md` - Test coverage details
- `CLAUDE.md` - Project rules and conventions

**Code Reference:**
- `src/types/messaging.ts` - All messaging types
- `src/lib/messaging-api.ts` - Client API methods
- `src/components/avatar/EnhancedAvatarV2.tsx` - Canonical avatar
- `src/components/floor-plan/SpaceElement.tsx` - Click-stop pattern example

---

## Session Start Command

```bash
Let's proceed with task 2.0 - Unified Drawer UX & Conversation Surfacing from @tasks/tasks-0001-prd-unified-messaging-system.md using @ai-dev-tasks/process-task-list.md.

Please read @tasks/task-2.0-session-handoff.md for context and start with task 2.1 - mapping drawer state requirements.

Before starting, verify migrations are applied by checking if these tables exist:
- conversation_preferences
- message_read_receipts
- message_pins
- message_stars
```

---

**Status: Ready for next session**
