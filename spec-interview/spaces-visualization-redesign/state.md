# Spec Interview State — spaces-visualization-redesign

**Idea:** Redesign the virtual office floor-plan / spaces visualization. The current design (2025 BMad UX spec + ux-space-grid-v3.html prototype, implemented as `src/components/floor-plan/modern/*`) has accumulated problems; the goal is a modern, genuinely useful design for every worker regardless of role.

**Started:** 2026-07-18
**Project type:** Code (Next.js 15 / React 19 / Tailwind 4 / shadcn) → test-strategy domain applies.

## Context gathered from repo (pre-interview)

- Old spec: `docs/ux-design-specification.md` (Orbit/Analyst/Cinema perspectives, multi-theme "Realities", leader-centric journeys).
- Prototype believed implemented: `docs/ux-space-grid-v3.html` (glassmorphism, mesh gradients, noise overlays, mouse-tracked glow).
- Actual implementation: full `modern/` component suite — ModernFloorPlan, ModernFloorPlanGrid, ModernSpaceCard, NowBoard(+Metrics), NeighborhoodSection/Filters, AttentionBeacon, BeaconQueue, KnockBanner/Toast, SpaceDetailPanel/BottomSheet, ParticipantRoster, ActivityLogPreview, TranscriptSnippet, SpaceSearch, AvatarGroup, etc.
- Fragile subsystem: presence/realtime/knock — recently stabilized (phase 3.5, phase 4 knock delivery). Any redesign likely must be UI-only over the existing data layer.

## Rounds

- **Round 1** (`round-1.html`): 13 questions. **Answered 2026-07-18** (user answers in Portuguese; user prefers PT-BR for writing).
- **Round 2** (`round-2.html`, in PT-BR): 10 follow-ups. **Answered 2026-07-18.**

## Round 2 answers (confirmed reading)

- **Self-location:** persistent "you are here" chip (A) + strong highlight on own card (C); usability details delegated to designer.
- **Layout modes:** user can't articulate value of modes — compact matters, Orbit/Cinema barely differ, Cinema shows LESS content despite being bigger. Explicit delegation: "innovate, don't be influenced by me." → Decision: single adaptive layout + compact density option; no manual mode switcher.
- **NowBoard:** keep + redesign (A). Right side (neighborhood filters + search) is critical and must be preserved; left side currently ~3 infos. Improvement delegated.
- **ActivityLog/Transcript:** no selection; dislikes removal, suggests maybe a future "leader mode". → Resolution: no fake data on cards (transcript has no real source today); real activity info lives in detail panel; transcript/leader view deferred to future dashboard scope.
- **Beacons:** decide at prototype gate (D). Likes the dot (space-efficient). **Reported live bug: when answering a knock, a label overlays the approve/deny buttons — barely clickable.** → Hard requirement: knock respond controls must never be obstructed.
- **Responsive floor:** A — desktop + reduced windows (~1280×600) first-class; tablet functional; phone best-effort.
- **Performance:** formal requirement — smooth with 20+ spaces / 50+ concurrent users on mid-range laptop.
- **Prototypes:** 3 variants — refined grid / hybrid (grid + neighborhood zoom) / people-first, same functionality across all.
- **A11y:** pragmatic baseline — full keyboard nav, AA text contrast, visible focus; no formal audit gate.
- **UAT:** formal checklist in spec, executed by Giuliano with 2 real accounts (knock/answer, chat, move spaces, see the other move) before accepting each phase.

## Readiness gate (2026-07-18)

All items Pass → **Ready**. SPEC written to `SPEC.md`.

## Round 1 answers (confirmed reading)

- **Problems:** at-a-glance legibility fails; in short-height windows user loses sight of own location. Visual decorations/animations NOT a problem. "Modos de estilo" issue ambiguous → round 2 q2.
- **Direction:** presence-first clarity (A) evolving current grid concept (D). Admin/CEO stats dashboard is a separate future feature, OUT of this design scope.
- **Primary user:** ICs win tie-breaks. Admins served by future dashboard.
- **Jobs:** see who's where; join/move in one action; understand each space's activity; start interaction fast (message/knock). Async logs (G) → future dashboard, out of scope.
- **Scope:** entire floor-plan page (grid, cards, NowBoard, neighborhoods, detail panel).
- **Paradigm:** leaning hybrid, but wants comparable HTML prototypes to choose (like v3 process) → decision deferred to prototype comparison, formalized in spec.
- **Constraints:** UI-only (presence/realtime data model untouched); keep Tailwind 4 + shadcn/Radix.
- **Themes:** one polished dark + one light; dark should carry Neon Cyberpunk DNA (user's personal theme).
- **Must-preserve:** knock flow, capacity/full states, neighborhoods (crucial for group work), audio (essential communication). User does NOT know what NowBoard metrics / activity-log+transcript peeks / attention beacons are → round 2 decides their fate.
- **Edge cases (all confirmed):** empty office, stale presence/disconnect, 30+ users in a space, 30+ spaces, missing avatars (today: initials fallback), slow network.
- **Validation:** HTML prototype approved by user BEFORE React; task-based checks (find teammate & join <5s).
- **Rollout:** SPEC → HTML prototypes → approval → phased React implementation replacing `modern/` components in place.
- **Tests:** test-after (Testing Library + Playwright smoke); final gate is user's manual UAT of realtime flows (knock/answer, chat between two users) — automation can't prove those.

## Current understanding

| Area | Status | Notes |
|---|---|---|
| Goals | Partial | Core problem clear; self-location behavior + "modos de estilo" ambiguity pending (R2 q1-q2) |
| Users | Clear | ICs primary; admins get future dashboard |
| Requirements | Partial | Jobs & surface clear; paradigm deferred to prototype comparison (explicit process); feature fates pending R2 |
| Constraints | Partial | UI-only + stack clear; responsive floor & perf bar pending (R2 q6-q7) |
| Edge cases | Clear | All six confirmed with current-behavior examples |
| Business rules | Partial | Themes clear; NowBoard/log/transcript/beacons fate pending (R2 q3-q5) |
| Acceptance criteria | Partial | Prototype gate + task checks clear; a11y level & UAT checklist pending (R2 q9-q10) |
| Test strategy | Clear | Test-after + mandatory manual UAT by user for realtime flows |
