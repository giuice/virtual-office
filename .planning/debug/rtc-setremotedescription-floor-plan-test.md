---
status: investigating
trigger: "RTCPeerConnection Runtime Error on /floor-plan-test - setRemoteDescription called in wrong state: stable"
created: 2026-03-18T00:00:00Z
updated: 2026-03-18T00:00:00Z
---

## Current Focus

hypothesis: Two independent issues - (1) /floor-plan-test is a dev-only test page linked from the user menu that should be removed for production, and (2) WebRTCManager.handleAnswer() does not guard against calling setRemoteDescription when signalingState is not 'have-local-offer', causing crashes during renegotiation races and glare conditions
test: Code trace of WebRTC state machine transitions and race condition analysis
expecting: Confirmed that handleAnswer at line 217 of WebRTCManager.ts lacks signalingState check
next_action: Document root cause and provide fix recommendations

## Symptoms

expected: Navigating to /floor-plan-test should either work without errors or the route should not exist
actual: Runtime InvalidStateError - Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': Failed to set remote answer sdp: Called in wrong state: stable
errors: InvalidStateError - setRemoteDescription called in wrong state: stable
reproduction: Navigate to /floor-plan-test from user menu
started: Unknown - appears to be a latent WebRTC bug exposed when AudioProvider/signaling initializes

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-18T00:01:00Z
  checked: Route existence at src/app/(dashboard)/floor-plan-test/page.tsx
  found: Route exists as a dev/test page with hardcoded company ID '760a1331-93b7-4073-8f48-43794168afcd'. Page title says "Avatar Components Demo" and "Floor Plan UI Test". Contains ModernFloorPlan component for comparing implementations.
  implication: This is a developer test page, not a production route.

- timestamp: 2026-03-18T00:02:00Z
  checked: User menu links at src/components/shell/enhanced-user-menu.tsx lines 151-162
  found: Two links to /floor-plan-test and /floor-plan-test/components exist in the user menu alongside real links like Profile and Settings
  implication: Dev-only test pages are exposed to all users via the user menu.

- timestamp: 2026-03-18T00:03:00Z
  checked: ModernFloorPlan dependency on AudioContext (line 79)
  found: ModernFloorPlan calls useAudio() which requires AudioProvider. The floor-plan-test page does NOT wrap in AudioProvider. However, the real floor-plan component (floor-plan.tsx line 289) wraps its children in AudioProvider.
  implication: The floor-plan-test page should crash with "useAudio must be used within an AudioProvider" before it even gets to WebRTC. The reported WebRTC error might occur on a different page or after the AudioProvider IS active.

- timestamp: 2026-03-18T00:04:00Z
  checked: WebRTCManager.handleAnswer() at line 212-219
  found: No signalingState check before calling setRemoteDescription. The method blindly calls peerConn.pc.setRemoteDescription(answer) without checking if pc.signalingState === 'have-local-offer'.
  implication: This is the direct cause of the InvalidStateError. An answer SDP can only be applied when signalingState is 'have-local-offer'. If the state is 'stable' (already connected, or peer was recreated), the call throws.

- timestamp: 2026-03-18T00:05:00Z
  checked: Race condition in handleOffer (renegotiation) + handleAnswer
  found: When handleOffer reuses existing connection (line 185-187), it sets remote description to an offer, creates an answer, and sends it. This transitions: stable -> have-remote-offer -> stable. Meanwhile, if this peer also sent an offer (from addLocalStreamToPeers or handleHandshake), there's a "glare" condition. Both peers send offers simultaneously. Peer A processes Peer B's offer (handleOffer), transitions to stable. Then Peer B's answer to Peer A's original offer arrives, but Peer A's connection is now in 'stable' state.
  implication: Classic WebRTC glare/race condition. The fix requires checking signalingState in handleAnswer and handling the glare case with polite/impolite peer logic or simply ignoring stale answers.

- timestamp: 2026-03-18T00:06:00Z
  checked: Additional renegotiation trigger in addLocalStreamToPeers (lines 92-122)
  found: When initializeLocalStream() is called and peers already exist, addLocalStreamToPeers sends new offers to all peers. If these offers cross with handshake-triggered offers, multiple offer/answer rounds overlap, increasing the chance of the 'stable' state error.
  implication: The renegotiation path doubles the glare risk.

## Resolution

root_cause: TWO ISSUES FOUND:

**Issue 1 (Route):** /floor-plan-test is a development/test page with a hardcoded company ID, linked from the production user menu (enhanced-user-menu.tsx lines 151-162). It should not be accessible to end users.

**Issue 2 (WebRTC bug):** WebRTCManager.handleAnswer() (src/lib/webrtc/WebRTCManager.ts line 212-219) does not check RTCPeerConnection.signalingState before calling setRemoteDescription with an answer SDP. When a WebRTC "glare" condition occurs (both peers send offers simultaneously), one peer's connection returns to 'stable' state before the stale answer arrives, causing: `InvalidStateError: Failed to set remote answer sdp: Called in wrong state: stable`.

The glare scenario:
1. Peer A sends offer to Peer B (A's state: have-local-offer)
2. Peer B simultaneously sends offer to Peer A (B's state: have-local-offer)
3. Peer A receives B's offer via handleOffer(), processes it, creates answer, returns to stable
4. Peer B's answer to A's original offer arrives
5. handleAnswer() calls setRemoteDescription(answer) on a connection in 'stable' state -> CRASH

fix:
verification:
files_changed: []
