# CRITICAL_BUGS_FIX_PLAN

**Date:** 2025-10-01
**Priority:** CRITICAL - Application is unstable
**Audience:** Junior Developer

---

## Executive Summary

Four critical bugs are breaking the application:

1. **Avatar stuck loading** - Google avatar URLs show infinite spinner
2. **No message popup/alerts** - Recipients don't see notifications
3. **Strange message count** - Header shows incorrect numbers
4. **Users always online** - Status doesn't update on logout

**Root Cause:** Recent messaging refactor added `useConversationUpdates` hook that conflicts with existing realtime subscriptions, causing duplicate channels and cache corruption. Avatar loading logic has infinite retry loop. Presence system never sets users offline.

---

## Research Findings

### Issue 1: Avatar Loading Infinite Loop

**Current behavior:**
- Google avatar URL `https://lh3.googleusercontent.com/a/ACg8ocL...` shows spinner forever
- Console shows: `[EnhancedAvatarV2] Retrying avatar load` repeatedly

**Root cause:** [src/components/ui/enhanced-avatar-v2.tsx:150-171](src/components/ui/enhanced-avatar-v2.tsx#L150-L171)
- `handleImageError` callback has a dependency issue
- When `avatarUrl` changes, it triggers re-render → error → retry → URL change → infinite loop
- External URLs (Google) need CORS handling

**Files involved:**
- [src/components/ui/enhanced-avatar-v2.tsx](src/components/ui/enhanced-avatar-v2.tsx)
- [src/lib/avatar-utils.ts](src/lib/avatar-utils.ts)

---

### Issue 2: No Message Popup/Alerts

**Current behavior:**
- User A sends message to User B
- User B sees NO drawer open, NO toast, NO alert

**Root cause:** Multiple problems:
1. **Duplicate subscriptions:** [src/hooks/useConversations.ts:356-388](src/hooks/useConversations.ts#L356-L388) still has the old `useEffect` that subscribes to messages INSERT, AND the new `useConversationUpdates` hook also subscribes. This creates race conditions.
2. **Filter mismatch:** Old subscription doesn't filter by participant, so it fires for ALL messages in the company
3. **Auto-open logic never triggers:** Line 344 checks `conversationSnapshot.type === ConversationType.DIRECT` but `conversationSnapshot` is null because the update path is broken

**Files involved:**
- [src/hooks/useConversations.ts:356-388](src/hooks/useConversations.ts#L356-L388) - DELETE this entire useEffect
- [src/hooks/realtime/useConversationUpdates.ts](src/hooks/realtime/useConversationUpdates.ts) - Add message INSERT handling here

---

### Issue 3: Strange Message Count

**Current behavior:**
- Header shows numbers that don't match reality (e.g., "12" when there are 3 unread)

**Root cause:**
- `totalUnreadCount` calculation in [src/hooks/useConversations.ts:271-276](src/hooks/useConversations.ts#L271-L276) is correct
- BUT the `conversations` array is corrupted by duplicate realtime events (Issue #2)
- Same message INSERT fires twice → unread count increments twice

**Files involved:**
- [src/hooks/useConversations.ts](src/hooks/useConversations.ts)

---

### Issue 4: Users Always Online

**Current behavior:**
- User logs out → status stays "online" in UI
- Other users see them as online forever

**Root cause:** [src/contexts/AuthContext.tsx:218-240](src/contexts/AuthContext.tsx#L218-L240)
- `signOut` function calls `supabaseClient.auth.signOut()` but NEVER updates presence status to "offline"
- Presence system has no logout hook

**Files involved:**
- [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)
- [src/hooks/useUserPresence.ts](src/hooks/useUserPresence.ts)

---

## Implementation Strategy

### Phase 1: Fix Avatar Loading (30 minutes)
Stop the infinite retry loop and add proper CORS handling for Google avatars.

### Phase 2: Consolidate Realtime Subscriptions (45 minutes)
Remove duplicate message INSERT subscription from `useConversations`. Move all realtime logic into `useConversationUpdates`.

### Phase 3: Fix Logout Presence Update (15 minutes)
Add presence status cleanup in `signOut` function.

### Phase 4: Verify Message Counts (10 minutes)
Once duplicates are fixed, counts should auto-correct.

---

## Repository and File Structure

```
src/
├── components/ui/
│   └── enhanced-avatar-v2.tsx          [MODIFY] Fix infinite retry loop
├── hooks/
│   ├── useConversations.ts             [MODIFY] Remove duplicate useEffect (lines 356-388)
│   ├── useUserPresence.ts              [MODIFY] Export cleanup function
│   └── realtime/
│       └── useConversationUpdates.ts   [MODIFY] Add message INSERT handling
└── contexts/
    └── AuthContext.tsx                 [MODIFY] Call presence cleanup on logout
```

### Change Impact Table

| File | Lines | What to Change | Why | Tests |
|------|-------|----------------|-----|-------|
| `enhanced-avatar-v2.tsx` | 150-171 | Add URL stability check; add CORS proxy for Google URLs | Stop infinite retry loop | Manual: refresh page, verify avatar loads |
| `useConversations.ts` | 356-388 | DELETE entire useEffect block | Eliminate duplicate subscriptions | Manual: send message, verify single toast |
| `useConversationUpdates.ts` | - | ADD message INSERT listener with participant filter | Consolidate realtime into one place | Manual: send message, verify auto-open drawer |
| `AuthContext.tsx` | 218-240 | ADD `updatePresenceStatus('offline')` before signOut | Set status offline on logout | Manual: logout, verify status changes |
| `useUserPresence.ts` | - | Export `updatePresenceStatus` function | Allow AuthContext to call it | N/A |

---

## Detailed Action Plan

### Task 1: Fix Avatar Infinite Retry Loop

**Files:** [src/components/ui/enhanced-avatar-v2.tsx:117-137](src/components/ui/enhanced-avatar-v2.tsx#L117-L137)

**Problem:** `useEffect` at line 118 runs whenever `user` changes, setting `loadingState` to `'loading'`. This triggers `handleImageError` on CORS failure, which changes `avatarUrl` with cache-busting params (line 170), which triggers the useEffect again → infinite loop.

**Changes:**

1. **Add URL memoization** to prevent re-triggering on cache-bust changes:
   ```typescript
   // Around line 118
   const baseAvatarUrl = useMemo(() => getAvatarUrl(user), [user]);

   useEffect(() => {
     // Only reset if the BASE URL changed (not cache-busting params)
     const currentBase = avatarUrl.split('?')[0];
     const newBase = baseAvatarUrl.split('?')[0];

     if (currentBase === newBase) {
       return; // Same base URL, don't reset
     }

     setAvatarUrl(baseAvatarUrl);
     // ... rest of logic
   }, [baseAvatarUrl]); // NOT [user, retryTimeoutId]
   ```

2. **Add fallback for Google avatars with CORS issues:**
   ```typescript
   // Around line 174 (in error handler)
   if (avatarUrl.includes('googleusercontent.com')) {
     // Google avatar failed, fall back to initials immediately
     setLoadingState('loaded');
     setAvatarUrl(''); // Clear URL so fallback shows
     return;
   }
   ```

**Dependencies:** None

**Testing:**
- Open app as user with Google avatar
- Page loads → verify avatar appears within 2 seconds (not spinner)
- Open browser DevTools Network tab → verify max 2 requests to Google URL (initial + 1 retry)
- Pass: Avatar shows; Fail: Infinite spinner

**Validation:** Add console.log in `handleImageError`: "Avatar error, attempt X of Y"

**Rollback:** Revert changes to `enhanced-avatar-v2.tsx`

---

### Task 2: Remove Duplicate Message INSERT Subscription

**Files:** [src/hooks/useConversations.ts:356-388](src/hooks/useConversations.ts#L356-L388)

**Problem:** This `useEffect` subscribes to ALL message INSERTs in the company. The new `useConversationUpdates` hook (Task 3) should handle this instead.

**Changes:**

1. **DELETE lines 356-388** entirely (the useEffect with `supabase.channel('conversations:messages:...')`):
   ```typescript
   // DELETE THIS ENTIRE BLOCK:
   useEffect(() => {
     if (!currentUserProfile?.id) {
       return;
     }

     const channel = supabase
       .channel(`conversations:messages:${currentUserProfile.id}`)
       .on(
         'postgres_changes',
         {
           event: 'INSERT',
           schema: 'public',
           table: 'messages',
         },
         (payload) => {
           const row: any = payload.new;
           if (!row?.conversation_id) {
             return;
           }

           updateConversationWithMessage(
             row.conversation_id,
             { id: row.id, timestamp: new Date(row.timestamp), content: row.content },
             row.sender_id
           );
         }
       )
       .subscribe();

     return () => {
       channel.unsubscribe();
     };
   }, [currentUserProfile?.id, updateConversationWithMessage]);
   ```

2. **Add comment** explaining why it's removed:
   ```typescript
   // Message INSERT handling moved to useConversationUpdates hook
   // to prevent duplicate subscriptions and race conditions
   ```

**Dependencies:** Task 3 must be complete first (move logic to `useConversationUpdates`)

**Testing:**
- User A sends message
- Open browser DevTools → Application → Realtime → verify ONLY ONE channel subscription for messages
- Pass: 1 channel; Fail: 2+ channels

**Validation:** Console should NOT show duplicate "[useConversations] New message" logs

**Rollback:** Restore deleted useEffect

---

### Task 3: Add Message INSERT Handling to useConversationUpdates

**Files:** [src/hooks/realtime/useConversationUpdates.ts](src/hooks/realtime/useConversationUpdates.ts)

**Problem:** Hook only listens to conversation UPDATEs and broadcast events. Needs to handle message INSERTs too.

**Changes:**

1. **Import `updateConversationWithMessage` logic** from `useConversations.ts` (lines 277-350):
   - Copy the function body into this hook
   - Convert to a callback that updates React Query cache

2. **Add message INSERT listener** around line 150 (after broadcast listeners):
   ```typescript
   .on(
     'postgres_changes',
     {
       event: 'INSERT',
       schema: 'public',
       table: 'messages',
     },
     (payload) => {
       const row: any = payload.new;
       if (!row?.conversation_id || !userId) return;

       // Check if user is a participant in this conversation
       // (filter client-side since Supabase RLS doesn't support array filters in realtime)
       const conversations = queryClient.getQueryData(['conversations']) as any;
       const conversation = conversations?.items?.find((c: any) => c.id === row.conversation_id);

       if (!conversation || !conversation.participants?.includes(userId)) {
         return; // Not a participant, ignore
       }

       // Update conversation's lastActivity and increment unread if not sender
       handleMessageInsert(row, userId);
     }
   )
   ```

3. **Add `handleMessageInsert` helper function:**
   ```typescript
   const handleMessageInsert = useCallback((row: any, currentUserId: string) => {
     const conversationId = row.conversation_id;
     const senderId = row.sender_id;
     const lastMessage = {
       id: row.id,
       timestamp: new Date(row.timestamp),
       content: row.content
     };

     // Update conversations cache
     queryClient.setQueryData(
       ['conversations'],
       (oldData: any) => {
         if (!oldData?.items) return oldData;

         const items = [...oldData.items];
         const idx = items.findIndex(c => c.id === conversationId);

         if (idx === -1) return oldData;

         const conversation = { ...items[idx] };
         conversation.lastActivity = lastMessage.timestamp;

         // Increment unread if not sender
         if (senderId !== currentUserId) {
           conversation.unreadCount = conversation.unreadCount || {};
           conversation.unreadCount[currentUserId] = (conversation.unreadCount[currentUserId] || 0) + 1;
         }

         // Move to top of list
         items.splice(idx, 1);
         items.unshift(conversation);

         return { ...oldData, items };
       }
     );

     // Show toast and auto-open if needed (copy logic from useConversations.ts:312-348)
     // ...
   }, [queryClient]);
   ```

**Dependencies:** Must remove old subscription in Task 2 first

**Testing:**
- User A sends message to User B
- Verify User B sees toast: "User A: [message preview]"
- Verify User B's drawer auto-opens (if direct message)
- Pass: Toast + auto-open; Fail: No notification

**Validation:** Console log: "[useConversationUpdates] Message INSERT handled"

**Rollback:** Remove new listener; restore old useEffect in `useConversations.ts`

---

### Task 4: Add Presence Cleanup on Logout

**Files:** [src/contexts/AuthContext.tsx:218-240](src/contexts/AuthContext.tsx#L218-L240), [src/hooks/useUserPresence.ts](src/hooks/useUserPresence.ts)

**Problem:** `signOut` function doesn't set presence status to "offline" before logging out.

**Changes:**

1. **In `useUserPresence.ts`, export a cleanup function:**
   ```typescript
   // Around line 200 (after updateLocation function)
   const setOfflineStatus = useCallback(async () => {
     if (!currentUserId) return;

     try {
       await fetch('/api/users/presence', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status: 'offline', currentSpaceId: null })
       });

       console.log('[Presence] Set offline status for logout');
     } catch (error) {
       console.error('[Presence] Failed to set offline:', error);
     }
   }, [currentUserId]);

   return {
     users,
     usersInSpaces,
     isLoading,
     error,
     updateLocation,
     setOfflineStatus, // NEW
   };
   ```

2. **In `AuthContext.tsx`, call cleanup before signOut:**
   ```typescript
   const signOut = async () => {
     try {
       console.log('Signing out user:', user?.id);

       // NEW: Set presence to offline before logout
       if (currentUserProfile?.id) {
         await fetch('/api/users/presence', {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ status: 'offline', currentSpaceId: null })
         }).catch(err => console.warn('Failed to set offline status:', err));
       }

       const { error } = await supabaseClient.auth.signOut();
       // ... rest
     }
   ```

**Dependencies:** None (can be done in parallel with other tasks)

**Testing:**
- User A logs in
- User B sees User A as "online" (green dot)
- User A logs out
- Verify User B sees User A as "offline" (gray dot) within 2 seconds
- Pass: Status changes; Fail: Still online

**Validation:** Check `/api/users/presence` logs: "PATCH - Set offline"

**Rollback:** Remove cleanup call from `signOut`

---

### Task 5: Verify Message Counts Fix

**Files:** No changes needed (counts should auto-fix after Task 2+3)

**Problem:** Duplicate subscriptions cause unread counts to increment twice per message.

**Changes:** None (this is a verification task)

**Testing:**
- Clear browser cache and reload
- User A sends 3 messages to User B
- Verify User B's floor-plan Messages card shows exactly "3"
- User B opens conversation
- Verify count changes to "0"
- Pass: Counts accurate; Fail: Still wrong

**Validation:** Open React DevTools → Components → MessagingContext → conversations → check `unreadCount` field

---

## Risk Mitigation

1. **Breaking existing features:** Tasks 2+3 completely change realtime flow. Test ALL messaging features after (send message, receive message, mark as read, auto-open drawer, room chat).
2. **Race conditions:** If Task 2 is done before Task 3, NO message notifications will work. MUST do Task 3 first or simultaneously.
3. **Avatar fallback UX:** If Google avatars are blocked by CORS, users see initials instead. This is acceptable fallback.
4. **Logout race condition:** If presence API call fails/times out during logout, user stays "online". Add 2-second timeout to prevent blocking logout.

---

## Success Criteria

1. **Avatar loads:** Google avatar appears within 2 seconds (not infinite spinner)
2. **Message popup works:** User B's drawer auto-opens when User A sends DM
3. **Counts accurate:** Unread count matches reality (3 messages = "3" badge)
4. **Logout updates status:** User goes offline within 2 seconds of logout
5. **No console errors:** Zero "nested button" warnings; zero duplicate subscription logs
6. **No regressions:** All existing features still work (send/receive messages, presence, room chat)

---

## Testing Procedure (Run in Order)

### Test 1: Avatar Loading
1. Clear browser cache
2. Login as user with Google avatar
3. **PASS:** Avatar loads within 2 seconds
4. **FAIL:** Infinite spinner OR console shows >3 retry attempts

### Test 2: Message Notifications
1. Open two browsers (User A, User B)
2. User A sends DM to User B
3. **PASS:** User B's drawer auto-opens with message visible + toast shows
4. **FAIL:** No drawer opens OR no toast

### Test 3: Unread Count Accuracy
1. User A sends 5 messages to User B
2. Check User B's floor-plan Messages card
3. **PASS:** Shows exactly "5"
4. User B opens conversation
5. **PASS:** Count changes to "0" within 1 second
6. **FAIL:** Count is wrong OR doesn't update

### Test 4: Logout Status Update
1. User A logs in → User B sees "online" (green dot)
2. User A logs out
3. **PASS:** User B sees "offline" (gray dot) within 2 seconds
4. **FAIL:** Still shows "online"

### Test 5: No Nested Button Errors
1. Open browser DevTools console
2. Perform actions: open avatar menu, send message, etc.
3. **PASS:** Zero "button cannot be descendant of button" errors
4. **FAIL:** Error appears

---

## Open Questions

1. Should we add a CORS proxy for Google avatars or just fall back to initials?
   - **Recommendation:** Fall back to initials (simpler, no infrastructure)

2. Should message notifications play a sound?
   - **Recommendation:** No (not in scope for this fix)

3. Should room messages also auto-open drawer?
   - **Recommendation:** No (current behavior: toast only for rooms)

4. Timeout for logout presence update?
   - **Recommendation:** 2 seconds (don't block logout if API slow)

---

## Implementation Order (CRITICAL)

**DO NOT change the order of these tasks:**

1. Task 1 (Avatar fix) - Independent, safe to do first
2. Task 4 (Logout presence) - Independent, safe to do in parallel
3. Task 3 (Add message INSERT to useConversationUpdates) - MUST do before Task 2
4. Task 2 (Remove old subscription) - MUST do after Task 3
5. Task 5 (Verify counts) - Final validation

**Why this order matters:**
- If you do Task 2 before Task 3, NO message notifications will work at all (worse than current state)
- Tasks 1 and 4 are independent and can be done anytime

---

**Status:** Pending user confirmation after implementation and testing
