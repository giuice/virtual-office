# Task 2.3 - Bugs Found During Testing

## Bug #1: List Button Shows Empty Conversations ✅ FIXED (confirmed)

**Symptoms:**
- User enters dashboard
- Drawer opens showing space conversation (expected)
- User clicks List button (📋)
- List view shows "No conversations yet" (unexpected - the room conversation should be in the list)

**Expected Behavior:**
- When user clicks List button, they should see all conversations including the active room conversation

**Investigation Steps:**
1. Open browser console (F12)
2. Enter dashboard
3. Look for console logs starting with `[MessagingDrawer] State:`
4. Check the `conversationsCount` value
5. If it's 0, the conversation isn't being added to the conversations array
6. Check logs for `[useConversations.room]` to see if room conversation was created

**Root Cause:**
- `ConversationList` exited early when `currentUserProfile` was still loading, so the grouped arrays were empty even though conversations had been fetched via `useConversations`.

**Fix:**
- Removed the early `currentUserProfile` guard in `ConversationList` and now derive grouped conversations without requiring the viewer profile.
- Fallback logic picks a conversation participant for label/avatar even if the viewer profile hasn’t hydrated yet.
- Relaxed the drawer auto-switch so the list view remains visible after the first conversation load, surfacing the existing conversations immediately.

**Regression Tests:**
- `npm run lint`
- `npm run type-check`

**Verification Steps:**
1. Log in and navigate to the dashboard.
2. Ensure the drawer opens to the active room conversation.
3. Click the List button (📋) and confirm the room conversation appears immediately (no `No conversations yet`).
4. Switch between list → conversation → list to ensure view state persists.

**Debug Logs Added:**
- `[MessagingDrawer] State:` - Shows activeView, conversationsCount, etc.
- `[MessagingDrawer] Switching to list view` - Shows when list button is clicked
- `[MessagingDrawer] Auto-switching to conversation view` - Shows auto-switch logic

**Status:** Confirmed by user. Keep monitoring during future regressions.

---

## Bug #2: User Status Stuck as "Online" ✅ FIXED (pending presence regression)

**Symptoms:**
- User A logs out
- User B still sees User A as "online" (green dot) in:
  - ConversationSearch user list
  - Floor plan avatars
  - Everywhere avatars are displayed

**Root Cause:**
The user's `status` field in the database is not being updated to `"offline"` when they log out.

**Technical Details:**
- User presence comes from the `users` table in Supabase
- CompanyContext loads users via `getUsersByCompany(companyId)` which reads from database
- Presence system (`useUserPresence`) subscribes to database changes via Supabase Realtime
- Status filtering logic shows users who are "online" OR "recently active" OR "in a space"
- **PROBLEM:** Logout flow doesn't update `users.status = 'offline'`

**Location of Issue:**
The logout needs to update user status. This should happen in:
- `src/app/api/auth/logout/route.ts` (if it exists)
- OR in `src/contexts/AuthContext.tsx` logout handler
- OR via a database trigger/function on session end

**Fix Implemented:**
- `SupabaseUserRepository.update` now maps `currentSpaceId` → `current_space_id`, so `/api/users/update` correctly clears both status and location during logout.
- Existing logout flow in `AuthContext.signOut` already sends `status: 'offline'` and `currentSpaceId: null` and now persists to the database.

**Verification Steps:**
1. Sign in with User A and User B in separate browser contexts.
2. Sign out User A.
3. Refresh User B’s session; User A should show as offline (no green dot) within the presence grace window.
4. Optionally, query Supabase `users.status` and `users.current_space_id` to confirm the values update.

**Files to Check:**
1. `src/contexts/AuthContext.tsx` - Check logout function
2. `src/app/api/auth/*` - Check if there's a logout route
3. `src/lib/api.ts` - Check updateUserStatus function

**Workaround (Temporary):**
For now, users can manually refresh the page. The presence filtering logic has a 2-minute grace window for `lastActive`, so after 2 minutes of inactivity, the user should disappear from the list (if not in a space).

**Priority:** Monitor — presence should now recover on logout; re-open if stale status reproduces after the grace window.

---

## Bug #3: No Plus (+) Button Visible ✅ FIXED (confirmed)

**Symptoms:**
- Clicking the 📋 List button briefly flashes the list but immediately snaps back to the conversation view, so the ➕ control never renders.

**Root Cause:**
- `MessagingDrawer` forced the view to `'conversation'` whenever an `activeConversation` existed, overriding manual navigation back to `'list'`.

**Fix:**
- Auto-switch logic now only triggers when a *new* conversation becomes active, allowing the user to remain in list/search views while a conversation stays selected.

**Regression Checks:**
1. Trigger the drawer via “Chat in room” or a DM action.
2. Click the 📋 List button – the view should stay on the conversation list.
3. Confirm the ➕ icon appears and opens the search surface.

**Status:** Confirmed by user.

---

## Bug #4: Legacy Room Panel Opens With Drawer ✅ FIXED (confirmed)

**Symptoms:**
- Selecting “Chat in Room” renders both the new global messaging drawer and the legacy sidebar chat panel.

**Root Cause:**
- The floor-plan still mounted `RoomChatIntegration`/`RoomMessaging` in parallel with the unified drawer entry point.

**Fix:**
- Removed the legacy integration and now route room chat actions through `useMessaging().getOrCreateRoomConversation`, which opens only the canonical drawer.

**Status:** Confirmed by user.

---

## Testing Instructions for User

### Test 1: Debug Drawer Navigation

1. **Open browser console** (Press F12, go to Console tab)
2. **Enter dashboard**
3. **Look for these console logs:**
   ```
   [MessagingDrawer] State: { activeView: "...", conversationsCount: X, ... }
   ```
4. **Share the following info:**
   - What is `activeView`? (should be "conversation" when drawer opens)
   - What is `conversationsCount`? (should be > 0 if room conversation was created)
   - Do you see a **List button (📋)** in the top-right of the drawer?

5. **Click the List button (📋)**
6. **Check console again:**
   ```
   [MessagingDrawer] Switching to list view: { conversationsCount: X, currentView: "..." }
   [MessagingDrawer] State: { activeView: "list", ... }
   ```
7. **Share:**
   - Did activeView change to "list"?
   - Do you see a **Plus button (+)** now in the top-right?
   - What does the drawer content show? ("No conversations yet" or a list of conversations?)

### Test 2: Verify Presence Bug

1. **Open two browsers** (or one normal + one incognito)
2. **Log in as User A** in Browser 1
3. **Log in as User B** in Browser 2
4. **In Browser 2, check User A's status** (should show green dot = online)
5. **In Browser 1, log out User A**
6. **In Browser 2, refresh the page**
7. **Check User A's status again** - Is it still showing green dot?
8. **Wait 2-3 minutes, refresh Browser 2** - Does User A disappear or show offline?

---

## Summary

**Bug #1 (Empty List):** ✅ Fix confirmed
**Bug #2 (Status Stuck Online):** ✅ Fix merged; monitor presence updates post-logout
**Bug #3 (No Plus Button):** ✅ Fix confirmed
**Bug #4 (Legacy Room Panel):** ✅ Fix confirmed

**User Action Required:**
Please run Test 1 above and share:
1. Console log output
2. Screenshots of the drawer in different states
3. What buttons you can see in the top-right
