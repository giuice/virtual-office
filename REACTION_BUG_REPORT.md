# Reaction Bug Report - Story 4A.2

## Status: UNRESOLVED

## What Works
1. ✅ Messages now load correctly (newest 20 messages show)
2. ✅ Messages persist across page reloads (localStorage for activeConversation implemented)
3. ✅ API endpoint `/api/messages/react` exists and works (tested in database - 2 reactions exist on old message)

## What's Broken
1. ❌ Clicking emoji picker buttons does NOT trigger reactions
2. ❌ NO console messages appear when clicking emoji buttons (expected: `[EMOJI BUTTON CLICK]`)
3. ❌ ReactionChips component not showing on messages (no reactions displayed)

## Technical Findings

### Database State
```sql
-- Existing reactions (prove API works):
SELECT * FROM message_reactions;
-- Returns: 2 reactions on message 0300d0b4-498e-42c8-84a2-032d590f9b55

-- Recent messages (no reactions):
SELECT id, content FROM messages ORDER BY timestamp DESC LIMIT 5;
-- All recent messages have 0 reactions
```

### Code Flow (Expected)
1. User clicks emoji in EmojiPicker
2. `handleEmojiClick()` called → console.log `[EMOJI BUTTON CLICK]`
3. `onEmojiSelect(emoji)` called → console.log `[EMOJI PICKER]`
4. MessageItem: `onReaction?.(message.id, emoji)` called
5. MessageFeed: `handleReaction()` called
6. MessagingContext: `addReaction()` called → console.log `[REACTION BUG]` if fails
7. useMessages: `messagingApi.toggleReaction()` called
8. API: POST `/api/messages/react`

### Code Flow (Actual)
1. User clicks emoji in EmojiPicker
2. **NOTHING HAPPENS** - no console messages at all
3. Only message: `[MSG:emoji-picker] opened {}` (from debugLogger, not our debug)

### Files Modified

**Working fixes:**
- `src/repositories/implementations/supabase/SupabaseMessageRepository.ts:223` - Changed to `ascending: false` to fetch newest messages
- `src/app/api/messages/get/route.ts:83-116` - Unified response format to use `nextCursorBefore`
- `src/contexts/messaging/MessagingContext.tsx:21,70-79,134-160` - Added localStorage persistence for activeConversation
- `src/lib/services/ConversationResolverService.ts:108` - Added `visibility: ConversationVisibility.DIRECT`

**Debugging added:**
- `src/hooks/useMessages.ts:381-390` - Added `[REACTION BUG]` logging for silent failures
- `src/components/messaging/EmojiPicker.tsx:66,123,153` - Added `[EMOJI PICKER]` and `[EMOJI BUTTON CLICK]` logging
- `src/components/messaging/ReactionChips.tsx:90` - Added `[REACTION CLICK]` logging

**Event handlers removed (attempted fix - DIDN'T WORK):**
- `src/components/messaging/EmojiPicker.tsx:103-106` - Removed `onPointerDown`, `onClick`, `onKeyDown` from PopoverContent

### Suspected Issues

1. **Click events being swallowed** - The emoji button clicks are not reaching the onClick handler at all
2. **Radix Popover interference** - PopoverContent may be preventing child clicks
3. **Event propagation blocked** - Some parent component stopping events
4. **React 19 issue** - Possible incompatibility with Radix UI components

### Reproduction Steps

1. Open browser DevTools → Console tab
2. Run: `localStorage.setItem('vo:debug:messaging', 'false'); location.reload();`
3. Click a message hover action → Click smiley face emoji button
4. Emoji picker opens (shows `[MSG:emoji-picker] opened {}`)
5. Click any emoji
6. **Expected:** See `[EMOJI BUTTON CLICK]` and `[EMOJI PICKER]` logs
7. **Actual:** Nothing happens, no console messages

### Files to Check

**Critical files:**
- `src/components/messaging/EmojiPicker.tsx` - Button onClick not firing
- `src/components/messaging/message-item.tsx:185-192` - EmojiPicker integration
- `src/components/messaging/message-feed.tsx:163-166` - handleReaction function
- `src/hooks/useMessages.ts:379-456` - addReaction implementation

**Click-stop protocol:**
- `src/components/messaging/message-item.tsx` - Check if data-avatar-interactive is blocking
- Parent components wrapping MessageItem - May be stopping propagation

### Next Steps for New Developer

1. **Verify onClick handler binding:**
   ```typescript
   // In EmojiPicker.tsx, check if onClick is actually attached
   console.log('Button rendered with onClick:', !!handleEmojiClick);
   ```

2. **Check Radix Popover version:**
   ```bash
   npm list @radix-ui/react-popover
   ```

3. **Test with plain button outside Popover:**
   - Add test button directly in MessageItem
   - If it works → Popover is the issue
   - If it doesn't work → Parent blocking issue

4. **Check React DevTools:**
   - Inspect EmojiPicker button element
   - Verify onClick prop is attached
   - Check if any wrapper is preventing events

5. **Alternative approach:**
   - Replace Radix Popover with native HTML dialog
   - Or use a different popover library

### Environment
- Next.js: 15.3.0
- React: 19.1.0
- @radix-ui/react-popover: (check package.json)
- Browser: (user needs to specify)

### Contact
If you can fix this, the specific bug is: **Emoji picker button clicks don't fire onClick handler**

The console should show `[EMOJI BUTTON CLICK]` when clicking emoji buttons, but it shows nothing.
