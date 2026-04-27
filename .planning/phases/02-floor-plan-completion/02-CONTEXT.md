# Phase 2: Floor Plan Completion - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver remaining spatial floor plan features: knock-to-enter access control, automatic offline user removal, default space assignment with per-user home spaces, and reconnection grace period. After this phase, users experience a complete spatial floor plan with access control, presence cleanup, smart placement, and resilient reconnection. No new feature domains (video, messaging, etc.) are added.

</domain>

<decisions>
## Implementation Decisions

### Knock-to-enter UX (FLOR-01)
- Auto-join space immediately on approval, show brief toast confirming who approved ("Approved by [Name]! Joining...")
- Occupants notified via prominent full-width banner at top of space card with Approve/Deny buttons + existing knock.mp3 sound
- Knock button placed directly on ModernSpaceCard with `data-avatar-interactive` click-stop protection — more discoverable than hover panel
- Only restricted spaces require knocking — spaces with `access_control` set to restricted. Open spaces allow direct join
- Denial shows toast message + 60-second cooldown before re-knocking same space (already in useKnock state machine)
- Timeout (30s no response) shows "No one responded" toast + same 60-second cooldown

### Offline user removal (FLOR-02)
- Opacity fade-out over 3 seconds when user goes offline, then remove from DOM
- Dual detection: status change via Realtime (instant for normal logouts) + heartbeat timeout (30s for crashes/tab kills)
- Only `offline` status triggers fade-out — `away` users stay visible with yellow status dot
- Server-side cleanup: update `space_presence_log.exited_at` and clear `users.current_space_id` when user goes offline

### Default space assignment (FLOR-03)
- Two-tier default system:
  1. **Company default space** — where brand-new users land on first login. Admin sets via company settings page dropdown
  2. **Per-user home space** — admin assigns each user's home room (like assigning desks in an office). Users do NOT choose their own home space
- Subsequent logins: join user's assigned home space (not company default)
- First-time login flow: auto-join company default space + welcome toast ("Welcome! You've been placed in [Space Name]")
- Home space mapping stored in company settings (centralized admin control — user→space mapping in companies.settings JSONB)
- Fallback chain: user home space → company default → first active workspace-type space
- Admin UI: "Default Space" section on company settings page

### Reconnection UX (FLOR-04)
- 5-minute grace window: if user reconnects within 5 minutes, silently auto-rejoin last space + subtle toast ("Reconnected to [Space Name]")
- If last space is now full: fallback to home/default space + toast ("[Space] is full — moved to [Home Space]")
- If grace window expired: treat as fresh login — join home/default space (clean slate)
- No notification to other occupants on reconnect — avatar just reappears (silent rejoin, like walking back to your desk)
- Grace window tracked via localStorage timestamp when user leaves/disconnects

### Claude's Discretion
- Heartbeat interval and implementation approach (Supabase presence channel vs custom endpoint)
- Exact CSS animation keyframes for fade-out
- Banner component design for knock notifications
- Company settings UI layout for default space + home space admin panel
- How to handle edge case: user's home space deleted or set to maintenance

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Floor plan & presence
- `src/hooks/realtime/useKnockSignaling.ts` — Complete knock signaling system with dual-channel approach and polling fallback
- `src/hooks/useKnock.ts` — Client-side knock state machine (idle→knocking→approved/denied/timeout→cooldown)
- `src/hooks/useUserPresence.ts` — Presence tracking with postgres_changes listener, usersInSpaces Map, and activity window
- `src/hooks/useLastSpace.ts` — Last space persistence in localStorage with exponential backoff rejoin
- `src/contexts/PresenceContext.tsx` — Global presence state, updateLocation(), occupiedSpaceId

### Knock API & database
- `src/app/api/spaces/knock/request/route.ts` — Knock request endpoint (validates, inserts to knock_requests table)
- `src/app/api/spaces/knock/respond/route.ts` — Knock response endpoint (updates decision, logs system message)
- `migrations/20260209_knock_requests_table.sql` — knock_requests table schema with RLS policies

### UI components
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` — Main floor plan with knock integration (lines 92-149)
- `src/components/floor-plan/modern/ModernSpaceCard.tsx` — Space card component (knock button target)
- `src/components/floor-plan/modern/KnockToast.tsx` — Existing toast notification for knock requests
- `src/components/floor-plan/UserAvatarPresence.tsx` — Avatar with status indicator (fade-out target)

### Space & company management
- `src/repositories/interfaces/ISpaceRepository.ts` — Space data access interface
- `src/repositories/interfaces/ICompanyRepository.ts` — Company data access interface
- `src/contexts/CompanyContext.tsx` — Company state, updateCompanyDetails(), loadCompanyData()
- `src/app/api/users/location/route.ts` — User location update endpoint

### Design spec
- `docs/ux-space-grid-v3.html` — Floor plan visual spec (Phase 1 reference, still applies)

### Database schema
- `migrations/database-structure.md` — Authoritative table/column reference

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **useKnockSignaling** + **useKnock**: Complete knock state machine and realtime signaling — extend for auto-join and banner notification
- **KnockToast.tsx**: Existing toast UI — replace with prominent banner component for occupant notification
- **useUserPresence**: Presence tracking with postgres_changes — add heartbeat layer and fade-out trigger
- **useLastSpace**: localStorage-based last space persistence — add 5-minute grace window check
- **UserAvatarPresence**: Avatar with status rings — add CSS fade-out animation for offline transition
- **CompanyContext**: Company settings access — extend for default space + home space mapping
- **updateLocation()**: Presence API for space join — reuse for auto-join flows (knock approval, reconnection, default placement)

### Established Patterns
- **postgres_changes** on `users` table for presence updates — extend for heartbeat detection
- **Supabase Realtime channels** with dual-channel fallback to polling — knock signaling uses this
- **localStorage** for client-side persistence — used by useLastSpace (add timestamp), useKnock (cooldown)
- **Click-stop protocol** with `data-avatar-interactive` — use for knock button on space cards
- **Repository pattern** for data access — extend ICompanyRepository for home space mappings
- **companies.settings JSONB** — extensible for default space + user→space mapping

### Integration Points
- **ModernFloorPlan** (lines 92-149): Main integration point for knock flow — add auto-join after approval
- **ModernSpaceCard**: Add knock button with click-stop protection
- **PresenceContext.updateLocation()**: Central method for joining spaces — used by all auto-join scenarios
- **CompanyContext.loadCompanyData()**: Entry point for checking default/home space on login
- **useUserPresence.usersInSpaces**: Map driving space card renders — fade-out animation triggers here
- **Company settings page**: Target for admin default space + home space configuration UI

</code_context>

<specifics>
## Specific Ideas

- Knock-to-enter should work like a real office: knock on a closed door, someone inside opens it for you (or doesn't)
- Home space assignment modeled after Sococo: admin assigns rooms like assigning desks. Users don't pick their own space
- Reconnection should feel like walking back to your desk after a coffee break — seamless, no fuss
- Offline fade-out should be subtle but noticeable — 3-second opacity fade, not dramatic
- The existing knock.mp3 sound stays (Phase 1 replaced it with a realistic door knock)

</specifics>

<deferred>
## Deferred Ideas

- Mobile responsive floor plan — v2 requirement (FLOR-05)
- User self-service home space change — could be added later if admin-only feels too rigid
- Knock queue (multiple people knocking) — handle basic case first, queue system is future scope
- Space access scheduling (restricted during meetings, open otherwise) — separate capability

</deferred>

---

*Phase: 02-floor-plan-completion*
*Context gathered: 2026-03-18*
