Status: closed

# Spec Interview State — phase-3-screen-sharing-completion

## Scope restatement

Finish only Phase 3 of Virtual Office. Diagnose and correct the current screen-sharing failure where browser capture starts briefly but the integrated presentation stage does not remain visible. Preserve the working spatial audio and the completed Phase 3 boundaries.

**Started:** 2026-08-25
**Project type:** Code (Next.js 16, React 19, TypeScript strict, Supabase, WebRTC, Vitest, and Playwright). The test-strategy domain applies.

## Evidence inspected before the interview

- The user limited this work to Phase 3 and reported that spatial audio works while the shared-screen stage does not appear.
- `.planning/ROADMAP.md` defines Phase 3 as room-scoped P2P audio plus one screen presenter on an integrated expandable floor-plan stage.
- `.planning/REQUIREMENTS.md` maps Phase 3 to `VID-01`, `VID-02`, and `VID-04`. Camera video and advanced collaboration remain deferred.
- `.planning/phases/03-video-and-screen-sharing/03-UAT.md` records the current real failure. The picker opens, capture starts for a fraction of a second, and the browser sharing indicator disappears before a stable stage appears.
- `.planning/phases/03-video-and-screen-sharing/03-TRACKER.md` records an earlier successful production smoke with two isolated Chromium contexts. The current failure contradicts that evidence and must be reproduced again.
- `src/components/floor-plan/floor-plan.tsx` mounts the stage before `ModernFloorPlan` and exposes screen-sharing controls only to a current occupant.
- `src/components/floor-plan/FloorPlanPresentationStage.tsx` renders nothing until `activeScreenShare` exists. It attaches video only when the canonical presenter, share ID, display stream, and live video track match.
- `src/contexts/AudioContext.tsx` captures the display, claims the lease, attaches the display to the existing WebRTC manager, and then exposes the local canonical share. A later authoritative null or mismatch stops only the display lifecycle.
- `src/hooks/realtime/useAudioSignaling.ts` treats the authenticated active route as authority and periodically reconciles it. Realtime events only trigger reconciliation.
- The production screen-share migrations and signaling migration were previously applied and read back on project `vhabpcoyypobgasacsko`. The migration histories remain divergent, so broad push or broad history repair is prohibited.
- The worktree contains unrelated user removals from the former GSD installation. They are outside this work and must remain untouched.

## Answers extracted from supplied context

## Round 1 answers — 2026-08-25

- `q1 = A`: Close Phase 3 with the screen-share correction, audio preservation, regression coverage, and real UAT.
- `q2 = unanswered`: The user asked how to simulate presenter and viewer on one computer. No presenter-stage behavior was selected.
- `q3 = A`: A stable presentation stage must appear within five seconds after source selection.
- `q4 = A`: A post-capture claim, authority, or signaling failure must stop only display media, preserve audio, and show a persistent actionable error.
- `q5 = A`: Current Chrome and Edge on Windows desktop are the mandatory browser floor.
- `q6 = A`: Real acceptance uses two accounts in isolated browser contexts on the same computer.
- `q7 = A`: Final UAT uses the local application connected to the previously authorized production Supabase project.
- `q8 = A`: The technical gate includes reproduction first, a cause-specific regression test, focused tests, type-check, lint, build, and real UAT.
- `q9 = A only`: The user explicitly prohibited audio stop or restart. The other listed prohibitions were not selected and conflict with supplied Phase 3 rules, so Round 2 must confirm them.
- `q10 = A`: Preserve `.planning` history and correct only status or claims that become factually stale.

### Round 1 clarification supplied by the interviewer

- One computer can simulate both roles with two isolated sessions, such as Chrome normal and Edge InPrivate, using different accounts in the same space.
- The presenter shares a separate harmless window, such as Notepad. The viewer stays in the second browser.
- This setup does not decide whether the presenter must see the same integrated stage. Round 2 asks that product decision.

## Round 2 answers — 2026-08-25

- `q1 = A`: The presenter and every eligible viewer must see the integrated stage. The presenter uses the local stage as immediate confirmation.
- `q2 = A`: All five prohibitions remain mandatory: preserve audio, keep one canonical presenter, keep capture control visible, never persist media, and prevent stale cross-room media.
- `q2 note`: The user asked whether two people could present simultaneously while each viewer selects which screen to view.

### Scope implication unlocked by Round 2

- Viewer-selectable simultaneous presenters are technically possible, but they contradict the confirmed one-presenter Phase 3 contract.
- This capability would require per-presenter authority, multiple display senders, a viewer selector, new resource limits, new failure rules, and wider regression coverage.
- Round 3 must decide whether to defer this capability or expand the current Phase 3 completion scope.

## Round 3 answer — 2026-08-25

- `q1 = A`: Keep exactly one presenter in Phase 3. Defer simultaneous presenters and viewer-selected screens to a separate future SPEC.

### Problem and goals

- The problem is not initial browser capture. The picker opens and capture begins, but the presentation stage disappears or never becomes stable.
- The desired outcome is to finish Phase 3, not to expand the product roadmap.
- Spatial audio already works and must remain functional during screen-share start, failure, stop, space change, and presenter departure.

### Users and stakeholders

- Primary users are authenticated occupants of the same Virtual Office space.
- The relevant roles are the presenter and one or more viewers.
- The project owner performs the final real workflow confirmation.

### Scope and deliverables

- In scope: root-cause diagnosis, a durable screen-sharing correction, regression coverage, real two-identity verification, and Phase 3 completion evidence.
- In scope: the existing floor-plan controls, presentation stage, AudioProvider, WebRTC manager, authenticated screen-share routes, and Realtime signaling when evidence requires them.
- Out of scope: camera video, recording, transcription, storage, whiteboard, host media controls, SFU migration, and later phases.

### Requirements and business rules

- Only a current space occupant can start or view a room-scoped share.
- Exactly one canonical presenter can own the screen-share lease for a space.
- The presenter and viewers must use the existing P2P WebRTC manager and private Supabase Realtime signaling path.
- Screen sharing is video-only and must not mute, restart, or tear down room audio.
- The stage must disappear cleanly after stop, browser-ended sharing, presenter departure, space change, authoritative lease loss, or expiry.
- Screen media must not be recorded, persisted, transcribed, or republished.

### Constraints

- Preserve the current Next.js, React, TypeScript, Supabase, WebRTC, and repository architecture.
- Keep the existing free STUN default. TURN is optional and is not a Phase 3 completion gate.
- Do not add a paid service or require extra equipment for Phase 3.
- Diagnose before changing production code.
- Treat a new database migration as unproven until runtime evidence shows that the existing contract is insufficient.
- Do not change an online database without explicit target authorization.

### Edge cases and failure modes

- Permission denial or picker cancellation must leave no stage or stale share while audio continues.
- A successful picker followed by claim, signaling, or authority failure must not fail silently.
- A stale or mismatched presenter/share/track must never attach to the stage.
- A missed Realtime invalidation must converge through the authenticated active route.
- A presenter closing or reloading the tab must remove only display media for viewers.
- A second presenter must receive a clear busy result and must not replace the current presenter.
- Space, session, identity, or access-token changes must retire the prior media scope.

### Acceptance criteria and validation

- Existing Phase 3 criteria require two real identities in one space, continued audio, one visible screen, and clean teardown.
- The current UAT is failed because a real share does not stay visible.
- Deterministic tests alone do not prove browser capture, two-user P2P delivery, or native permission behavior.

### Test strategy

- Existing coverage includes unit and integration tests for the WebRTC manager, audio context, signaling, stage, routes, and database policies.
- Existing browser evidence used two isolated Chromium contexts.
- The new correction needs a regression test that fails for the reproduced cause and a real two-identity browser check.

## Current understanding

| Area | Status | Notes |
|---|---|---|
| Goals | Clear | Rounds 1 and 3 confirm the single-presenter closure boundary and five-second target. |
| Users | Clear | Presenter, viewers, owner, Windows desktop, Chrome, Edge, and the two-account single-computer environment are identified. |
| Requirements | Clear | Round 2 confirms presenter-local stage behavior. Round 3 retains the one-presenter contract. |
| Constraints | Clear | Stack, cost, architecture, Chrome/Edge browser floor, same-computer validation, and named production-backed UAT are explicit. |
| Edge cases | Clear | Concrete capture, authority, signaling, lifecycle, stale-state, and audio-preservation cases are documented. |
| Business rules | Clear | Round 2 confirms all five existing prohibitions and the current one-presenter contract. |
| Acceptance criteria | Clear | Timing, stage visibility, one-presenter ownership, audio preservation, failure feedback, teardown, environments, and gates are observable. |
| Test strategy | Clear | Round 1 confirms cause-first regression, focused tests, type-check, lint, build, and two-account real UAT. |

## Remaining unknowns

- None. Simultaneous presenters are intentionally deferred to a separate future SPEC.

## SPEC readiness check

- Goals are specific and measurable: Pass — Round 1 `q1` and `q3`, plus Round 3 `q1`, define closure, timing, and presenter cardinality.
- Users and stakeholders are identified: Pass — Round 1 `q5`, `q6`, and supplied context identify roles and environments.
- In-scope and out-of-scope boundaries are explicit: Pass — Round 1 `q1`, `q10`, Round 3 `q1`, and supplied roadmap exclusions define the boundary.
- Functional requirements are testable: Pass — Rounds 1 through 3 define start, visibility, timing, failure, presenter cardinality, teardown, and preserved audio.
- Business rules are explicit: Pass — Round 2 `q2` confirms the five mandatory prohibitions for the current contract.
- Constraints are explicit: Pass — Round 1 `q5`, `q6`, `q7`, and `q10` define browser, environment, rollout, and artifact constraints.
- Edge cases and failure modes are covered: Pass — cited in `03-UAT.md`, `AudioContext.tsx`, `useAudioSignaling.ts`, and `FloorPlanPresentationStage.tsx`.
- Acceptance criteria are observable: Pass — Round 1 `q3` through `q8`, Round 2 `q1` and `q2`, and Round 3 `q1` provide observable results.
- Every Must-priority functional requirement has at least one acceptance criterion: Pass — the final Must set is fixed and mapped in `SPEC.md`.
- Test strategy is defined (code projects only): Pass — Round 1 `q8`, `q5`, `q6`, and `q7` define the complete gate.
- Open questions are non-blocking or intentionally deferred: Pass — Round 3 `q1` intentionally defers simultaneous presenters.

Verdict: Ready

## Interview rounds

- Round 1: `round-1.html` — answered and recorded on 2026-08-25.
- Round 2: `round-2.html` — answered and recorded on 2026-08-25.
- Round 3: `round-3.html` — answered and recorded on 2026-08-25.
