# Messaging System Audit Report - Task 1.1

**Date:** 2025-10-09
**Status:** Complete

## Executive Summary

This audit identifies gaps between the current messaging implementation and the PRD requirements for pin/star/archive, reactions, attachments, read receipts, and voice notes. The analysis covers type definitions, repository interfaces, and database schema.

---

## 1. Type Definitions Audit (src/types/messaging.ts)

### Current State ✓
- `MessageType` enum: text, image, file, system, announcement
- `MessageStatus` enum: sending, sent, delivered, read, failed
- `FileAttachment` interface: id, name, type, size, url, thumbnailUrl
- `MessageReaction` interface: emoji, userId, timestamp
- `Message` interface: includes reactions array and attachments array
- `ConversationType` enum: direct, group, room
- `ConversationVisibility` enum: public, private, direct
- `Conversation` interface: includes isArchived (global), unreadCount (jsonb per-user)

### Identified Gaps ✗
1. **Pin/Star on Messages**: No fields for `isPinned`, `pinnedBy`, `pinnedAt`, `isStarred`, `starredBy`, `starredAt`
2. **Read Receipts**: No `ReadReceipt` interface (needs: id, messageId, userId, readAt)
3. **Voice Notes**: No dedicated metadata beyond generic FileAttachment (duration, waveform, transcription)
4. **Conversation Preferences (per-user)**: No `ConversationPreferences` type for user-specific pin/star/archive
   - Current: `isArchived` is global on Conversation (line 72)
   - Needed: Per-user pinned, starred, archived, notification settings
5. **Message Read Status Detail**: `MessageStatus.READ` exists but no granular read receipt tracking per user

---

## 2. IConversationRepository Audit

### Current State ✓
- `findById(id)`: Get conversation by ID
- `findByUser(userId, options)`: Supports `type` filter and `includeArchived` boolean
- `create(conversationData)`: Create new conversation
- `update(id, updates)`: Update name only
- `setArchiveStatus(id, isArchived)`: **Global archive** (line 54)
- `markAsRead(id, userId)`: Sets unread count to 0 for user
- `updateLastActivityTimestamp(id, timestamp?)`
- `incrementUnreadCount(id, userIdsToIncrement[])`
- `addParticipant(id, userId)`
- `findDirectByFingerprint(fingerprint)`: Find DM by participant hash
- `findRoomByRoomId(roomId)`: Find room conversation

### Identified Gaps ✗
1. **Per-user pin/star/archive**: Current `setArchiveStatus` is global; need per-user methods:
   - `setUserConversationPreference(conversationId, userId, preferences)`
   - `getUserConversationPreference(conversationId, userId)`
2. **Grouped queries**: No method to return conversations grouped by type (DMs vs rooms)
3. **Pinned order**: No method to get pinned conversations in user-defined order
4. **Unread summaries**: No aggregated unread counts by conversation type
5. **Search/filter**: No search by name, participants, or content

---

## 3. IMessageRepository Audit

### Current State ✓
- `findById(id)`: Get message by ID
- `findByConversation(conversationId, options?)`: Returns `Message[]` with optional pagination
- `create(messageData)`: Create new message
- `update(id, updates)`: Update content, status, isEdited
- `deleteById(id)`: Delete message
- `addAttachment(messageId, attachmentData)`: Returns `FileAttachment` (line 13)
- `addReaction(messageId, reactionData)`: Returns `MessageReaction`
- `removeReaction(messageId, userId, emoji)`: Returns boolean
- `findReactions(messageId)`: Returns `MessageReaction[]`

### Identified Gaps ✗
1. **Read Receipts**: No methods for read receipt tracking:
   - `addReadReceipt(messageId, userId, readAt?)`
   - `getReadReceipts(messageId)` → `ReadReceipt[]`
   - `getUnreadMessages(conversationId, userId)` → `Message[]`
2. **Pin/Star Messages**: No methods for user-specific message flags:
   - `pinMessage(messageId, userId)`
   - `unpinMessage(messageId, userId)`
   - `starMessage(messageId, userId)`
   - `unstarMessage(messageId, userId)`
   - `getPinnedMessages(conversationId)` → `Message[]`
   - `getStarredMessages(userId, conversationId?)` → `Message[]`
3. **Voice Notes**: No explicit handling for voice note metadata (duration, waveform)
4. **Pagination**: `findByConversation` accepts `PaginationOptions` but returns `Message[]` not `PaginatedResult<Message>`
5. **Search**: No search by content, sender, date range
6. **Offline Queue**: No methods to manage unsent/failed messages with retry metadata

---

## 4. Database Schema Analysis

### Current Tables ✓
- `conversations`: id, type, participants[], last_activity, name, **is_archived** (global), unread_count (jsonb), room_id, visibility, participants_fingerprint
- `messages`: id, conversation_id, sender_id, content, timestamp, type, status, reply_to_id, is_edited
- `message_attachments`: id, message_id, name, type, size, url, thumbnail_url, created_at
- `message_reactions`: id, message_id, user_id, emoji, timestamp

### Identified Gaps ✗

#### Missing Tables:
1. **`conversation_preferences`**: Per-user conversation settings
   - Columns: id, conversation_id, user_id, is_pinned, pinned_order, is_starred, is_archived, notifications_enabled, created_at, updated_at
   - Purpose: Replace global `is_archived` with per-user control; add pin/star
   - RLS: Required (user can only see/modify their own preferences)

2. **`message_read_receipts`**: Track who read which message and when
   - Columns: id, message_id, user_id, read_at
   - Unique constraint: (message_id, user_id)
   - Purpose: Granular read tracking beyond message status
   - RLS: Required (user sees only their receipts + receipts for their sent messages)

3. **`message_pins`**: User-specific pinned messages
   - Columns: id, message_id, user_id, pinned_at
   - Unique constraint: (message_id, user_id)
   - Purpose: Allow users to pin important messages in a conversation
   - RLS: Required

4. **`message_stars`**: User-specific starred messages
   - Columns: id, message_id, user_id, starred_at
   - Unique constraint: (message_id, user_id)
   - Purpose: Cross-conversation message bookmarks
   - RLS: Required

#### Schema Modifications Needed:
1. **`message_attachments`**: Add voice note metadata
   - New columns: duration (integer, seconds), waveform_data (jsonb), transcription (text)
   - Purpose: Support voice message features

2. **`conversations`**: Deprecate global `is_archived`
   - Action: Add migration note that `is_archived` is deprecated in favor of `conversation_preferences.is_archived`
   - Keep for backward compatibility during transition

3. **Indexes**: Add performance indexes
   - `conversation_preferences(user_id, is_pinned, pinned_order)` for drawer queries
   - `conversation_preferences(user_id, is_archived)` for filtering
   - `message_read_receipts(message_id)` for read status aggregation
   - `message_pins(user_id, pinned_at)` for user's pinned messages
   - `message_stars(user_id, starred_at DESC)` for user's starred messages

---

## 5. Proposed Migration Strategy

### Phase 1: Add New Tables (Migration 1)
- Create `conversation_preferences` table with RLS
- Create `message_read_receipts` table with RLS
- Create `message_pins` table with RLS
- Create `message_stars` table with RLS
- Add indexes for performance

### Phase 2: Extend Existing Tables (Migration 2)
- Alter `message_attachments`: Add `duration`, `waveform_data`, `transcription` columns (nullable)
- Add comment to `conversations.is_archived`: "Deprecated - use conversation_preferences.is_archived"

### Phase 3: Realtime Publications (Migration 3)
- Add `conversation_preferences` to realtime publication
- Add `message_read_receipts` to realtime publication
- Add `message_pins` to realtime publication
- Add `message_stars` to realtime publication

### Phase 4: Data Migration (Optional)
- If any conversations have `is_archived = true`, create corresponding `conversation_preferences` rows

---

## 6. Type Changes Required

### New Types to Add:
```typescript
// Read Receipt
interface ReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

// Conversation Preferences (per-user)
interface ConversationPreferences {
  id: string;
  conversationId: string;
  userId: string;
  isPinned: boolean;
  pinnedOrder: number | null;
  isStarred: boolean;
  isArchived: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Voice Note Metadata (extends FileAttachment)
interface VoiceNoteAttachment extends FileAttachment {
  duration: number; // seconds
  waveformData?: number[]; // amplitude array for visualization
  transcription?: string;
}

// Message Pin
interface MessagePin {
  id: string;
  messageId: string;
  userId: string;
  pinnedAt: Date;
}

// Message Star
interface MessageStar {
  id: string;
  messageId: string;
  userId: string;
  starredAt: Date;
}
```

### Types to Extend:
- `Message`: Add optional `readReceipts?: ReadReceipt[]`, `pins?: MessagePin[]`, `stars?: MessageStar[]`
- `Conversation`: Add optional `preferences?: ConversationPreferences` (for current user's preferences)

---

## 7. Repository Interface Changes Required

### IConversationRepository - New Methods:
```typescript
// User-specific conversation preferences
setUserPreference(conversationId: string, userId: string, preferences: Partial<ConversationPreferences>): Promise<ConversationPreferences>;
getUserPreference(conversationId: string, userId: string): Promise<ConversationPreferences | null>;

// Grouped queries for drawer
findByUserGrouped(userId: string, options?: { includeArchived?: boolean }): Promise<{
  direct: Conversation[],
  rooms: Conversation[]
}>;

// Pinned conversations in order
findPinnedByUser(userId: string): Promise<Conversation[]>;

// Unread summary
getUnreadSummary(userId: string): Promise<{
  totalUnread: number,
  directUnread: number,
  roomUnread: number
}>;
```

### IMessageRepository - New Methods:
```typescript
// Read receipts
addReadReceipt(messageId: string, userId: string, readAt?: Date): Promise<ReadReceipt>;
getReadReceipts(messageId: string): Promise<ReadReceipt[]>;
getUnreadMessages(conversationId: string, userId: string, since?: Date): Promise<Message[]>;

// Message pin/star (per-user)
pinMessage(messageId: string, userId: string): Promise<MessagePin>;
unpinMessage(messageId: string, userId: string): Promise<boolean>;
starMessage(messageId: string, userId: string): Promise<MessageStar>;
unstarMessage(messageId: string, userId: string): Promise<boolean>;
getPinnedMessages(conversationId: string, userId: string): Promise<Message[]>;
getStarredMessages(userId: string, conversationId?: string): Promise<Message[]>;

// Fix return type for pagination
findByConversation(conversationId: string, options?: PaginationOptions): Promise<PaginatedResult<Message>>;
```

---

## 8. Next Steps (Task 1.1 Complete)

✓ Audit complete. Proceed to Task 1.2–1.5:
- 1.2: Extend repository interfaces and implementations
- 1.3: Update API routes for new contracts
- 1.4: Implement message repository extensions
- 1.5: Update test coverage

---

**Status:** Tasks 1.1-1.4 Complete

---

## 9. Implementation Status (Updated 2025-10-13)

### ✅ Completed - Task 1.1 (Audit)
- Documented all gaps in types, repositories, and database schema
- Proposed migration strategy with 3 phases
- Created comprehensive audit report

### ✅ Completed - Task 1.2 (Conversation Repository Extensions)
**Files Modified:**
- `src/types/messaging.ts` - Added ConversationPreferences, GroupedConversations, UnreadSummary types
- `src/repositories/interfaces/IConversationRepository.ts` - Added 5 new methods
- `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` - Implemented all new methods

**New Methods Implemented:**
- `setUserPreference()` - Per-user conversation preferences (pin/star/archive)
- `getUserPreference()` - Get user's conversation preferences
- `findByUserGrouped()` - Return conversations grouped by type (DMs vs rooms)
- `findPinnedByUser()` - Get pinned conversations in order
- `getUnreadSummary()` - Aggregated unread counts by type

### ✅ Completed - Task 1.3 (Conversation API Routes)
**Files Modified:**
- `src/app/api/conversations/get/route.ts` - Added support for grouped queries, pinned, summary, and preferences
- `src/app/api/conversations/create/route.ts` - Added DM deduplication via participant fingerprint
- `src/app/api/conversations/archive/route.ts` - Migrated to per-user archive via preferences
- `src/app/api/conversations/preferences/route.ts` - NEW: Manage per-user conversation preferences

**API Enhancements:**
- GET /api/conversations?grouped=true - Returns conversations grouped by type
- GET /api/conversations?pinned=true - Returns pinned conversations only
- GET /api/conversations?summary=true - Returns unread summary
- GET /api/conversations/preferences - Get user preferences for a conversation
- PATCH /api/conversations/preferences - Update user preferences (pin/star/notifications)

### ✅ Completed - Task 1.4 (Message Repository Extensions)
**Files Modified:**
- `src/types/messaging.ts` - Added ReadReceipt, MessagePin, MessageStar, VoiceNoteAttachment types; extended Message interface
- `src/repositories/interfaces/IMessageRepository.ts` - Added 9 new methods; fixed findByConversation return type
- `src/repositories/implementations/supabase/SupabaseMessageRepository.ts` - Implemented all new methods with snake_case/camelCase mapping
- `src/app/api/messages/react/route.ts` - Fixed authentication and reaction handling
- `src/app/api/messages/status/route.ts` - Added automatic read receipt creation on READ status

**New Types Added:**
- `ReadReceipt` - Track message read status per user
- `MessagePin` - User-specific pinned messages within conversations
- `MessageStar` - User-specific starred/bookmarked messages across conversations
- `VoiceNoteAttachment extends FileAttachment` - Voice note metadata (duration, waveform, transcription)

**New Methods Implemented:**
- `addReadReceipt()` / `getReadReceipts()` / `getUnreadMessages()` - Read receipt tracking
- `pinMessage()` / `unpinMessage()` / `getPinnedMessages()` - Message pinning per user
- `starMessage()` / `unstarMessage()` / `getStarredMessages()` - Message starring per user
- `findByConversation()` - Now returns `PaginatedResult<Message>` with proper pagination

### ⚠️ Pending - Database Migrations
**Status:** Migration files exist but need to be applied/verified
- `src/migrations/20251009_messaging_features_phase1_new_tables.sql` - conversation_preferences, message_read_receipts, message_pins, message_stars tables
- `src/migrations/20251009_messaging_features_phase2_extend_tables.sql` - Extend message_attachments for voice notes
- `src/migrations/20251009_messaging_features_phase3_realtime.sql` - Add new tables to realtime publication

**Action Required:**
- Verify migrations are applied to database
- Confirm RLS policies are in place and working
- Test realtime subscriptions for new tables

### ⏭️ Next - Task 1.5 (Unit Test Coverage)
**Remaining Work:**
- Update `__tests__/messaging-api.test.ts` with tests for new APIs
- Update `__tests__/api/messages-api.test.ts` with read receipt, pin/star tests
- Add negative test cases for RLS scenarios
- Verify all new repository methods are covered
- Test pagination functionality

---

**Updated Status:** Tasks 1.1-1.4 Complete, Ready for Task 1.5
