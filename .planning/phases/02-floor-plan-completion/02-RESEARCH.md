# Phase 2: Floor Plan Completion - Research

**Researched:** 2026-03-18
**Domain:** Spatial presence, access control, offline detection, default placement, reconnection
**Confidence:** HIGH

## Summary

Phase 2 builds on a solid existing foundation. The knock-to-enter signaling infrastructure (useKnockSignaling, useKnock, knock API routes, knock_requests table) is already complete from Phase 1 -- Phase 2 wires it into a full end-to-end UX with auto-join on approval and a prominent banner notification replacing the current toast. The presence system (useUserPresence, PresenceContext) already tracks user status via postgres_changes and Supabase Presence channels, but lacks heartbeat-based offline detection and fade-out animation. Default space assignment and reconnection grace period are entirely new features that extend the existing company settings JSONB and useLastSpace hook.

The codebase is a brownfield Next.js 15 / React 19 / Supabase / TailwindCSS 4 application with established patterns: repository pattern for data access, React Context for global state, TanStack Query for server state, Supabase Realtime for live updates, and localStorage for client-side persistence. All four requirements (FLOR-01 through FLOR-04) can be implemented by extending existing hooks and components rather than creating new architectural patterns.

**Primary recommendation:** Extend existing hooks (useKnock, useKnockSignaling, useUserPresence, useLastSpace) and components (ModernFloorPlan, ModernSpaceCard, UserAvatarPresence, CompanySettings) rather than creating new files. The companies.settings JSONB column is the storage target for default space and home space mappings.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Knock-to-enter UX (FLOR-01):** Auto-join space immediately on approval with toast "Approved by [Name]! Joining...". Occupants notified via prominent full-width banner at top of space card with Approve/Deny buttons + existing knock.mp3 sound. Knock button placed directly on ModernSpaceCard with data-avatar-interactive click-stop protection. Only restricted spaces (access_control.isPublic === false) require knocking. Denial shows toast + 60-second cooldown. Timeout (30s no response) shows "No one responded" toast + same 60-second cooldown.
- **Offline user removal (FLOR-02):** Opacity fade-out over 3 seconds when user goes offline, then remove from DOM. Dual detection: status change via Realtime (instant for normal logouts) + heartbeat timeout (30s for crashes/tab kills). Only offline status triggers fade-out -- away users stay visible with yellow status dot. Server-side cleanup: update space_presence_log.exited_at and clear users.current_space_id when user goes offline.
- **Default space assignment (FLOR-03):** Two-tier default system: company default space (first login) + per-user home space (admin assigns, like desk assignment). Subsequent logins join user's assigned home space. First-time login: auto-join company default + welcome toast. Home space mapping stored in companies.settings JSONB. Fallback chain: user home space -> company default -> first active workspace-type space. Admin UI on company settings page.
- **Reconnection UX (FLOR-04):** 5-minute grace window tracked via localStorage timestamp. If reconnect within 5 min: silently auto-rejoin last space + subtle toast. If last space full: fallback to home/default + toast. If grace expired: treat as fresh login -> join home/default space. No notification to other occupants on reconnect.

### Claude's Discretion
- Heartbeat interval and implementation approach (Supabase presence channel vs custom endpoint)
- Exact CSS animation keyframes for fade-out
- Banner component design for knock notifications
- Company settings UI layout for default space + home space admin panel
- How to handle edge case: user's home space deleted or set to maintenance

### Deferred Ideas (OUT OF SCOPE)
- Mobile responsive floor plan (FLOR-05)
- User self-service home space change
- Knock queue (multiple people knocking)
- Space access scheduling (restricted during meetings, open otherwise)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLOR-01 | User can request access to restricted spaces via "Knock to Enter" workflow with approval/denial by any occupant | Knock signaling infrastructure exists (useKnockSignaling, useKnock, knock API routes, knock_requests table). Need: banner notification component, auto-join on approval, knock button on ModernSpaceCard |
| FLOR-02 | Offline users automatically removed from space display within 5 seconds, with fade-out animation and presence log update | useUserPresence has postgres_changes listener on users table. Need: heartbeat layer for crash detection, CSS fade-out animation on UserAvatarPresence, server-side cleanup logic |
| FLOR-03 | Admin can assign default spaces to users; first-time users placed in company default space | companies.settings JSONB exists and is extensible. Need: settings schema extension, admin UI on CompanySettings, auto-placement logic in PresenceContext/CompanyContext login flow |
| FLOR-04 | User reconnecting within 5-minute grace period auto-rejoins their last space | useLastSpace exists with localStorage persistence. Need: timestamp-based grace window, reconnection logic integration, edge case handling (full space, deleted space) |
</phase_requirements>

## Standard Stack

### Core (Already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.3.0 | App Router, Server Components, Route Handlers | Project framework |
| React | 19.1.0 | UI rendering | Project runtime |
| @supabase/supabase-js | ^2.97.0 | Supabase client, Realtime, postgres_changes | Data + realtime layer |
| @supabase/ssr | ^0.8.0 | Server-side Supabase client | SSR auth pattern |
| TailwindCSS | ^4.2.1 | Styling, animations | Project UI framework |
| TanStack Query | ^5.90.21 | Server state management | Project state pattern |
| sonner | ^2.0.7 | Toast notifications | Already used for knock toasts |
| zod | (installed) | API validation | Already used in knock routes |
| lucide-react | (installed) | Icons | Already used in KnockToast |

### Supporting (Already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui + Radix | (installed) | UI components | All new UI (banner, admin forms, dropdowns) |
| lodash | (installed) | debounce utility | Already used in useUserPresence |

### No New Dependencies Required
This phase requires zero new package installations. All features can be built with the existing stack.

**Installation:** None needed.

## Architecture Patterns

### Recommended File Changes (NOT new files unless justified)
```
src/
  hooks/
    useKnock.ts                    # EXTEND: Add auto-join after approval
    useUserPresence.ts             # EXTEND: Add heartbeat + fade-out detection
    useLastSpace.ts                # EXTEND: Add 5-min grace window + timestamp
    realtime/
      useKnockSignaling.ts         # No changes needed (already complete)
  components/
    floor-plan/
      modern/
        ModernFloorPlan.tsx        # EXTEND: Wire auto-join on knock approval
        ModernSpaceCard.tsx        # EXTEND: Add knock button on card + banner
        KnockBanner.tsx            # NEW: Banner notification for occupants (replaces toast approach)
        AvatarGroup.tsx            # EXTEND: Add fade-out animation for offline users
      UserAvatarPresence.tsx       # EXTEND: Add opacity transition for offline fade
    dashboard/
      company-settings.tsx         # EXTEND: Add "Default Space" tab/section
  contexts/
    PresenceContext.tsx             # EXTEND: Add heartbeat tracking
    CompanyContext.tsx              # EXTEND: Add default/home space logic on login
  app/
    api/
      users/
        location/route.ts          # EXTEND: Add space_presence_log update
        heartbeat/route.ts         # NEW: Heartbeat endpoint (if custom approach chosen)
      companies/
        settings/route.ts          # May need extension for settings update
  types/
    database.ts                    # EXTEND: Company.settings type with new fields
```

### Pattern 1: Knock-to-Enter Banner (FLOR-01)
**What:** Replace the current sonner toast notification for incoming knocks with a prominent full-width banner at the top of the space card.
**When to use:** When an occupant receives a knock request for their current space.
**Key integration points:**
- `ModernFloorPlan.handleIncomingKnockRequest` currently calls `toast.custom()` with `KnockToast` -- change to render banner in-card
- `ModernFloorPlan.handleKnockResponse` already handles auto-join on approval -- enhance with "Approved by [Name]" toast
- The `KnockToast` component can be converted to a `KnockBanner` with full-width layout
- Must maintain `data-avatar-interactive` and click-stop protocol

**Example:**
```typescript
// In ModernSpaceCard -- banner rendered at top when knock request exists for this space
{knockRequest && isUserInSpace && (
  <KnockBanner
    requesterName={knockRequest.requesterName}
    requesterAvatarUrl={knockRequest.requesterAvatarUrl}
    onApprove={() => handleApprove(knockRequest)}
    onDeny={() => handleDeny(knockRequest)}
    data-avatar-interactive="true"
  />
)}
```

### Pattern 2: Heartbeat-Based Offline Detection (FLOR-02)
**What:** Dual-layer offline detection: Supabase Realtime for normal logouts + heartbeat timeout for crash/tab-kill scenarios.
**When to use:** Continuously while user is in a space.
**Recommendation for Claude's Discretion:** Use Supabase Presence channel's built-in heartbeat mechanism (default 30s) rather than a custom REST endpoint. The presence channel already tracks join/leave events automatically. When a user's browser crashes or tab is killed, the Supabase server detects the missing heartbeat and fires a `leave` event.

**Key insight:** The existing `useUserPresence` hook already subscribes to a Supabase presence channel and handles `sync`, `join`, `leave` events. The `leave` event fires automatically when a client disconnects (including crashes). Add a server-side cleanup mechanism that:
1. Listens for user status changes to `offline`
2. Clears `users.current_space_id`
3. Updates `space_presence_log.exited_at`

For the CSS fade-out, add `beforeunload` event to set status to offline on intentional close, and rely on presence channel leave for crash detection.

**Example:**
```typescript
// In AvatarGroup -- detect users transitioning to offline and apply fade
const exitingUsers = useRef<Map<string, number>>(new Map());

// When user goes offline, start 3-second fade instead of immediate removal
if (user.status === 'offline' && !exitingUsers.current.has(user.id)) {
  exitingUsers.current.set(user.id, Date.now());
  // After 3s, remove from display
  setTimeout(() => exitingUsers.current.delete(user.id), 3000);
}
```

### Pattern 3: Default Space Assignment (FLOR-03)
**What:** Extend companies.settings JSONB to store default space ID and per-user home space mappings.
**When to use:** On user login (first-time and subsequent).
**Schema extension for companies.settings:**
```typescript
// Extend Company.settings type in src/types/database.ts
settings: {
  allowGuestAccess?: boolean;
  maxRooms?: number;
  defaultRoomSettings?: Partial<Space>;
  theme?: string;
  // NEW for FLOR-03:
  defaultSpaceId?: string;           // Company default space for first-time users
  homeSpaces?: Record<string, string>; // userId -> spaceId mapping
};
```

**Placement logic (runs on login):**
```
1. Check if user has been seen before (has lastSpaceId in localStorage OR has homeSpace assigned)
2. If first-time user: join company defaultSpaceId + show welcome toast
3. If returning user:
   a. Check FLOR-04 grace window first
   b. If no grace: join user's homeSpace from companies.settings.homeSpaces[userId]
   c. If no homeSpace: join company defaultSpaceId
   d. If no defaultSpaceId: join first active workspace-type space
```

### Pattern 4: Reconnection Grace Period (FLOR-04)
**What:** Store disconnect timestamp in localStorage, check on reconnect if within 5 minutes.
**When to use:** When useLastSpace detects a returning user.
**Extend useLastSpace with:**
```typescript
// Store disconnect timestamp alongside lastSpaceId
const DISCONNECT_TS_KEY = 'vo-disconnect-timestamp';
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

// On disconnect/beforeunload:
localStorage.setItem(DISCONNECT_TS_KEY, Date.now().toString());

// On reconnect:
const disconnectTs = parseInt(localStorage.getItem(DISCONNECT_TS_KEY) || '0');
const withinGrace = (Date.now() - disconnectTs) < GRACE_PERIOD_MS;
if (withinGrace && lastSpaceId) {
  // Auto-rejoin last space
} else {
  // Fresh login -- use home/default space
}
```

### Anti-Patterns to Avoid
- **Creating a separate heartbeat REST endpoint** when Supabase Presence already provides built-in heartbeat detection. The Supabase channel's internal heartbeat (30s default) handles crash detection automatically via `leave` events.
- **Storing home space mappings in a new DB table** when companies.settings JSONB is designed for exactly this extensibility. A new table adds unnecessary migration complexity.
- **Using users.id to match auth.uid()** -- this is the #1 bug source. Always use supabase_uid for auth matching and users.id for FK relationships.
- **Modifying useKnockSignaling** -- this hook is already complete and working. Changes should be in the consumer hooks (useKnock) and components (ModernFloorPlan, ModernSpaceCard).
- **Creating new context providers** -- extend PresenceContext and CompanyContext rather than adding new ones.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Heartbeat detection | Custom REST polling endpoint | Supabase Presence channel `leave` event | Built-in 30s heartbeat, proven reliable in this codebase for presence |
| CSS animations | JavaScript-driven opacity changes | TailwindCSS transition classes + CSS keyframes | Hardware-accelerated, respects prefers-reduced-motion automatically |
| Toast notifications | Custom notification system | Sonner (already installed, already used) | Consistent with existing knock flow toasts |
| Form validation | Manual validation | Zod (already used in knock API routes) | Consistent pattern, type-safe |
| State persistence | Custom file/DB persistence | localStorage via useLocalStorage hook | Already established pattern for knock cooldowns, last space |
| Optimistic updates | Manual state sync | TanStack Query setQueryData (already used in useUserPresence) | Consistent with presence system's cache update pattern |

**Key insight:** Every problem in this phase has an existing pattern or library already in use in the codebase. Zero new architectural patterns are needed.

## Common Pitfalls

### Pitfall 1: Race Condition on Auto-Join After Knock Approval
**What goes wrong:** User receives approval, auto-join fires, but another occupant simultaneously denies the same knock. Or the space fills up between approval and join.
**Why it happens:** Asynchronous nature of realtime events + network latency between approval reception and location update.
**How to avoid:** After approval, call `handleEnterSpace` with `{ allowPrivateBypass: true }` (already exists in ModernFloorPlan). The location API already validates capacity server-side and returns 409 if full. Handle the 409 with a toast and fallback.
**Warning signs:** User gets "approved" toast but then immediately gets "space is full" error.

### Pitfall 2: users.id vs supabase_uid Confusion
**What goes wrong:** Using the wrong ID field when querying users, causing RLS failures or empty results.
**Why it happens:** The users table has two ID fields -- `id` (internal UUID) and `supabase_uid` (auth UID text).
**How to avoid:** Follow the rule in CLAUDE.md: use `supabase_uid` for auth matching, `users.id` for FK relationships. In API routes: `findBySupabaseUid(authUser.id)`. In RLS: `supabase_uid = auth.uid()::text`.
**Warning signs:** API returns 404 "user not found" or RLS silently returns no rows.

### Pitfall 3: Heartbeat Cleanup Race With Reconnection
**What goes wrong:** User's browser crashes, server detects heartbeat timeout and clears current_space_id. User restarts browser within 5 minutes and expects to rejoin, but server already cleaned up their position.
**Why it happens:** Server-side cleanup is fast; reconnection grace is client-side only.
**How to avoid:** The grace window check should look at localStorage `lastSpaceId` (which persists across browser restarts), not at `users.current_space_id` (which gets cleared on offline). The reconnection flow should: (1) check localStorage for lastSpaceId + timestamp, (2) if within grace, auto-join that space regardless of current DB state.
**Warning signs:** User restarts browser within 5 minutes but lands on default space instead of last space.

### Pitfall 4: Company Settings JSONB Merge Instead of Replace
**What goes wrong:** Updating companies.settings replaces the entire JSONB instead of merging, wiping out existing settings like theme or maxRooms.
**Why it happens:** Supabase `.update()` replaces the entire column value for JSONB.
**How to avoid:** Always merge: `{ settings: { ...currentSettings, defaultSpaceId: newId } }`. The existing `updateCompanyDetails` in CompanyContext does optimistic merge (`{ ...prev, ...data }`) but the actual API call must also merge server-side.
**Warning signs:** Setting a default space wipes out the company name or theme.

### Pitfall 5: Fade-Out Animation Blocking User Interaction
**What goes wrong:** During the 3-second fade-out, the user's avatar is still in the DOM and clickable, leading to messaging/interaction attempts on a user who is actually offline.
**Why it happens:** CSS opacity transition only changes visibility, not interactivity.
**How to avoid:** During fade-out, set `pointer-events: none` on the avatar wrapper and disable click handlers. After the 3-second fade completes, remove from DOM.
**Warning signs:** Users clicking on fading-out avatars and getting errors.

### Pitfall 6: Click-Stop Protocol Violation on Knock Button
**What goes wrong:** Clicking the knock button on a space card also triggers the card's click handler, causing navigation/enter-space alongside the knock request.
**Why it happens:** Event bubbling from the knock button up through the card.
**How to avoid:** Add `data-avatar-interactive="true"` to the knock button. The ModernSpaceCard click handler already checks `target.closest('[data-avatar-interactive="true"]')` and early-returns. Also add `e.stopPropagation()` on the button's `onClick` and `onPointerDown`.
**Warning signs:** User knocks and simultaneously enters the space, or gets "this space is private" error because enter runs before knock.

## Code Examples

### Existing Pattern: Knock Request Flow (already working)
```typescript
// Source: src/hooks/realtime/useKnockSignaling.ts
// Occupants subscribe to INSERT events on knock_requests table
const channel = supabase.channel(`knock-occupied:${occupiedSpaceId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'knock_requests',
    filter: `space_id=eq.${occupiedSpaceId}`,
  }, (payload) => {
    processIncomingKnock(payload.new);
  });
```

### Existing Pattern: Location Update via API
```typescript
// Source: src/hooks/useUserPresence.ts (debouncedUpdateLocation)
const response = await fetch('/api/users/location', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: currentUserId, spaceId }),
});
```

### Existing Pattern: Company Settings Update
```typescript
// Source: src/contexts/CompanyContext.tsx (updateCompanyDetails)
await updateCompany(company.id, data);
setCompany(prev => prev ? { ...prev, ...data } : null);
```

### New Pattern: CSS Fade-Out Animation
```css
/* Tailwind CSS keyframes for 3-second opacity fade */
@keyframes avatar-fade-out {
  from { opacity: 1; }
  to { opacity: 0; pointer-events: none; }
}

.vo-avatar-exit-fade {
  animation: avatar-fade-out 3s ease-out forwards;
  pointer-events: none;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .vo-avatar-exit-fade {
    animation-duration: 0.3s;
  }
}
```

### New Pattern: Disconnect Timestamp for Grace Period
```typescript
// On beforeunload/visibilitychange
useEffect(() => {
  const handleDisconnect = () => {
    localStorage.setItem('vo-disconnect-timestamp', Date.now().toString());
    // Also save current space for reconnection
    if (currentSpaceId) {
      localStorage.setItem('lastSpaceId', JSON.stringify(currentSpaceId));
    }
  };
  window.addEventListener('beforeunload', handleDisconnect);
  return () => window.removeEventListener('beforeunload', handleDisconnect);
}, [currentSpaceId]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase broadcast channels for knock | postgres_changes on knock_requests table | Phase 1 (Feb 2026) | Broadcast was unreliable/TIMED_OUT; postgres_changes proven reliable |
| Multiple avatar components | EnhancedAvatarV2 + UploadableAvatar | Phase 1 (Feb 2026) | All other avatar components deprecated |
| Toast for knock notification | Banner at top of space card | Phase 2 (planned) | More discoverable and prominent for occupants |
| No heartbeat detection | Supabase Presence channel leave events | Phase 2 (planned) | Handles crash/tab-kill scenarios |
| No default space | Two-tier default system via JSONB | Phase 2 (planned) | Admin control over space assignments |

**Current codebase state:**
- Knock signaling: COMPLETE (useKnockSignaling + useKnock + API routes + DB table)
- Knock UX: PARTIAL (toast notification works, need banner + auto-join polish)
- Offline detection: BASIC (postgres_changes on users table for status, no heartbeat)
- Default space: NOT STARTED
- Reconnection: BASIC (useLastSpace has rejoin logic, no grace window)

## Open Questions

1. **Heartbeat interval tradeoff**
   - What we know: Supabase Presence default heartbeat is 30 seconds. The CONTEXT specifies "heartbeat timeout (30s for crashes/tab kills)".
   - What's unclear: Whether 30s is acceptable latency for crash detection (FLOR-02 says "within 5 seconds"). The 5-second requirement is for display removal after going offline, not for detection.
   - Recommendation: Use the Supabase Presence `leave` event which fires automatically when heartbeat is missed. The 30s detection + 3s fade-out = 33s total for crash scenarios. For normal logouts (status change to offline), detection is instant via postgres_changes. Clarify with user if 33s for crash scenarios is acceptable vs the 5-second requirement.

2. **space_presence_log not currently used**
   - What we know: The `space_presence_log` table exists in the DB with `entered_at`, `exited_at`, `authorized_by` columns, but no application code reads or writes to it.
   - What's unclear: Whether we should fully implement presence logging or just add the `exited_at` update for offline cleanup.
   - Recommendation: Add basic writes on enter (`entered_at`) and exit (`exited_at`) to establish the audit trail. Don't build analytics UI (out of scope).

3. **Home space mapping scale**
   - What we know: CONTEXT says store in companies.settings JSONB as `Record<string, string>` (userId -> spaceId).
   - What's unclear: For companies with hundreds of users, will JSONB performance be acceptable?
   - Recommendation: For v1, JSONB is fine. The Virtual Office is for teams (likely < 100 users per company). If needed later, migrate to a separate table. This is a Claude's Discretion area.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 + @testing-library/react |
| Config file | `vitest.config.mts` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLOR-01 | Knock button renders on restricted space cards | unit | `npx vitest run __tests__/knock-banner.test.tsx -x` | Wave 0 |
| FLOR-01 | Auto-join fires after knock approval | unit | `npx vitest run __tests__/knock-auto-join.test.tsx -x` | Wave 0 |
| FLOR-01 | Banner shows Approve/Deny buttons for occupants | unit | `npx vitest run __tests__/knock-banner.test.tsx -x` | Wave 0 |
| FLOR-02 | Avatar fades out when user goes offline | unit | `npx vitest run __tests__/presence-animation.test.tsx -x` | Exists (extend) |
| FLOR-02 | Offline user removed from DOM after 3s fade | unit | `npx vitest run __tests__/presence-animation.test.tsx -x` | Exists (extend) |
| FLOR-03 | First-time user lands in company default space | unit | `npx vitest run __tests__/default-space-assignment.test.tsx -x` | Wave 0 |
| FLOR-03 | Admin can set default space in settings | unit | `npx vitest run __tests__/company-settings-default-space.test.tsx -x` | Wave 0 |
| FLOR-04 | User within 5-min grace auto-rejoins last space | unit | `npx vitest run __tests__/reconnection-grace.test.tsx -x` | Wave 0 |
| FLOR-04 | Expired grace period triggers fresh login flow | unit | `npx vitest run __tests__/reconnection-grace.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `__tests__/knock-banner.test.tsx` -- covers FLOR-01 banner + auto-join
- [ ] `__tests__/default-space-assignment.test.tsx` -- covers FLOR-03 placement logic
- [ ] `__tests__/company-settings-default-space.test.tsx` -- covers FLOR-03 admin UI
- [ ] `__tests__/reconnection-grace.test.tsx` -- covers FLOR-04 grace period logic
- [ ] Extend `__tests__/presence-animation.test.tsx` -- covers FLOR-02 fade-out for offline

## Sources

### Primary (HIGH confidence)
- Codebase inspection of all files listed in CONTEXT.md canonical_refs (read and analyzed)
- `migrations/database-structure.md` -- authoritative DB schema with exact column types
- `migrations/20260209_knock_requests_table.sql` -- knock table schema + RLS policies

### Secondary (MEDIUM confidence)
- [Supabase Presence docs](https://supabase.com/docs/guides/realtime/presence) -- Presence channel heartbeat mechanism
- [Supabase Realtime heartbeat troubleshooting](https://supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages) -- 30s default heartbeat interval

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official Supabase docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, versions verified from package.json
- Architecture: HIGH -- all patterns derived from inspecting existing codebase code
- Pitfalls: HIGH -- identified from actual code patterns and known DB schema issues
- Knock system: HIGH -- read every line of useKnockSignaling, useKnock, knock API routes, and knock_requests migration
- Presence system: HIGH -- read every line of useUserPresence, PresenceContext, UserAvatarPresence
- Default space: HIGH -- verified companies.settings JSONB column exists and is extensible, no existing code uses this feature
- Reconnection: HIGH -- read every line of useLastSpace, confirmed no grace window logic exists

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable codebase, no external library updates expected)
