# Task 0002 - Real-time Presence System with Supabase Presence Tracking

## Problem Statement

**Current Issue**: User status remains "online" even after logout or browser close.

### Root Causes:
1. Using database field `users.status` that requires manual updates
2. `beforeunload` event is unreliable (especially on mobile, crashes, network loss)
3. No automatic detection when WebSocket connection drops
4. Current approach: Manual heartbeat would need 30s intervals with 2min timeout (too slow)

### User Requirement:
> "30 segundos e 2 minutos é muito, meu chefe por exemplo me chamando e eu não respondo mas já sai há 20 segundos isso é horrivel"

**Target**: User should appear offline within 10-30 seconds after closing browser/losing connection.

---

## How Production Systems Work (Slack, Discord, Teams)

### Architecture:
1. **WebSocket Connection = Online Status**
   - App opens → Establishes persistent WebSocket connection
   - **While connected = online**
   - **Connection drops = offline automatically** (5-10 seconds)

2. **Typical Timeouts:**
   - Heartbeat interval: 5-15 seconds (ping/pong on connection)
   - Offline timeout: 10-30 seconds after last activity
   - Result: Browser close → offline in ~10 seconds

3. **Why it's fast:**
   - No manual "heartbeat" requests needed
   - The WebSocket connection itself IS the heartbeat
   - Server detects disconnection immediately via TCP keepalive

---

## Proposed Solution: Supabase Presence Tracking

**Good news**: Supabase Realtime already provides this functionality!

### What is Supabase Presence?

Supabase Presence is a built-in feature that:
- Tracks which users are currently connected to a channel
- **Automatically removes users when their connection drops**
- Provides real-time updates to all subscribers
- Timeout: ~30 seconds (configurable)

### Current Implementation Status:

**File**: `src/hooks/useUserPresence.ts`
- ✅ Already connected to Supabase Realtime (lines 235-353)
- ❌ NOT using Presence tracking correctly
- ❌ Relying on database field `status` instead

---

## Implementation Plan

### Phase 1: Switch to Supabase Presence API

**Goal**: Use channel presence instead of database `status` field.

#### 1.1. Update `useUserPresence.ts`

**Current approach** (lines 232-353):
```typescript
// Subscribes to postgres_changes on 'users' table
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'users',
}, ...)
```

**New approach**:
```typescript
const presenceChannel = supabase
  .channel('global-presence')
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    // state contains all currently connected users
    setUsers(mapPresenceToUsers(state));
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    // User connected
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    // User disconnected (automatic after ~30s)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // Track current user's presence
      await presenceChannel.track({
        user_id: currentUserId,
        display_name: currentUserProfile.displayName,
        avatar_url: currentUserProfile.avatarUrl,
        current_space_id: currentUserProfile.currentSpaceId,
        online_at: new Date().toISOString()
      });
    }
  });
```

**Benefits**:
- ✅ User automatically goes offline when connection drops
- ✅ No manual `beforeunload` handling needed
- ✅ Works on mobile, crashes, network loss
- ✅ Offline detection in ~10-30 seconds
- ✅ Real-time updates via WebSocket

**Implementation Notes (2025-03-06)**:
- Added `PRESENCE_CHANNEL_NAME` channel with presence `sync/join/leave` handlers and realtime metadata tracking (`src/hooks/useUserPresence.ts`).
- Presence state now augments query data with `isOnline` and derives display `status` while keeping manual `away/busy` values intact.
- Presence payload updates whenever the user's status or `currentSpaceId` changes; duplicate payloads are short-circuited via signature checks.

#### 1.2. Remove Database Status Field Dependency

**Files to update**:
1. `src/contexts/AuthContext.tsx` - Remove `updateStatus()` calls on login/logout
2. `src/lib/api.ts` - Keep `updateUserStatus()` for manual "away"/"busy" states only
3. `src/hooks/useUserPresence.ts` - Primary source of truth = Presence, fallback = database

**Status**: ✅ `AuthContext` no longer performs automatic `updateUserStatus` calls or `beforeunload` hooks; presence handles online/offline transitions. `updateUserStatus` remains available for manual state changes via profile settings.

#### 1.3. Hybrid Approach (Recommended)

**Why hybrid?**
- Presence = fast online/offline detection
- Database = persistent "away", "busy", status messages

**Strategy**:
```typescript
// User is ONLINE if:
const isOnline = presenceState[userId] !== undefined;

// Status priority:
const status = isOnline
  ? (dbUser.status === 'away' || dbUser.status === 'busy'
      ? dbUser.status
      : 'online')
  : 'offline';
```

**Result**:
- `UserPresenceData` now exposes `isOnline` to downstream components, and `EnhancedAvatarV2` prioritises live presence over cached database values when rendering the status pill.

**Flow**:
1. User opens app → Tracks presence → Shows as "online"
2. User sets "away" manually → Updates database → Shows as "away" (still in presence)
3. User closes browser → Presence auto-removes → Shows as "offline" (even if DB says "online")
4. User reopens app → Presence adds back → Shows as "online" again

---

### Phase 2: Configure Presence Timeout

**Goal**: Adjust timeout to 15-20 seconds for faster offline detection.

#### 2.1. Supabase Realtime Configuration

**Options**:
1. **Client-side timeout** (via connection config):
   ```typescript
   const channel = supabase.channel('global-presence', {
     config: {
       presence: {
         key: currentUserId,
       },
     },
   });
   ```

2. **Heartbeat interval** (adjust ping frequency):
   - Supabase default: 30 seconds
   - Can be configured in Supabase dashboard or via client options
   - Lower interval = faster detection but more network traffic

#### 2.2. Recommended Settings

| Setting | Default | Recommended | Why |
|---------|---------|-------------|-----|
| Heartbeat interval | 30s | 15s | Faster detection |
| Presence timeout | 30s | 20s | User offline in 20s |
| Reconnect attempts | 3 | 5 | More resilient |

**Trade-offs**:
- ✅ Faster offline detection
- ❌ More WebSocket traffic
- ❌ Slightly higher server load

---

### Phase 3: Update UI Components

**Goal**: Update components to use presence-based status.

#### 3.1. EnhancedAvatarV2

**File**: `src/components/ui/enhanced-avatar-v2.tsx`

**Current**: Reads `user.status` from database
**New**: Check presence first, then database

```typescript
const getUserStatus = (user: User) => {
  const { users: presenceUsers } = usePresence();
  const isOnline = presenceUsers?.some(p => p.id === user.id);

  if (!isOnline) return 'offline';
  if (user.status === 'away' || user.status === 'busy') return user.status;
  return 'online';
};
```

#### 3.2. ConversationSearch

**File**: `src/components/messaging/ConversationSearch.tsx`

- Already uses `EnhancedAvatarV2` → Will automatically update
- Filtering logic should prioritize presence over database status

#### 3.3. Floor Plan Avatars

**Files**:
- `src/components/floor-plan/dom-floor-plan.tsx`
- `src/components/floor-plan/modern/ModernFloorPlan.tsx`

**Update**: Use presence-based status for avatar indicators.

---

## Migration Path

### Step 1: Add Presence Tracking (Non-Breaking)
- Add presence tracking alongside existing database status
- Test in development environment
- Verify automatic disconnect detection

### Step 2: Switch UI to Presence-First (Non-Breaking)
- Update components to read from presence first
- Keep database status as fallback
- Monitor for issues

### Step 3: Remove Database Status Updates (Breaking)
- Remove `updateStatus()` calls in AuthContext
- Keep database field for manual "away"/"busy"
- Update API to only accept manual status changes

### Step 4: Cleanup
- Remove unused status update logic
- Remove `beforeunload` event listener (no longer needed)
- Update tests

---

## Testing Strategy

### Test Cases:

1. **Normal Logout**
   - User clicks logout → Should appear offline within 5 seconds
   - Expected: Presence removes user immediately on logout

2. **Browser Close**
   - User closes tab/window → Should appear offline within 20-30 seconds
   - Expected: WebSocket disconnects, presence auto-removes

3. **Network Loss**
   - User loses internet connection → Should appear offline within 20-30 seconds
   - Expected: WebSocket timeout, presence auto-removes

4. **Browser Crash**
   - Kill browser process → Should appear offline within 20-30 seconds
   - Expected: TCP keepalive timeout, presence auto-removes

5. **Mobile Background**
   - User switches to another app → Should remain online initially, offline after timeout
   - Expected: iOS/Android may suspend WebSocket, presence removes after timeout

6. **Reconnection**
   - User reconnects after network loss → Should appear online immediately
   - Expected: WebSocket reconnects, presence tracks again

### Manual Testing Steps:

1. Open app in Browser A (User A)
2. Open app in Browser B (User B)
3. Verify User A sees User B as "online"
4. Close Browser B (do NOT logout)
5. Start timer
6. Verify User A sees User B as "offline" within 30 seconds
7. Reopen Browser B
8. Verify User A sees User B as "online" within 5 seconds

---

## Implementation Files

### Files to Create:
- None (all changes to existing files)

### Files to Modify:

1. **src/hooks/useUserPresence.ts** (Primary changes)
   - Add Supabase Presence tracking
   - Map presence state to `UserPresenceData`
   - Keep database subscription for manual status updates

2. **src/contexts/AuthContext.tsx** (Remove status updates)
   - Remove `updateStatus(user, 'online')` on login (line 49)
   - Remove `updateStatus(user, 'offline')` on logout (line 226)
   - Remove `beforeunload` event listener (lines 59-70)

3. **src/components/ui/enhanced-avatar-v2.tsx** (Optional optimization)
   - Add presence-first status check
   - Fallback to database status for "away"/"busy"

4. **src/components/messaging/ConversationSearch.tsx** (Already updated)
   - Debug log added (line 39) to diagnose currentUserId mismatch
   - No further changes needed if presence works correctly

---

## Expected Outcomes

### Before (Current System):
- User closes browser → Status stuck "online" indefinitely
- `beforeunload` unreliable → Doesn't update database
- Requires manual refresh or 2-minute timeout to detect offline

### After (Supabase Presence):
- User closes browser → Offline in 20-30 seconds automatically
- Network loss/crash → Offline detection within timeout window
- No manual heartbeat needed → WebSocket handles everything
- Works on mobile, all browsers, all scenarios

---

## Open Questions

1. **Should we keep database `status` field?**
   - YES - for manual "away"/"busy" states
   - NO - for automatic "online"/"offline" (use presence)

2. **What timeout should we use?**
   - Recommended: 15-20 seconds
   - Trade-off: Faster detection vs network overhead

3. **How to handle "recently active" users?**
   - Option A: Remove completely (only show truly online users)
   - Option B: Keep using `lastActive` from database for 2-minute grace period
   - Recommendation: Option A (cleaner, faster)

4. **Should we show "connecting..." state?**
   - YES - when WebSocket is connecting but not yet subscribed
   - Shows user is trying to come online but connection not established

---

## Priority

**HIGH** - This is a critical UX issue affecting user trust in the presence system.

Users expect real-time accuracy from a "virtual office" app. Showing offline users as online breaks the core value proposition.

---

## Related Tasks

- Task 2.3: Bug #2 documented in `tasks/task-2.3-bugs-found.md` (lines 39-81)
- Messaging system integration (presence affects DM availability)
- Floor plan avatars (presence affects who's shown in spaces)

---

**Status: Pending user confirmation**

Ready to implement when approved.
