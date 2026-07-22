# Messaging System Pitfalls Guide

This guide documents common pitfalls and patterns in the Virtual Office messaging system to help avoid bugs during development.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Components                             │
│  MessagingDrawer → ConversationList → MessageItem                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    MessagingContext                              │
│  (Global state provider - wraps useConversations, useMessages)   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                       Hooks Layer                                │
│  useConversations.ts  │  useMessages.ts  │  useMessageActions.ts │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     messaging-api.ts                             │
│  (API client with normalizers - CRITICAL: normalizeConversation) │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    API Routes (/api/...)                         │
│  /api/conversations/get  │  /api/messages/[id]/pin  │  etc.      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Repositories                                 │
│  SupabaseConversationRepository  │  SupabaseMessageRepository    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Supabase Database                             │
│  conversations │ messages │ conversation_members │ etc.          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚨 Pitfall #1: Normalizer Functions Stripping Fields

**Location:** `src/lib/messaging-api.ts`

**Problem:** The `normalizeConversation()` and similar functions transform API responses but may **strip fields** that aren't explicitly mapped.

**Symptom:** Data shows correctly in API response but disappears in UI after a refresh.

**Example Bug:**
```typescript
// BAD - preferences field not included!
function normalizeConversation(raw: any): Conversation {
  return {
    id: raw?.id,
    type: raw?.type,
    // ... other fields
    // MISSING: preferences ❌
  };
}
```

**Fix:** Always include ALL fields from the type definition:
```typescript
// GOOD - preferences included
function normalizeConversation(raw: any): Conversation {
  return {
    // ... other fields
    preferences: raw?.preferences ? {
      isPinned: Boolean(raw.preferences.isPinned ?? raw.preferences.is_pinned),
      // ... all preference fields
    } : undefined,
  };
}
```

**Rule:** When adding a new field to a type, update ALL normalizer functions.

---

## 🚨 Pitfall #2: User ID Confusion (Auth UID vs Database ID)

**Problem:** The system has TWO different user IDs:
- `auth.uid()` - Supabase Auth UUID (from `auth.users`)
- `user.id` - Database User ID (from `public.users`)

**Where each is used:**
| Context | ID Type | How to Get |
|---------|---------|------------|
| RLS Policies | `auth.uid()` | Direct in SQL |
| `conversation.participants[]` | Database ID | From `public.users` |
| `message.senderId` | Database ID | From `public.users` |
| `preferences.userId` | Database ID | From `public.users` |
| API Authentication | Auth UID | `supabase.auth.getUser()` |

**Common Bug - Wrong RLS Policy:**
```sql
-- BAD: auth.uid() doesn't match participants array!
CREATE POLICY "bad_policy" ON conversations
FOR SELECT USING (
  auth.uid() = ANY(participants)  -- ❌ WRONG!
);

-- GOOD: Join through users table
CREATE POLICY "good_policy" ON conversations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.supabase_uid = auth.uid()::text
    AND u.id = ANY(conversations.participants)
  )
);
```

**Rule:** Always join through `public.users` when checking participant membership in RLS.

---

## 🚨 Pitfall #3: Optimistic Updates Not Handling Missing Data

**Location:** `src/hooks/useConversations.ts`

**Problem:** Optimistic updates assume data exists (e.g., `preferences`) but it might be `undefined`.

**Example Bug:**
```typescript
// BAD - skips update if preferences is undefined
setConversations(prev => prev.map(c => {
  if (c.id !== conversationId || !c.preferences) {  // ❌
    return c;
  }
  return { ...c, preferences: { ...c.preferences, isPinned: true } };
}));
```

**Fix:** Create default values when needed:
```typescript
// GOOD - creates preferences if missing
setConversations(prev => prev.map(c => {
  if (c.id !== conversationId) return c;
  
  const existingPrefs = c.preferences || {
    id: '',
    conversationId: c.id,
    userId: currentUserId,
    isPinned: false,
    // ... default values
  };
  
  return {
    ...c,
    preferences: { ...existingPrefs, isPinned: true },
  };
}));
```

---

## 🚨 Pitfall #4: Repository Not Fetching Related Data

**Location:** `src/repositories/implementations/supabase/`

**Problem:** Repository methods may not join related tables (preferences, pins, stars).

**Example Bug:**
```typescript
// BAD - doesn't include preferences
async findByUser(userId: string) {
  const { data } = await this.supabaseClient
    .from('conversations')
    .select('*')  // ❌ Missing join!
    .contains('participants', [userId]);
  return data;
}
```

**Fix:** Join related tables:
```typescript
// GOOD - includes preferences via join
async findByUser(userId: string) {
  const { data } = await this.supabaseClient
    .from('conversations')
    .select(`
      *,
      conversation_members!left(
        id, conversation_id, user_id,
        is_pinned, pinned_order, is_starred,
        is_archived, notifications_enabled,
        created_at, updated_at
      )
    `)
    .contains('participants', [userId]);
  
  // Map preferences for each conversation
  return data.map(row => ({
    ...mapToCamelCase(row),
    preferences: row.conversation_preferences?.find(p => p.user_id === userId)
      ? mapPreferencesToCamelCase(...)
      : undefined
  }));
}
```

---

## 🚨 Pitfall #5: Supabase Client Context (Server vs Browser)

**Location:** `src/lib/supabase/`

**Problem:** Using wrong Supabase client in API routes causes RLS failures.

**Rules:**
| Location | Client | Function |
|----------|--------|----------|
| API Routes | Server Client | `createSupabaseServerClient()` |
| API Routes (bypass RLS) | Service Role | `createSupabaseServerClient('service_role')` |
| Client Components | Browser Client | `createSupabaseBrowserClient()` |
| Server Components | Server Client | `createSupabaseServerClient()` |

**Example Bug:**
```typescript
// BAD - browser client in API route
import { supabase } from '@/lib/supabase/client';  // ❌

export async function GET() {
  const { data } = await supabase.from('messages').select('*');
  // RLS fails because auth context is wrong!
}
```

**Fix:**
```typescript
// GOOD - server client in API route
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('messages').select('*');
}
```

---

## 🚨 Pitfall #6: Case Transformation (snake_case ↔ camelCase)

**Problem:** Database uses `snake_case`, TypeScript uses `camelCase`. Missing transformations cause silent data loss.

**Affected Areas:**
- Repository mappers (`mapToCamelCase`, `mapMessageToCamelCase`, etc.)
- API response serialization
- Normalizer functions in `messaging-api.ts`

**Example Bug:**
```typescript
// BAD - field name mismatch
const isPinned = raw.isPinned;  // undefined! DB returns is_pinned
```

**Fix:** Handle both cases:
```typescript
// GOOD - handle both naming conventions
const isPinned = Boolean(raw.isPinned ?? raw.is_pinned);
```

**Rule:** Always check for both `camelCase` and `snake_case` versions when reading data.

---

## 🚨 Pitfall #7: Message vs Conversation Features

**Problem:** Confusing MESSAGE-level features with CONVERSATION-level features.

| Feature | Level | Table | Shared? |
|---------|-------|-------|---------|
| Pin Conversation | Conversation | `conversation_members` | No (per-user) |
| Star Conversation | Conversation | `conversation_members` | No (per-user) |
| Archive Conversation | Conversation | `conversation_members` | No (per-user) |
| Pin Message | Message | `pinned_messages` | Yes (all see it) |
| Star Message | Message | `starred_messages` | No (per-user) |

**Symptom:** Clicking "Pin" on a message triggers conversation pin instead.

**Rule:** Check the action handler is calling the right API endpoint:
- Message pin: `/api/messages/[messageId]/pin`
- Conversation pin: `/api/conversations/preferences` (PATCH with `isPinned`)

---

## 🚨 Pitfall #8: React Hook Dependencies Causing Infinite Loops

**Problem:** Adding stateful functions to `useCallback` dependencies can cause cascading re-renders.

**Example Bug:**
```typescript
const pinConversation = useCallback(async (id: string) => {
  // ...
  await refreshConversations();  // refreshConversations changes when deps change
}, [refreshConversations]);  // ❌ Can cause loops if refreshConversations is unstable
```

**Fix:** Be careful with callback dependencies or use refs for stable references.

---

## 🚨 Pitfall #9: Dropdown Menu Not Closing

**Location:** `src/components/messaging/message-item.tsx`

**Problem:** Using `onClick` instead of `onSelect` for Radix dropdown items.

**Example Bug:**
```tsx
// BAD - menu doesn't close
<DropdownMenuItem onClick={() => doAction()}>
  Action
</DropdownMenuItem>
```

**Fix:**
```tsx
// GOOD - menu closes after action
<DropdownMenuItem onSelect={(e) => {
  e.preventDefault();
  doAction();
}}>
  Action
</DropdownMenuItem>
```

---

## Debugging Checklist

When something isn't working:

1. **Check API Response** - Is the data correct in Network tab?
2. **Check Normalizer** - Is `normalizeConversation()` preserving the field?
3. **Check Repository** - Is the JOIN fetching related data?
4. **Check RLS Policy** - Is it using correct user ID comparison?
5. **Check Optimistic Update** - Is it handling undefined/missing data?
6. **Check Client Type** - Server client in API routes? Browser client in components?
7. **Check Case Transformation** - Is it handling both `camelCase` and `snake_case`?

---

## Quick Reference: File Locations

| Concern | File |
|---------|------|
| API normalizers | `src/lib/messaging-api.ts` |
| Conversation state | `src/hooks/useConversations.ts` |
| Message state | `src/hooks/useMessages.ts` |
| Pin/Star actions | `src/hooks/useMessageActions.ts` |
| Global context | `src/contexts/messaging/MessagingContext.tsx` |
| Conversation list UI | `src/components/messaging/ConversationList.tsx` |
| Message item UI | `src/components/messaging/message-item.tsx` |
| Conversation repository | `src/repositories/implementations/supabase/SupabaseConversationRepository.ts` |
| Message repository | `src/repositories/implementations/supabase/SupabaseMessageRepository.ts` |
| RLS migrations | `supabase/migrations/*.sql` |
| Types | `src/types/messaging.ts` |
