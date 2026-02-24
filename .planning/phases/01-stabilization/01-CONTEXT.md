# Phase 1: Stabilization - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix broken auth flows, floor plan space sizing, knock-to-enter sound issues, and consolidate remaining avatar tech debt. After this phase, the existing application works reliably — users can log in, see correctly-sized floor plan spaces, and the codebase is free of avatar duplication. No new features are added.

</domain>

<decisions>
## Implementation Decisions

### Floor plan sizing
- Pixel-perfect match to v3 design spec (`docs/ux-space-grid-v3.html`)
- Fixed grid layout — desktop-only for now (mobile responsive is deferred to v2, FLOR-05)
- Fix scope is sizing only — card dimensions must match the spec. Internal content (avatars, labels, counts) is not in scope
- Overflow handling when spaces exceed viewport is Claude's discretion

### Auth fix scope
- Three flows must work without errors: email/password login, email/password signup, and Google OAuth
- Error display: clear inline error messages next to the relevant form field — no toast notifications
- Post-auth redirect: after successful login/signup, user lands on the floor plan page (not dashboard)
- Session expiry handling is out of scope — focus only on login/signup/OAuth flows
- Password reset and email verification are not in scope for this phase

### Knock-to-enter sound
- The knock-to-enter feature is already implemented and functional
- This is a verify-and-fix task: confirm the timeout doesn't cause stale state or broken UI
- Known issue: knock sound sometimes doesn't play — fix sound reliability
- Replace current sound with a soft knock effect (realistic door knocking, not a doorbell)
- If timeout behavior is found broken during verification, fix it (auto-dismiss with "No one responded" message)

### Avatar consolidation
- Most consolidation is already done — all avatar components use EnhancedAvatarV2 internally
- Remove `UserAvatar` component (`src/components/floor-plan/user-avatar.tsx`) — redundant with InteractiveUserAvatar
- Remove `AvatarShowcase` component (`src/components/examples/AvatarShowcase.tsx`) — demo/showcase only
- Remove all debug avatar pages: `src/app/debug/avatars/`, `src/app/debug/avatarShowcase/`, `src/app/avatar-showcase/`, `src/app/(dashboard)/avatar-demo/`
- Keep all legitimate specialized wrappers: UserAvatarPresence, ModernUserAvatar, AvatarGroup, InteractiveUserAvatar — these add specific behavior (presence states, floor plan context, grouping, interaction menus)
- Update any imports that reference removed components

### Claude's Discretion
- Floor plan overflow strategy (scroll container vs page scroll)
- Exact knock sound file selection (as long as it's a soft knock effect)
- How to verify knock-to-enter timeout stability (manual testing approach)
- Import cleanup strategy for removed avatar components

</decisions>

<specifics>
## Specific Ideas

- Floor plan sizing must match `docs/ux-space-grid-v3.html` exactly — this is the authoritative spec
- Auth errors should be inline next to form fields, not toast notifications
- Knock sound should feel like someone tapping on a door — realistic and intuitive
- Post-login destination is the floor plan page, which is the core experience where users see colleagues

</specifics>

<deferred>
## Deferred Ideas

- Mobile responsive floor plan — v2 requirement (FLOR-05)
- Session expiry handling (auto-redirect to login) — future stabilization or auth hardening
- Password reset and email verification flows — separate scope

</deferred>

---

*Phase: 01-stabilization*
*Context gathered: 2026-02-24*
