---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04
current_phase_name: messaging-timeline
status: reference_only
stopped_at: Phase 3 owner accepted; Phase 4 baseline reconciled
last_updated: "2026-10-03T11:46:42Z"
last_activity: 2026-10-03
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 26
  completed_plans: 26
---

# Project State

> Historical reference. GSD is retired; do not execute its skills or workflows. New delivery uses `spec-to-done` and an approved Ready SPEC under `spec-interview/<slug>/`. This file provides context, not an execution contract.

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-03)

**Core value:** When a user logs in, they instantly see where colleagues are, what's happening in each room, and can walk into any space to talk -- the end-to-end spatial office loop must work flawlessly.
**Next product area:** Phase 04 — Messaging Timeline, as input for a new spec-to-done SPEC; no new development contract is approved yet.

## Current Position

Next reference phase: 04 (messaging-timeline) — READY FOR SPEC DISCUSSION
Plan: none written; scope and context must be agreed before execution plans.
Baseline: [docs/messaging/phase-4-source-baseline.md](../docs/messaging/phase-4-source-baseline.md)

Phase 03 is closed for routing by the owner's 2026-10-03 completion confirmation, 15/15 execution summaries, and subsequent recorded corrections. Old UAT failures and manual handoff instructions describe earlier snapshots; they do not instruct a new session to rerun completed waves.

### Next action

Use the messaging baseline as input to spec-to-done Specify: choose the first slice, define reader/time semantics and starred-filter scope, then settle upload limits/previews and voice-note behavior. New SPEC, state, PLAN, TRACK, and REPORT belong under spec-interview/<slug>/. Require user-confirmed Ready SPEC before planning or implementation. Suggested first slice: read receipts + starred filtering, reusing the existing backend; this is a recommendation, not an approved scope.

### Current planning inventory

| Phase | Execution plans | Summaries | Routing status |
| --- | --- | --- | --- |
| 01 — Stabilization | 2 | 2 | Complete |
| 02 — Floor Plan Completion | 8 | 8 | Complete |
| 02.1 — Presence Reload Fixes | 1 | 1 | Complete |
| 03 — Spatial Audio and Screen Sharing | 15 | 15 | Complete — owner accepted |
| 04 — Messaging Timeline | 0 | 0 | Ready for discussion |

There are 8 roadmap phases, including 02.1; 4 are complete. All 26 existing execution plans have summaries. Future plan counts and durations are not estimated from old placeholders. Historical per-plan timing remains in the phase summaries.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Bugs-first stabilization phase before any new features
- [Roadmap]: 7 phases derived from 7 requirement categories (standard depth)
- [Roadmap]: Video & Screen Sharing moved to Phase 3 (right after Floor Plan) to leverage spatial foundation early
- [Roadmap]: Phases 4, 6, 7 can run after Phase 1; Phase 3 requires Phase 2; Phase 5 requires Phase 4
- [01-01]: Used inline style for gridTemplateColumns (auto-fill + minmax) instead of Tailwind arbitrary values for Tailwind 4 reliability
- [01-01]: Kept fullWidth prop in DashboardShell but removed from floor plan page to restore max-w-[1600px]
- [Phase 01-02]: Auth login redirect uses company context check: /floor-plan if company, /onboarding if not
- [Phase 01-02]: Replaced AudioContext oscillator with new Audio() for knock sound playback
- [Phase 01-02]: Removed all toast notifications from login/signup, inline-only error display
- [Phase 02]: Wave 0 uses runnable todo-only Vitest scaffolds so downstream Phase 2 plans can verify against stable file targets before full implementation exists.
- [Phase 02]: Planned company default-space settings fields stay local to scaffold tests in Wave 0; production types remain unchanged until implementation plans land.
- [Phase 02-floor-plan-completion]: Offline users stay in their last space bucket on the client until the fade completes, then server cleanup clears current_space_id.
- [Phase 02-floor-plan-completion]: The existing users/location API handles both normal location updates and sendBeacon-style POST cleanup to avoid duplicate cleanup paths.
- [Phase 02-floor-plan-completion]: Reused SpaceActionButtons with an inline-card layout for restricted-space knock CTAs instead of adding a second button component.
- [Phase 02-floor-plan-completion]: ModernFloorPlan routes incoming knocks to per-space card banners keyed by spaceId rather than global sonner custom toasts.
- [Phase 02-floor-plan-completion]: Requester timeout presentation is handled in ModernFloorPlan so the inline CTA can briefly show 'No response' before the shared knock hook resets.
- [Phase 02-floor-plan-completion]: Stored company default space and per-user home space mappings in companies.settings JSONB and protected them with deep merges in CompanyContext.
- [Phase 02-floor-plan-completion]: Reused getReconnectionContext in both useLastSpace and FloorPlan so placement and selected-space hydration follow the same rule set.
- [Phase 02-floor-plan-completion]: Kept the existing users/location payload shape for compatibility, but rejected mismatched userId values after resolving the authenticated app user from Supabase Auth.
- [Phase 02-floor-plan-completion]: Reused knock_requests and space_presence_log as the private-space authorization sources instead of introducing a second access-control table or client-only bypass.
- [Phase 02-05]: Only users with DB status online who are absent from Realtime after first sync are derived as offline; away/busy users are never force-downgraded
- [Phase 02-05]: Removed peer leave handler POST to /api/users/location entirely since self-cleanup via beforeunload and server-side cleanup are the correct paths
- [Phase 02-floor-plan-completion]: Used explicit undefined guard for settings merge instead of falsy check to correctly handle empty-object settings payloads
- [Phase 02-floor-plan-completion]: FloorPlan placement useEffect sets only visual state; useLastSpace is the sole API caller for placement
- [Phase 02-floor-plan-completion]: Grace rejoin uses three signals: exited_at (primary), last_active (secondary for beacon race), open presence log (tertiary for reload-before-beacon)
- [Phase 02.1-presence-reload-fixes]: Automatic placement and FloorPlan visual hydration persist lastSpaceId via saveLastSpace without triggering the manual-click guard.
- [Phase 03]: [03-01] Retained AudioProvider, WebRTCManager, private signaling, and the existing P2P peer registry as the sole room-media path.
- [Phase 03]: [03-01] Canonical presenter/share identity plus a live display track gate every video attachment.
- [Phase 03]: [03-01] FloorPlanPresentationStage owns srcObject attachment and exact cleanup across mismatch, retirement, collapse, replacement, and unmount.
- [Phase ?]: [03-02] RETRY_LOCK_SET is retried only once with a fresh call before asserting presenter convergence.
- [Phase ?]: [03-02] Realtime policy tests prove database authorization decisions; clients must reconnect after scope or JWT changes.
- [Phase ?]: [03-02] Execution remained local-only; no online database target was linked, queried, or mutated.
- [Phase ?]: [03-03] Stable application user ordering selects polite and impolite WebRTC negotiation roles without adding a second peer registry.
- [Phase ?]: [03-03] ICE tied to an ignored glare offer is discarded rather than buffered into a later accepted description.
- [Phase ?]: [03-03] Presenter hints remain invalidation-only and canonical share state comes from the authorized active endpoint.
- [Phase ?]: [03-03] Access-token and identity changes recreate the exact private media channel because Realtime authorization is connection-cached.
- [Phase 03]: [03-04] Only strict RETRY_LOCK_SET service unavailability and sanitized internal failures are retryable; compatibility and stale authority outcomes are terminal.
- [Phase 03]: [03-04] Release stopReason remains observability-only and is never forwarded as RPC authority.
- [Phase 03]: [03-04] Exact legacy CLAIMED envelopes receive bounded observed-release compensation before terminal 426; migration 20260723224547 remains required database-first.
- [Phase 03]: [03-04] Screen-share client fixtures must parse against the strict public API schema, including explicit retryability, so typed feedback cannot silently degrade.
- [Phase 03]: [03-11] Screen sharing remains video-only on the sole AudioProvider/WebRTCManager path and never mutates microphone or remote audio.
- [Phase 03]: [03-11] Renewal uses a fixed 10-second cadence so browser clock skew cannot invalidate a server lease.
- [Phase 03]: [03-11] Aborted committed claims are compensated server-side with the original verified auth identity and exact RPC arguments.
- [Phase ?]: [03-05] Viewer-local presentation expansion is keyed by canonical shareId and never written to Realtime or persistence.
- [Phase ?]: [03-05] Qualifying current occupancy gates media controls; selectedSpace remains chat-only.
- [Phase ?]: [03-05] Mismatched display candidates remain connecting and are never attached; only retired canonical tracks become unavailable.
- [Phase ?]: 03-06: Screen-sharing browser evidence is loopback-only and requires the disposable local fixture.
- [Phase ?]: 03-06: Deterministic canvas streams and host-only peers prove UI/lifecycle behavior, not permissions, P2P/TURN, RLS, or concurrency.
- [Phase ?]: 03-06: Presenter teardown sends targeted invalidation only; viewers re-read the authorized active route.
- [Phase 03]: Historical 03-07 revision-required gate was closed in 03-14 and subsequent corrective work; it is not an active Phase 4 blocker.
- [Phase ?]: [03-14] A rota autenticada active permanece a única autoridade; Realtime e o timer apenas disparam reconciliação.
- [Phase ?]: [03-14] Timer e leitura pertencem à assinatura exata e são cercados por identidade, sessão, token, manager, conexão e gerações.

- [Phase 03]: [03-12] Hourly cutover coverage preserves the observation with the earliest `checked_at`; exact ties favor unhealthy evidence.
- [Phase 03]: [03-12] The correction is a forward-only migration; Wave 12 changed no online database and performed no deployment.
- [Phase 03]: [post-03-12] With explicit user authorization, migration `20260727123730` was applied and recorded on production project `vhabpcoyypobgasacsko`; same-target catalog readback passed.
- [Phase 03]: [post-03-12] Production cutover observation restarted at `2026-07-27T17:06:23.560672Z`; the legacy adapter remains enabled and no cutover/adapter removal may consume evidence from before that timestamp.
- [Phase 03]: Historical no-spend decision excluded paid TURN, extra equipment, and a browser matrix; later explicitly authorized online screen-share database changes are recorded in 03-TRACKER.md.
- [Phase ?]: The free public STUN fallback remains the default; TURN is optional and not a Phase 3 completion gate.
- [Phase ?]: Restrictive-network traversal and Chrome/Firefox/Safari parity remain explicitly unverified.
- [Phase ?]: Any future production rollout requires a new request, exact-target authorization, provenance reconciliation, and a separate database-first plan.
- [Phase 03-video-and-screen-sharing]: PRESENTER_PROFILE_INVALID retires only canonical display while viewer audio and signaling remain active. — Presenter-profile failure does not invalidate the authorized viewer identity or room media scope.
- [Phase 03-video-and-screen-sharing]: Post-claim teardown requires a greater validated canonical observation version. — This separates unobserved state from authoritative null without browser time or Realtime payload authority.

### Pending Todos

Prepare the new spec-to-done SPEC from the production-source baseline; MSG-01 through MSG-04 remain incomplete end-to-end. Do not start a GSD workflow.

### Phase 4 evidence and workflow limits

- Source inspection is the messaging baseline; no new browser, application, or database tests were run during this planning reconciliation. Partial implementations are not marked as satisfied requirements.
- GSD is retired by the owner instruction on 2026-10-03. Never invoke its skills, scripts, workflows, automation, update, or reinstallation. Its absent runtime and stale skill references are historical facts, not prerequisites or repair tasks. New delivery uses spec-to-done.
- `.planning/config.json` and old GSD agent profiles are reference-only and are not active workflow configuration. Current development/delegation policy is in CLAUDE.md and the matching delegation file.

### Blockers/Concerns

- ~~Design branch broke floor plan space card sizing (STAB-01)~~ -- RESOLVED in 01-01
- ~~Auth login/signup has undiagnosed issues (STAB-02)~~ -- RESOLVED in 01-02 after human verification
- Brownfield codebase: must verify existing code before implementing to avoid duplication
- ~~03-07 bloqueado antes da Wave 11~~ — RESOLVIDO em 03-14 com reconciliação autoritativa periódica, matriz active -> null e duas revisões limpas no hash congelado.
- ~~Wave 12 blocked: first unhealthy current-hour observation lost to a later writer~~ -- RESOLVED in 03-12 by forward migration `20260727123730` and full local gate.
- Screen-share migrations `20260723104902` and `20260723224547` were applied and read back on production project `vhabpcoyypobgasacsko` on 2026-08-01.
- Screen-share signaling migration `20260801155137` was applied and recorded on production project `vhabpcoyypobgasacsko` on 2026-08-01. Browser Broadcast INSERT is removed, corrected clients use `media:v2`, and the production Realtime HTTP smoke returned 202.
- Screen-share signaling sender authority now belongs to the authenticated server route; clients submit strict intent and cannot choose source user, company, or space fields.
- Multi-user screen delivery was corrected on 2026-08-04 by matching the server Realtime send timeout to the ten-second client default. A real two-user test reached connected peers and delivered a live remote video track. Release invalidation now runs after the response, and a later acknowledged signal clears stale transport feedback. No database change was required.
- Last recorded production migration-history concern: four remote-only historical versions and nine June local-only versions (03-TRACKER.md, August). This was not rechecked on 2026-10-03. Run target preflight and reconcile exact provenance before any future online migration; never use `--include-all` or broad history repair.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260324-e13 | Fix floor-plan space-change regression (missing updateLocation call) | 2026-03-24 | pending | [260324-e13](./quick/260324-e13-diagnose-floor-plan-space-change-regress/) |
| 260324-k7r | Fix enter-space: eliminate double updateLocation + guard useLastSpace | 2026-03-24 | pending | [260324-k7r](./quick/260324-k7r-fix-enter-space-eliminate-double-updatel/) |

### Roadmap Evolution

- Phase 3 edited: title, goal, requirements, optional/deferred scope, success criteria, and traceability. On 2026-10-03 owner acceptance closed phase routing; Phase 4 now starts from a source inventory instead of unimplemented-feature assumptions.

## Session Continuity

**Last session:** 2026-10-03T11:46:42Z

Last activity: 2026-10-03 — owner confirmed Knock/screen-sharing completion; reconciled Phase 4 baseline and routing.
Stopped at: source reconciliation complete; Phase 4 is input for a new spec-to-done SPEC. No implementation or new execution plan started.
Resume file: docs/messaging/phase-4-source-baseline.md
Historical Phase 3 handoff: .planning/phases/03-video-and-screen-sharing/03-HUMAN-HANDOFF.md (superseded for routing by owner acceptance)
