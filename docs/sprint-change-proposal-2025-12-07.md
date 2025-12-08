# Sprint Change Proposal: Audio MVP (Epic 8A)
**Date:** 2025-12-07
**Trigger:** Urgent Investor Request ("Sococo-style" Audio)

## 1. Issue Summary
Investors require immediate implementation of "always-on" audio in rooms (similar to Sococo) to validate the core "virtual office" value proposition. Current roadmap had deferred all audio/video to Phase 4.

## 2. Impact Analysis
- **PRD:** Scope expanded. Audio moved from "Out of Scope" to "MVP".
- **Epic 8 (Communications):** Split into:
    - **Epic 8A (Urgent):** Audio-only, P2P Mesh architecture.
    - **Epic 8B (Deployed):** Video, Screen Share, SFU architecture.
- **Architecture:** Validated P2P Mesh as viable for MVP (<8 users/room). Requires no new infrastructure cost (uses Supabase Realtime).
- **Sprint Impact:** 
    - **STOP:** Epic 4B (Messaging Resilience) - Lower priority.
    - **START:** Epic 8A (Audio MVP) - Immediate priority.

## 3. Recommended Approach: Direct Adjustment (MVP)
We proceed with a minimal P2P Audio implementation. This satisfies the "User can talk" requirement without the complexity of Video or SFU servers.
- **Effort:** ~3-5 Days (Medium).
- **Risk:** Mesh topology bandwidth limits (mitigated by UI warnings).

## 4. Implementation Plan
1. **Stories:** Created `story-8a-audio-mvp.md` covering Signaling, Audio Streams, VAD, and Mic Controls.
2. **Handoff:** Ready for Developer Agent immediately.

## 5. Artifact Updates Completed
- [x] `docs/prd.md`: Updated scope.
- [x] `docs/epics.md`: Defined Epic 8A.
- [x] `docs/architecture.md`: Added Audio Architecture section.
- [x] `docs/sprint-artifacts/story-8a-audio-mvp.md`: Created.

## 6. Approval
**Status:** [PENDING USER FINAL CONFIRMATION]
