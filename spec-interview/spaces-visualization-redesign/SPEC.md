# SPEC: Virtual Office Floor-Plan Visualization Redesign (v4)

_Date: 2026-07-18 · Owner: Giuliano · Produced via spec-from-scratch interview (2 rounds, answers in `state.md`)_

## 1. Summary

Redesign the entire floor-plan page of Virtual Office — space grid, space cards, NowBoard header, neighborhood grouping, and space detail panel — into a presence-first, at-a-glance-legible workspace view that serves individual contributors in their daily coordination. The redesign is **UI-only**: it consumes the existing presence/realtime/knock data layer unchanged and replaces the visual and interaction layer currently implemented in `src/components/floor-plan/modern/*`.

Process: this SPEC → **three comparable HTML prototypes** (same functionality, different layout paradigms) → owner selects one → phased React implementation replacing the `modern/` components in place, each phase gated by a manual UAT checklist executed by the owner.

## 2. Problem statement

The current design (derived from the 2025 UX spec and the `ux-space-grid-v3.html` prototype) fails its core job of at-a-glance legibility:

- In reduced-height browser windows (e.g., half-screen), users **lose sight of where their own avatar/user is** on the floor plan.
- The three layout modes (Orbit/Analyst/Cinema) add little: two barely differ, and Cinema shows *less* room content despite larger cards. The product owner cannot articulate what the modes are for.
- Cards display features with **no real data source** (transcript snippets) and features the product owner does not recognize (NowBoard metrics, attention beacons, activity-log peeks) — legacy of a leader-centric spec that no longer matches the product direction.
- **Live bug:** when answering a knock, a label/toast overlays the approve/deny buttons, making the response barely clickable.
- The old spec optimized for leaders monitoring the office; the product now optimizes for workers coordinating with teammates.

## 3. Goals and success metrics

### Goals
- A worker always knows **where they are**, **who is where**, and **what each space is doing**, at any supported viewport size.
- Moving through the office and starting interactions (join, knock, message) takes one obvious action.
- One excellent adaptive layout replaces manual layout modes; one polished dark theme (Neon Cyberpunk DNA) + one polished light theme replace the multi-theme "Realities" system.
- The design stays useful and legible from 8 spaces / 5 users up to 30+ spaces / 50+ users.

### Success metrics
- **SM-1:** In a 1280×600 window, the user's own location is identifiable within 1 second without scrolling (persistent chip) — verified in prototype and implementation.
- **SM-2:** "Find where teammate X is and join them" achievable in **≤ 5 seconds / ≤ 2 clicks** from page load.
- **SM-3:** No perceptible jank scrolling/interacting with 20+ spaces and 50+ concurrent users on a mid-range laptop.
- **SM-4:** Owner approves one of the three HTML prototypes before any React work begins.
- **SM-5:** Owner's manual UAT checklist (Section 16) passes for each implementation phase.

## 4. Users and stakeholders

### Primary users
- **Individual contributors** — workers coordinating with teammates all day. They win all design tie-breaks.

### Secondary users
- **Leaders/managers** — served by the same screen (they are workers too), but leader-specific monitoring is not a design driver.

### Stakeholders
- **Admins/CEOs** — will get a separate stats/logs dashboard in a future development. **That dashboard is explicitly out of scope here and must not influence this design.**
- **Giuliano (product owner)** — sole approval gate for prototypes and UAT.

## 5. Scope

### In scope
- The entire floor-plan page UI: space grid/cards, NowBoard header, neighborhood sections and filters, space search, space detail panel/bottom sheet, knock banners/toasts, avatar presentation, capacity/status indicators, audio controls surface.
- Self-location system ("you are here" chip + own-card highlight).
- One adaptive layout with a compact-density option (replaces Orbit/Analyst/Cinema mode switching).
- Design tokens for exactly two themes: dark (Neon Cyberpunk DNA) and light.
- Three comparable HTML prototypes for paradigm selection.
- Fixing the knock-response obstruction bug as part of the redesigned knock UI.

### Out of scope
- Any change to the presence/realtime/knock **data model, hooks contracts, APIs, or Supabase schema**. Same data in, new pixels out.
- Admin/CEO dashboard, statistics, historical logs, transcripts, "leader mode" (future development).
- Mobile-phone-first design (phone is best-effort only).
- The multi-theme "Realities" system (Neon/Zen/Obsidian/Paper as separate shipping themes).
- App navigation shell, auth screens, messaging windows beyond their entry points on this page.

## 6. User journeys

1. **Locate self & orient:** Worker opens the floor plan in a half-height window → the "you are here" chip is visible immediately → clicking it scrolls to their space card, which carries a strong persistent highlight.
2. **Find teammate & join:** Worker scans avatars (or uses search) → sees teammate's face in Space B → clicks the space's single join action → their avatar moves; both sides see the move in realtime.
3. **Knock on a private space:** Worker clicks a locked space → knock action → occupant sees an unobstructed banner/toast with fully clickable approve/deny → approval lets the knocker in; denial/timeout informs them clearly.
4. **Work with your group:** Worker filters to their neighborhood → sees only their group's spaces → coordinates via presence, audio, and quick messages.
5. **Empty office:** First person online sees a screen that still feels alive and useful (clear own-location, inviting spaces, no dead-aquarium effect).
6. **Degraded realtime:** Connection drops → UI visibly marks presence data as stale until reconnection; no silent lies.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | Persistent, always-visible "you are here" chip showing the user's current space; clicking it scrolls to / focuses their space card. Visible at every supported viewport incl. 1280×600. | Must | AC-001 |
| FR-002 | The user's own space card carries a strong, unmistakable visual highlight distinct from all other card states. | Must | AC-001 |
| FR-003 | Single adaptive layout: the grid adapts automatically to viewport width/height. No Orbit/Analyst/Cinema switcher. A user-facing **density toggle** (comfortable/compact) is the only manual layout control. | Must | AC-002 |
| FR-004 | Space cards are presence-first: avatars (photos, initials fallback), participant count, space type, capacity/full state, and current activity status are the dominant content. No fabricated/placeholder data (no transcript snippets while no real transcript source exists). | Must | AC-003 |
| FR-005 | One-action join: each space card exposes a single obvious action to enter (or knock, when locked/private), reachable in ≤ 2 clicks from page load. | Must | AC-004 |
| FR-006 | Knock UX: request, banner/toast, approve/deny. **Response controls must never be obstructed by any overlay, label, or stacking context.** Approve/deny always fully visible and clickable. | Must | AC-005 |
| FR-007 | Quick interpersonal actions from avatars/roster: message a person; knock/pull-into-room affordances where the current system supports them. Click-stop standard preserved (avatar interactions never trigger space navigation). | Must | AC-006 |
| FR-008 | Neighborhood grouping and filtering preserved and prominent; search preserved. NowBoard redesigned slim: left side ≤ 3 essential live infos for workers; right side keeps neighborhood filters + search. | Must | AC-007 |
| FR-009 | Capacity limits and full states visibly communicated; join action disabled/redirected to knock appropriately. | Must | AC-004 |
| FR-010 | Audio controls surface preserved as an integral, discoverable part of space interaction. | Must | AC-008 |
| FR-011 | Stale-presence indicator: when realtime disconnects, the UI marks data as stale (visible, non-blocking) until reconnected. | Must | AC-009 |
| FR-012 | Avatar overflow: spaces with more participants than displayable slots show a truthful overflow count; detail panel lists everyone (30+ supported). | Must | AC-010 |
| FR-013 | Empty states: empty office and empty neighborhood states are designed (inviting, self-location still works), not blank. | Must | AC-011 |
| FR-014 | Loading states: skeletons/progressive loading without layout jumps on slow networks. | Should | AC-012 |
| FR-015 | Exactly two themes — dark (Neon Cyberpunk DNA: deep base, cyan/magenta-family accents, refined) and light — token-driven, instantly switchable, every component designed in both. | Must | AC-013 |
| FR-016 | Attention signal treatment: two candidate designs shipped in prototypes — (a) status integrated into card state ("full", "live meeting"), (b) refined minimal dot. Owner picks at prototype gate. | Should | AC-014 |
| FR-017 | Real activity information (join/leave/space events, where data exists) lives in the space **detail panel**, not on cards. Transcript/leader analytics deferred to the future dashboard. | Should | AC-003 |
| FR-018 | Three comparable HTML prototypes — (1) refined grid, (2) hybrid: grid overview + per-neighborhood zoom view, (3) people-first: people as the primary axis with spatial context — all with identical simulated functionality (same spaces, people, knock, audio, neighborhoods, both themes). | Must | AC-015 |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | The redesign is UI-only. Presence/realtime/knock data model, hook contracts, APIs, and Supabase schema are untouched. | Subsystem recently stabilized (phases 3.5–4); fragile; 4 interacting sources of truth. |
| BR-002 | Individual contributors win all design tie-breaks. Leader/admin monitoring needs route to the future dashboard, never onto this screen. | Owner decision, rounds 1–2. |
| BR-003 | The UI never displays fabricated or sourceless data as if real (e.g., transcript snippets with no transcription system). | Trust; legibility; owner confirmed no real transcript source exists. |
| BR-004 | Exactly two shipped themes (dark + light). No additional "Realities". Token architecture may permit future themes but none are designed/QA'd now. | Owner decision; focus polish. |
| BR-005 | Existing behavioral features are preserved, not removed: knock flow, capacity/full rules, neighborhoods, audio, avatar-initials fallback, click-stop interaction standard. Redesign changes presentation, not behavior. | Owner: "não gosto de remover coisas"; features are active investments. |
| BR-006 | Layout paradigm is chosen by the owner at the prototype gate — the SPEC deliberately does not pre-decide among grid/hybrid/people-first. | Owner requested comparative prototypes (v3-style process). |
| BR-007 | Stack is fixed: Next.js 15 / React 19 / Tailwind 4 / shadcn/Radix. No canvas/WebGL engine, no new UI framework. | Maintainability; existing investment. |

## 9. Data and integrations

### Data inputs (existing, unchanged)
- Presence/location: current space per user, online/away/busy/offline status via existing presence hooks and Realtime channels.
- Spaces: name, type (`workspace, conference, social, breakout, private_office, open_space, lounge, lab`), status, capacity, neighborhood, via existing queries/repositories.
- Knock signaling: existing `useKnockSignaling` / knock broadcast layer (phase 4).
- Users: display name, avatar URL (initials fallback), role.

### Data outputs
- None new. Same mutations as today (join/move space, knock request/respond, messaging entry points).

### Integrations
- Supabase Realtime (presence + broadcast) — consumed as-is.
- No new endpoints, tables, or channels.

## 10. Constraints and assumptions

### Constraints
- **Viewport floor:** desktop full-screen and reduced windows (~1280×600, half-screen) are first-class; tablet (~768px) functional; phone best-effort.
- **Performance:** smooth (no perceptible jank) with 20+ spaces and 50+ concurrent users on a mid-range laptop. Ambient animation is welcome but must be cheap (CSS-only, compositor-friendly) and respect `prefers-reduced-motion`.
- **Presence safety:** any implementation touching presence-adjacent components requires the `/presence-safety` skill and `presence-safety-reviewer` pass.
- Files < ~500 lines; existing repo conventions (naming, folders, repository pattern) apply.

### Assumptions (owner-confirmed)
- Visual decoration/animation intensity of the current design is *not* a problem; legibility and structure are.
- The owner delegates fine-grained usability/design decisions to the designer ("você decide, você sabe melhor que eu") within the rules of this SPEC.
- Admin/CEO analytics land in a future, separate dashboard development.

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Empty office (0 others online) | Screen remains inviting and functional; own location clear; spaces visibly joinable; explicit designed empty state. |
| Realtime disconnect / stale presence | Visible staleness indicator; UI never presents stale data as live; recovers silently on reconnect. |
| 30+ users in one space | Truthful overflow count on card; full roster in detail panel; no layout breakage. |
| 30+ spaces across neighborhoods | Neighborhood grouping + filters + search keep navigation manageable; compact density helps; no infinite-scroll fatigue. |
| Missing/broken avatar images | Initials fallback (existing behavior, preserved). |
| Slow network | Skeletons/progressive load, no layout jumps. |
| Knock toast/banner collision | Approve/deny controls always unobstructed and clickable (fixes current live bug). |
| Reduced-height window (~600px) | "You are here" chip remains visible; layout adapts; no critical control clipped. |
| Concurrent moves (two users join simultaneously) | UI reflects realtime updates without flicker/ghosts; capacity conflicts resolved by existing backend rules, UI shows outcome. |

## 12. Security, privacy, compliance, and abuse considerations

- UI-only change: RLS policies, service-role isolation, and auth flows untouched.
- No new data exposure: the redesign displays only data the current UI already surfaces to the same audience.
- Knock flow must not leak private-space occupancy details beyond what the current system reveals.

## 13. Accessibility, localization, and usability considerations

- **Pragmatic baseline (owner-selected):** full keyboard navigation across grid/cards/actions, visible focus states, AA contrast for text, `prefers-reduced-motion` respected. No formal WCAG audit gate.
- Both themes must meet the same contrast baseline.
- Interface language follows the existing app (no new localization scope).
- Touch targets ≥ 44px at tablet width.

## 14. Acceptance criteria

- **AC-001 (FR-001, FR-002):** Given a 1280×600 window with the user in any space, when the floor plan loads (at any scroll position), then the "you are here" chip is visible and clicking it brings the user's highlighted card into view.
- **AC-002 (FR-003):** Given any supported viewport, when the window is resized, then the layout adapts without manual mode selection; the only layout control offered is the density toggle, and both densities render correctly.
- **AC-003 (FR-004, FR-017):** Given any space card, then it shows only real data (people, count, type, capacity, status) — no transcript snippet appears anywhere on cards; activity details appear only in the detail panel and only from real events.
- **AC-004 (FR-005, FR-009):** Given a joinable space, when the user acts on it, then they enter with ≤ 2 clicks from page load; given a full or locked space, then the primary action correctly becomes disabled or knock.
- **AC-005 (FR-006):** Given user B knocks on user A's private space while any toasts/banners/labels are on A's screen, then A's approve/deny controls are fully visible and clickable, and both outcomes reach B with clear feedback. *(Regression-fixes the current obstruction bug.)*
- **AC-006 (FR-007):** Given an avatar on a card, when clicked, then the person-level interaction (e.g., message) opens and space navigation is NOT triggered (click-stop standard).
- **AC-007 (FR-008):** Given 30+ spaces in multiple neighborhoods, when the user filters by their neighborhood or searches, then results narrow correctly and the NowBoard retains filters + search on its right side.
- **AC-008 (FR-010):** Given a space with audio, then audio controls are discoverable and functional from the space's UI in the new design.
- **AC-009 (FR-011):** Given a killed realtime connection, then the staleness indicator appears; given reconnection, it clears without user action.
- **AC-010 (FR-012):** Given 30+ users in one space, then the card shows a truthful "+N" overflow and the detail panel lists all participants.
- **AC-011 (FR-013):** Given zero other users online, then the designed empty state renders (not a blank grid), and the user's own location still displays.
- **AC-012 (FR-014):** Given a throttled network, then skeletons render without cumulative layout shift on load.
- **AC-013 (FR-015):** Given the theme toggle, then every component of the page renders correctly in both dark and light with no unstyled or illegible element.
- **AC-014 (FR-016):** Given the prototypes, then both attention-signal candidates are demonstrated and the owner's choice is recorded before implementation.
- **AC-015 (FR-018):** Given the three HTML prototypes, then each demonstrates identical simulated functionality (same dataset: ≥16 spaces, ≥40 users, ≥3 neighborhoods, knock flow, both themes, both densities, 1280×600 behavior) so the comparison isolates the paradigm.

## 15. Test strategy

- **Approach:** test-after, derived from the acceptance criteria above (owner decision; visual iteration speed prioritized).
- **Unit/component (Vitest + Testing Library):** card states (default/own/full/locked/stale/empty/overflow), chip behavior, density toggle, theme token application, knock banner control accessibility (no obstruction — assert stacking/pointer-events), click-stop on avatars.
- **E2E smoke (Playwright):** load floor plan → locate self → join a space → open detail panel → filter neighborhood → search; both themes; 1280×600 viewport included.
- **Presence layer:** untouched hooks keep their existing test suites; no weakening or rewriting of presence tests as part of this work.
- **Mandatory manual UAT (final gate, owner-executed with 2 real accounts):** automation cannot prove two humans communicate. Checklist per phase:
  1. User B knocks on A's private space; A sees unobstructed approve/deny; approve admits B; deny informs B.
  2. A and B exchange messages from the floor plan entry points.
  3. B moves between spaces; A sees the move in realtime (and vice versa).
  4. A opens a half-height window and confirms self-location chip + highlight.
  5. Audio controls reachable and functional in a shared space.
- **Completion convention:** no phase is "done" on green tests alone — status stays *Pending user confirmation* until the owner's UAT passes.

## 16. Validation and launch checklist

1. Owner approves this SPEC.
2. Build 3 HTML prototypes (FR-018) → owner compares → records: chosen paradigm + attention-signal treatment (AC-014/015).
3. Phased React implementation replacing `modern/` components in place, per repo delegation policy (Sol high minimum), each phase:
   - `npm run type-check`, `npm run lint`, relevant Vitest/Playwright suites green.
   - `presence-safety-reviewer` pass for any presence-adjacent file.
   - Owner UAT checklist pass → phase accepted.
4. Final: side-by-side against the old UI; owner sign-off; old prototype docs archived.

## 17. Open questions (non-blocking)

- Which paradigm wins (grid / hybrid / people-first) — resolved at the prototype gate by design (BR-006).
- Attention-signal final form (integrated status vs. refined dot) — resolved at the prototype gate (AC-014).
- Whether a minimap/overview element earns its place — explored inside the hybrid prototype, not required.
- Future "leader mode" / transcripts — deferred to the admin dashboard development; revisit only when a real data source exists.
- Phone-first-class support — possible later phase; not in this scope.
