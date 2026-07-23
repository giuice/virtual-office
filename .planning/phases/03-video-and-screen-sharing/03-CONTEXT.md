# Phase 3: Video and Screen Sharing - Context

**Gathered:** 2026-07-22
**Status:** Needs roadmap alignment before planning

<domain>
## Phase Boundary

Deliver a demonstrable in-space collaboration experience by preserving the existing WebRTC audio and adding reliable screen sharing. The space itself is the persistent conversation: occupants can hear the room, explicitly enable their own microphone, and view one presenter's screen on an integrated stage.

The phase is intentionally not a Zoom/Meet replacement. Basic camera video may be included only if it is low-risk and does not delay or destabilize audio and screen sharing; it is not an acceptance criterion.

**Scope alignment required:** `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` still assign VID-01 through VID-10 to this phase. Before planning, update that mapping so Phase 3 retains VID-01, VID-02, and VID-04, treats basic VID-03 as optional, and defers VID-05 through VID-10 plus the mandatory nine-participant video requirement.

</domain>

<decisions>
## Implementation Decisions

### Product priority and transport
- **D-01:** The acceptance-critical outcome is existing spatial audio plus reliable screen sharing, suitable for demonstrating the product to the user's company.
- **D-02:** Preserve and extend the existing P2P WebRTC audio transport and Supabase Realtime signaling for this phase. Do not migrate to LiveKit or another SFU now. — **Reversibility:** costly — a future migration replaces `WebRTCManager` and signaling internals, although the product UI and space behavior can remain.
- **D-03:** Do not build a general-purpose Zoom/Meet equivalent. Faces are secondary to clearly seeing the content being presented.
- **D-04:** Basic camera video is optional only when it can reuse the chosen implementation safely; it must not delay or weaken audio or screen sharing and is not a completion gate.
- **D-05:** Research and planning must validate the current P2P approach with realistic multi-user screen-sharing tests before claiming support at larger room sizes. LiveKit or another SFU remains the expansion path if observed performance, recording, or advanced video later requires it.

### Meeting model
- **D-06:** The space itself is the meeting. There is no separate call session to create, invite everyone into, or end globally.
- **D-07:** Every occupant belongs to the room conversation. Existing open/restricted space access and Knock to Enter govern who may enter; do not create a second "closed meeting" concept.
- **D-08:** On entering a space, the person connects in listen-only mode: remote audio is available, while their microphone and camera remain off until explicitly enabled.
- **D-09:** The room is persistent while occupied. No implicit host can end the conversation for everyone.
- **D-10:** Moving to another space fully ends media participation in the prior space. In the new space, the person again enters listening and must reactivate microphone, camera, or sharing.

### Screen-sharing experience
- **D-11:** Only one participant may share a screen at a time.
- **D-12:** A shared screen occupies the main stage. Participant faces, when basic video exists, remain in a secondary strip rather than competing with the presented content.
- **D-13:** The stage is integrated into the floor-plan page and can be expanded or collapsed, preserving the relationship between the presentation and its space.
- **D-14:** Each viewer may change their own presentation view; ending screen sharing restores the prior stable layout.
- **D-15:** If basic video is included, use a stable grid with speaking indication and local pinning. Do not automatically replace the spotlight whenever the active speaker changes.

### Claude's Discretion
- Exact stage dimensions, responsive breakpoints, and whether the participant strip sits beside or below the shared screen.
- The low-level renegotiation strategy used to add and remove the display track while preserving existing audio.
- Error wording and retry timing, provided permission denial, user cancellation, presenter departure, and browser share termination are handled visibly.
- Whether optional basic camera support is safe enough to include after audio and screen-sharing acceptance criteria are complete.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 3 — currently contains the superseded full video-collaboration boundary; must be aligned before planning.
- `.planning/REQUIREMENTS.md` § Video & Screen Sharing — current VID-01 through VID-10 definitions and traceability requiring scope remapping.
- `.planning/PROJECT.md` § Constraints — existing P2P mesh limit and product constraints.

### Existing audio and signaling
- `src/contexts/AudioContext.tsx` — current room-scoped audio lifecycle, listen-only signaling, explicit microphone enablement, mute state, and peer state.
- `src/lib/webrtc/WebRTCManager.ts` — current P2P peer connections, media tracks, renegotiation, remote media handling, and cleanup boundary to extend.
- `src/hooks/realtime/useAudioSignaling.ts` — Supabase Realtime WebRTC signaling that this phase preserves.
- `src/lib/webrtc/ice-config.ts` — current STUN/TURN configuration and room-limit constants.

### Floor-plan integration
- `src/components/floor-plan/SpaceAudioControls.tsx` — established explicit microphone controls and speaking state.
- `src/components/floor-plan/floor-plan.tsx` — mounts `AudioProvider` for the current space and is the primary lifecycle integration point.
- `src/components/floor-plan/FloorPlanToolbar.tsx` — existing audio control placement and candidate entry point for sharing controls.
- `src/components/floor-plan/modern/SpaceDetailPanel.tsx` — existing secondary audio controls within space details.

### Future transport reference
- `https://docs.livekit.io/transport.md` — user-reviewed overview of LiveKit rooms, tracks, adaptive transport, server SDKs, recording, and self-hosting; reference for a deferred SFU migration, not a Phase 3 dependency.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AudioProvider`: already binds one media manager to the active `spaceId`, enters listen-only, defaults the microphone to muted, and cleans up when the space changes.
- `WebRTCManager`: already owns one `RTCPeerConnection` per peer, adds local tracks, renegotiates existing peers, handles incoming tracks, and closes tracks/connections on cleanup.
- `useAudioSignaling`: already exchanges handshake, SDP, and ICE events through a room-scoped Supabase Realtime channel.
- `SpaceAudioControls`: supplies the established permission, mute, error, and keyboard interaction patterns that sharing controls should match.
- `FloorPlanToolbar` and the floor-plan shell: existing locations for launching and rendering an integrated sharing stage.

### Established Patterns
- The active space owns the media lifecycle; changing `spaceId` recreates and cleans the manager.
- Users join media transport in listen-only mode and transmit only after an explicit browser gesture.
- Supabase Realtime carries signaling while media remains peer-to-peer.
- STUN has a default and TURN is operator-configurable through environment variables.
- Existing cleanup stops local tracks and removes remote media elements, which screen tracks must also respect.

### Integration Points
- Extend the current media manager to distinguish audio, optional camera, and `screen` tracks without creating a parallel call subsystem.
- Add a room-scoped sharing state/event to the existing signaling contract so all peers agree on the single active presenter.
- Render the stage under the existing floor-plan media provider so space changes automatically tear it down.
- Add the sharing action alongside existing audio controls and apply the repository's click-stop protocol where controls appear inside clickable space UI.

</code_context>

<specifics>
## Specific Ideas

- The immediate goal is to show the product working to the user's company without requiring external investment.
- Preserve the audio already built rather than replacing it solely to obtain screen sharing.
- During a presentation, clearly seeing the presenter's content matters more than building a rich face-centric conference grid.
- The UI should continue to feel like a conversation happening inside a Virtual Office space, not an embedded generic meeting product.
- A managed or self-hosted SFU can be evaluated after validation if growth proves that the P2P transport is insufficient.

</specifics>

<deferred>
## Deferred Ideas

- Mandatory camera grid for up to nine participants (advanced VID-03 scope).
- LiveKit or another SFU transport migration for scale and adaptive media.
- Shared whiteboard and PNG export (VID-05).
- Call recording and Supabase Storage output (VID-06).
- Background blur and virtual backgrounds (VID-07).
- Detailed connection-quality indicators and diagnostics (VID-08).
- Picture-in-picture call window (VID-09).
- Google Calendar/Outlook scheduling and reminders (VID-10).
- Multiple simultaneous screen shares.

</deferred>

---

*Phase: 03-video-and-screen-sharing*
*Context gathered: 2026-07-22*
