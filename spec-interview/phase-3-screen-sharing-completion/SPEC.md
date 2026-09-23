# SPEC: Phase 3 Screen-Sharing Completion

Goal: Make single-presenter screen sharing remain visible and usable for authenticated room occupants within five seconds, without interrupting spatial audio.

## 1. Summary

Complete Phase 3 by diagnosing and correcting the real browser failure where display capture starts briefly but the integrated presentation stage disappears. Preserve the existing P2P WebRTC audio path, authenticated Supabase authority, private Realtime signaling, and one-presenter-per-space contract. Prove the correction with cause-specific regression coverage and real two-account Chrome and Edge UAT on one Windows computer.

## 2. Problem statement

An authenticated occupant can click the screen-share control and select a browser tab, window, or display. The browser starts capture, but the sharing indicator lasts only a fraction of a second and no stable presentation stage remains. Spatial audio continues to work.

The code and prior Phase 3 records claim that this flow passed earlier. The current real behavior contradicts those records. The implementation must establish the current root cause from runtime evidence before changing production code.

## 3. Goals and success metrics

### Goals

- Identify the exact post-capture failure boundary and preserve evidence of the cause.
- Keep a successful single-presenter share visible to the presenter and every eligible viewer.
- Preserve room audio during screen-share start, success, failure, stop, and teardown.
- Give the user a persistent actionable error when capture succeeds but claim, authority, or signaling fails.
- Close Phase 3 with automatic regression evidence and real browser UAT.

### Success metrics

- The integrated presentation stage becomes stable within five seconds after source selection.
- One presenter and at least one viewer see the same canonical share in isolated authenticated browser sessions.
- Spatial audio does not stop, restart, mute, or lose its peer registry during the screen-share workflow.
- Current Chrome and Edge on Windows pass the required UAT scenarios.
- All focused tests, type-check, lint, production build, and diff checks pass.
- The reproduced root cause has at least one regression test that fails before the correction and passes after it.

## 4. Users and stakeholders

### Primary users

- An authenticated presenter who currently occupies a Virtual Office space.
- Authenticated viewers who currently occupy the same space.

### Secondary users

- Other occupants who attempt to share while a canonical presenter is active.
- Users whose browser permission, session, network, or space scope changes during sharing.

### Stakeholders

- The project owner, who performs final UAT with two real accounts.
- Maintainers of the floor-plan, WebRTC, Realtime, presence, and Supabase authorization paths.

## 5. Scope

### In scope

- Reproduce and diagnose the current post-picker screen-share failure.
- Correct the root cause in the existing screen-share lifecycle.
- Preserve the current floor-plan control and integrated presentation stage.
- Preserve the existing `AudioProvider` and `WebRTCManager` as the sole room-media path.
- Preserve the authenticated claim, renew, release, active-read, and signaling routes.
- Preserve the private Supabase Realtime signaling channel and canonical active-route reconciliation.
- Show the stage to the presenter and eligible viewers.
- Keep one canonical presenter per space.
- Keep viewer-local expand and collapse behavior.
- Add or correct regression coverage for the proven failure.
- Run real Chrome and Edge UAT with two accounts on one Windows computer.
- Preserve `.planning` as history and correct only facts or statuses made obsolete by verified results.

### Out of scope

- Two or more simultaneous presenters.
- Viewer selection between multiple shared screens.
- Camera video, a participant video grid, spotlight video, or picture-in-picture.
- Recording, persistence, storage, transcription, publication, or analysis of screen media.
- Whiteboards, background effects, host-wide media controls, and SFU migration.
- TURN as a completion dependency.
- Additional devices, paid services, or restrictive-network parity.
- Firefox, Safari, mobile browsers, and native mobile applications.
- Work from Phase 4 or later roadmap phases.

## 6. User journeys

- A current occupant clicks **Share screen**, selects a valid source, and sees the integrated stage within five seconds.
- A viewer in the same space sees the same canonical share and can expand or collapse it locally.
- The presenter stops sharing from the browser or application, and the stage disappears without affecting audio.
- A user cancels or denies capture. The picker closes, no stage remains, and audio continues.
- Capture succeeds but claim, authority, or signaling fails. Display media stops, audio continues, and an actionable error remains visible.
- A second occupant attempts to share while a presenter is active. The second occupant receives a clear busy result.
- The presenter leaves the space, changes identity, reloads, closes the tab, or loses the lease. Only display media retires.

## 7. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---|---|
| FR-001 | A current occupant can start video-only display capture from a direct screen-share control gesture. | Must | The native picker opens only after the click and requests no display audio. |
| FR-002 | A successful share displays one integrated canonical stage to the presenter and every eligible viewer within five seconds. | Must | Presenter and viewer see the same presenter and share identity with a live video track. |
| FR-003 | Exactly one canonical presenter can share in a space at one time. | Must | A second start attempt cannot replace the active presenter and receives clear busy feedback. |
| FR-004 | Screen sharing never interrupts or restarts room audio. | Must | Microphone state, remote audio, peer ownership, and speaking state remain valid across all share paths. |
| FR-005 | A post-capture failure stops only display media and shows a persistent actionable error. | Must | No stage or display sender remains; the error identifies a retry or rejoin action; audio continues. |
| FR-006 | Stop, browser-ended capture, presenter departure, space change, session change, authoritative null, mismatch, and expiry remove the stage and display sender. | Must | Each trigger converges once without stale media or cross-room state. |
| FR-007 | Only authenticated occupants with the exact company, space, user, presence session, and token scope can claim, read, renew, release, or signal a share. | Must | Unauthorized or stale scopes fail closed and cannot attach media. |
| FR-008 | Realtime events remain invalidation signals; the authenticated active route remains the canonical presenter authority. | Must | A missed invalidation still converges through periodic authoritative reconciliation. |
| FR-009 | Each viewer can expand or collapse the one integrated stage locally without changing another viewer's state. | Must | The viewer-local control changes only that browser session. |
| FR-010 | Current Chrome and Edge on Windows support the complete required workflow. | Must | Both browsers pass the final two-account UAT. |
| FR-011 | Screen media is never recorded, persisted, transcribed, republished, or exposed to a host-wide remote-control action. | Must | No media storage, recording, transcript, publish, or global stop path exists. |
| FR-012 | The implementation records the proven root cause and the regression evidence that prevents recurrence. | Must | A failing-before and passing-after regression maps to the diagnosed runtime boundary. |

## 8. Business rules

| ID | Rule | Rationale |
|---|---|---|
| BR-001 | Only a current authenticated occupant can participate in a room share. | Screen media belongs to the current room and Presence scope. |
| BR-002 | A space has at most one canonical presenter. | Phase 3 intentionally defers multi-presenter selection. |
| BR-003 | The presenter and eligible viewers see the same canonical share identity. | The stage must not render stale or mismatched media. |
| BR-004 | Display lifecycle changes never own microphone or room-audio teardown. | Spatial audio already works and is a protected capability. |
| BR-005 | The active authenticated route authorizes presenter state. | Browser time and Realtime payloads cannot grant authority. |
| BR-006 | Screen media remains ephemeral and video-only. | Phase 3 has no recording, persistence, transcription, or display audio. |
| BR-007 | A failed share must not fail silently. | The current fraction-of-a-second failure gives no useful recovery path. |
| BR-008 | Broad Supabase migration push or history repair is prohibited. | Local and remote migration histories are known to diverge. |

## 9. Data and integrations

### Data inputs

- A browser `MediaStream` returned by `getDisplayMedia({ video: true, audio: false })`.
- The authenticated user, company, current space, Presence session, and access token.
- A generated share ID and the server-issued canonical lease response.
- Private signaling descriptions, ICE candidates, handshakes, presenter hints, and invalidations.

### Data outputs

- An ephemeral local or remote live display stream attached to the integrated stage.
- One canonical screen-share lease for the current space.
- Typed claim, renew, release, active-read, and signaling results.
- User-visible progress, busy, cancellation, unsupported, signaling, and recovery feedback.
- Test and UAT evidence. No screen-media content is stored.

### Integrations

- Browser Media Capture and Streams API.
- Browser WebRTC peer connections using the existing free STUN default.
- Supabase Auth, Postgres lease RPCs, Presence scope, and private Realtime signaling.
- Next.js authenticated screen-share API routes.
- The existing floor-plan presentation stage and media controls.

## 10. Constraints and assumptions

### Constraints

- Use the current Next.js 16, React 19, TypeScript strict, Supabase, and WebRTC architecture.
- Reuse the existing `AudioProvider`, `WebRTCManager`, screen-share routes, and presentation components.
- Do not add a paid service or require a second computer.
- Do not weaken authorization, RLS, Realtime scope, type validation, or test assertions.
- Diagnose the runtime failure before changing production code.
- Preserve unrelated user changes in the dirty worktree.
- Final UAT uses the local application connected to production project `vhabpcoyypobgasacsko`, as authorized in Round 1.
- Do not create or apply a new migration unless evidence proves the existing database contract is insufficient.
- Obtain explicit target authorization before any new online database change.
- An application code change, database application, and deployment remain separate states.

### Assumptions

- The project owner can use two existing accounts in isolated Chrome and Edge sessions on one Windows computer.
- The presenter can share a harmless third window, such as Notepad, during UAT.
- TURN and restrictive-network traversal are not Phase 3 completion gates.

## 11. Edge cases and failure modes

| Case | Expected behavior |
|---|---|
| Picker cancellation | No claim, stage, sender, or stale status remains; audio continues. |
| Permission denial | Display capture stops; a permission-specific message appears; audio continues. |
| Missing display source or live track | No claim or attachment remains; an actionable message appears. |
| Claim is busy | The active presenter remains unchanged; the second user sees busy feedback. |
| Claim returns malformed or mismatched identity | The client rejects it, compensates any exact committed claim when required, and cleans display-only state. |
| Active read returns a later canonical null | The owned display stops exactly once; audio and signaling remain active. |
| Active read returns a later mismatch | The invalid display stops exactly once and no mismatched stream attaches. |
| A pre-claim read completes after claim | It cannot retire the new validated share. |
| Signaling send fails or times out | A persistent actionable error appears; display cleanup preserves audio. |
| Realtime invalidation is missed | Periodic authenticated reconciliation converges to the server state. |
| Presenter closes or reloads the tab | The viewer loses only the stage after authoritative confirmation. |
| Presenter changes space, session, token, or identity | The prior manager scope and display state retire without leaking into the new scope. |
| Browser ends the selected source | The presenter releases display ownership and all viewers remove the stage. |
| Viewer receives a track before canonical authority | The track stays buffered or unattached until the exact canonical share is confirmed. |
| Remote display track ends | The stage shows unavailable or retires according to canonical state; stale video is never displayed. |
| Retry after a terminal failure | The control becomes usable again after cleanup and starts a new fenced lifecycle. |

## 12. Security, privacy, compliance, and abuse considerations

- Derive sender identity, company, space, user, and Presence authority on the server.
- Never trust client-selected source identity fields for signaling authority.
- Validate exact user, space, session, token, presenter, and share identities before attachment.
- Keep screen media P2P and ephemeral. Do not persist or process its content.
- Preserve forced RLS, least-privilege grants, private topics, and service-role secrecy.
- Reject stale sessions, unauthorized viewers, cross-company access, cross-space signals, and forged presenter state.
- Rate-limit signaling intents and keep payload schemas strict.
- Do not use broad migration history repair to bypass production divergence.

## 13. Accessibility, localization, and usability considerations

- Keep the screen-share control keyboard accessible with visible focus.
- Preserve clear accessible names for start, stop, expand, collapse, status, and error controls.
- Announce progress, cancellation, busy, connection, unavailable, and failure states through appropriate live regions.
- Return focus to a usable screen-share control after stopping.
- Keep the stage usable at reduced desktop window sizes.
- Preserve motion-reduction behavior.
- Product UI remains English. The project owner can execute the UAT instructions in Portuguese.

## 14. Acceptance criteria

- AC-001 (FR-001): Given a current occupant, when the user clicks **Share screen**, then the native picker opens from that gesture and requests video-only capture.
- AC-002 (FR-002, FR-010): Given two authenticated accounts in the same space, when the Chrome presenter selects a valid source, then both Chrome and Edge sessions show the same stable stage within five seconds.
- AC-003 (FR-002, FR-010): Repeat AC-002 with Edge as presenter and Chrome as viewer; both sessions show the same stable stage within five seconds.
- AC-004 (FR-003): Given an active presenter, when another occupant attempts to share, then the active stage remains and the second occupant receives busy feedback.
- AC-005 (FR-004): Given active spatial audio, when screen sharing starts, succeeds, fails, stops, or expires, then microphone, mute state, remote audio, peer ownership, and speaking behavior remain valid.
- AC-006 (FR-005): Given browser capture succeeds but claim, authority, or signaling fails, when cleanup completes, then no display sender or stage remains, audio continues, and a persistent actionable error is visible.
- AC-007 (FR-006): Given an active share, when the presenter stops from the application or browser, then presenter and viewer stages disappear without stale media.
- AC-008 (FR-006, FR-008): Given an active share and a missed Realtime invalidation, when the authenticated active route later returns null or mismatch, then display media retires exactly once while audio continues.
- AC-009 (FR-006, FR-007): Given an active share, when the presenter changes space, session, token, identity, reloads, or closes the tab, then the prior display cannot remain in any old or new scope.
- AC-010 (FR-007): Given a stale or unauthorized session, when it calls a screen-share route or submits signaling intent, then the server fails closed without exposing or attaching media.
- AC-011 (FR-009): Given an active stage, when one viewer collapses or expands it, then other viewers and the presenter keep their own local stage state.
- AC-012 (FR-011): Given the completed UI and code paths, when maintainers inspect them, then no recording, persistence, transcription, republishing, display audio, or global host stop capability exists.
- AC-013 (FR-012): Given the reproduced current failure, when the regression test runs before the correction, then it fails at the proven boundary; after the correction, it passes.
- AC-014 (FR-001–FR-012): Given the final candidate, when focused tests, type-check, lint, production build, diff checks, and real UAT run, then every required gate passes without weakened assertions.

## 15. Test strategy

- Use cause-first test-driven correction. Reproduce the real failure and identify its boundary before production edits.
- Add the smallest regression test at the level that owns the cause.
- Use unit tests for WebRTC sender, track, cleanup, and identity behavior.
- Use integration tests for `AudioProvider`, active-share reconciliation, stage attachment, and failure feedback.
- Use API tests for typed route behavior, authenticated identity derivation, stale scope, and signaling delivery when those paths are involved.
- Use database and RLS tests only if evidence implicates the existing lease or policy contract.
- Use browser tests for presenter and viewer UI, stage lifecycle, focus, and native capture boundaries where automation can provide real evidence.
- Run real UAT with two separate accounts in isolated Chrome and Edge sessions on the same Windows computer.
- Run both presenter directions: Chrome to Edge and Edge to Chrome.
- Share a harmless third window during UAT to avoid recursive browser capture.
- Run focused tests, type-check, lint, production build, and diff checks before UAT.
- Keep the project owner's final real workflow confirmation as the completion gate.

## 16. Validation and launch checklist

- [ ] Reproduce the current fraction-of-a-second failure and record the exact failing boundary.
- [ ] Add a regression that fails for the proven cause.
- [ ] Correct the root cause without creating a parallel media lifecycle.
- [ ] Pass focused WebRTC, audio context, signaling, stage, and route tests relevant to the correction.
- [ ] Pass TypeScript type-check.
- [ ] Pass lint for touched files and the required project lint gate.
- [ ] Pass the production build.
- [ ] Pass final diff inspection and `git diff --check`.
- [ ] Confirm no new migration is required, or stop for explicit authorization before any database change.
- [ ] Run Chrome-presenter to Edge-viewer UAT against the authorized production-backed environment.
- [ ] Run Edge-presenter to Chrome-viewer UAT against the authorized production-backed environment.
- [ ] Confirm audio remains active across start, stop, cancellation, failure, and tab closure.
- [ ] Confirm only one presenter, one canonical stage, clear failure feedback, and no stale cross-room media.
- [ ] Update only factually stale Phase 3 status or evidence in `.planning`.
- [ ] Obtain the project owner's final workflow confirmation.

## 17. Open questions

- None. Simultaneous presenters and viewer-selected screens are intentionally deferred to a separate future SPEC.
