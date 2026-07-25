---
schema_version: 1
open_count: 13
waived_count: 0
fixed_count: 8
total_count: 21
last_updated: 2026-07-25T22:13:35.048Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | deviation | .planning/phases/03-video-and-screen-sharing/03-02-PLAN.md | 75 | read_first concurrency.test.ts was stale; used the live concurrency/normative-races.test.ts and support.ts analogs | open |  | 2026-07-24T21:44:37.982Z |  |
| 2 | 03 | deviation | .planning/phases/03-video-and-screen-sharing/03-02-PLAN.md | 118 | read_first topic.ts was stale; used the live useAudioSignaling.ts canonical media-topic implementation | open |  | 2026-07-24T21:44:38.379Z |  |
| 3 | 03 | deviation | __tests__/presence-db/screen-share-realtime-policy.test.ts |  | Task 2 RED passed immediately because immutable migrations already implemented the contract; no artificial failure was introduced | open |  | 2026-07-24T21:44:38.892Z |  |
| 4 | 03 | unrun-verify | .planning/phases/03-video-and-screen-sharing/03-03-SUMMARY.md |  | Mandatory presence-safety-reviewer could not spawn because the two-agent thread limit was occupied; local Presence checklist completed and parent must schedule formal review | open |  | 2026-07-24T22:07:38.833Z |  |
| 5 | 03 | lint-warning | .claude/gsd-core/bin/gsd-tools.cjs | 231 | Repository-wide lint remains blocked by 3230 pre-existing vendored rule-resolution errors and unrelated legacy warnings; focused plan lint passes | open |  | 2026-07-24T22:07:39.389Z |  |
| 6 | 03 | deviation | src/hooks/realtime/useAudioSignaling.ts |  | Local Presence review added an exact owned-channel fence for mute metadata across simultaneous identity scope swaps | open |  | 2026-07-24T22:07:39.760Z |  |
| 7 | 03 | deviation | src/lib/webrtc/WebRTCManager.ts |  | Presence Safety blocker fixed: retain generation-matched winning-answer ICE received before the answer while excluding ignored colliding-offer ICE | open |  | 2026-07-24T22:21:50.012Z |  |
| 8 | 03 | deviation | src/lib/webrtc/WebRTCManager.ts |  | Presence Safety interoperability risk fixed: quarantine omitted/null-generation glare ICE and suppress only explicit ICE-generation mismatch errors | open |  | 2026-07-24T22:31:18.711Z |  |
| 9 | 03 | deviation | src/lib/webrtc/WebRTCManager.ts |  | Presence Safety blocker fixed: drain every eligible queued ICE candidate exactly once before surfacing ordered errors | open |  | 2026-07-24T22:38:16.280Z |  |
| 10 | 03 | deviation | src/app/api/spaces/[id]/screen-share/claim/route.ts |  | Formal Presence risk fixed: exact legacy CLAIMED envelopes receive bounded observed-release compensation before terminal 426; migration 20260723224547 remains database-first required | fixed |  | 2026-07-25T12:38:47.614Z | 2026-07-25T12:38:52.224Z |
| 11 | 03 | deviation | __tests__/screen-share-tracer.test.tsx |  | Post-merge regression fixed: PRESENTER_BUSY tracer fixture now matches strict public retryability contract and preserves exact losing-track cleanup plus zero manager publication | fixed |  | 2026-07-25T12:52:28.907Z | 2026-07-25T12:52:35.991Z |
| 12 | 03 | deviation | src/app/api/spaces/[id]/screen-share/claim/route.ts |  | Resolved: aborted committed claims require server-side compensation under the original verified auth identity. | fixed |  | 2026-07-25T16:46:15.165Z | 2026-07-25T16:46:34.239Z |
| 13 | 03 | deviation | src/contexts/AudioContext.tsx |  | Resolved: screen-share renewal cadence must not depend on the browser clock. | fixed |  | 2026-07-25T16:46:15.642Z | 2026-07-25T16:46:34.781Z |
| 14 | 03 | deviation | __tests__/screen-share-tracer.test.tsx |  | Resolved: fixed claim expiry fixtures became stale relative to test execution. | fixed |  | 2026-07-25T16:46:16.047Z | 2026-07-25T16:46:35.176Z |
| 15 | 03 | deviation | src/contexts/AudioContext.tsx |  | Exposed the existing scoped application user identity so duplicate owner controls agree | fixed |  | 2026-07-25T21:20:02.235Z | 2026-07-25T21:21:15.188Z |
| 16 | 03 | deviation | src/components/floor-plan/SpaceAudioControls.tsx |  | Hardened the M shortcut for non-HTMLElement event targets | fixed |  | 2026-07-25T21:20:02.825Z | 2026-07-25T21:21:15.653Z |
| 17 | 03 | deviation | src/components/floor-plan/FloorPlanPresentationStage.tsx |  | Kept mismatched display candidates in connecting state while refusing attachment | fixed |  | 2026-07-25T21:20:03.516Z | 2026-07-25T21:21:16.050Z |
| 18 | 03 | deviation | __tests__/api/playwright/screen-sharing.spec.ts |  | Plan referenced stale monolithic Presence helper paths; execution reused the live split helper layout. | open |  | 2026-07-25T22:13:09.992Z |  |
| 19 | 03 | deviation | src/contexts/AudioContext.tsx |  | Browser smoke exposed stale remote presenter state after release; targeted invalidation now triggers an authoritative active-route reread. | open |  | 2026-07-25T22:13:14.841Z |  |
| 20 | 03 | deviation | playwright.config.ts |  | Default reused development server targeted the incompatible online project; the screen-sharing project now starts a fresh loopback-only local-fixture server. | open |  | 2026-07-25T22:13:22.669Z |  |
| 21 | 03 | unrun-verify | src/hooks/realtime/useAudioSignaling.ts |  | Mandatory presence-safety-reviewer could not spawn because the two-agent thread limit was occupied; local gates passed and parent must schedule the formal read-only review. | open |  | 2026-07-25T22:13:35.048Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "03",
    "file": ".planning/phases/03-video-and-screen-sharing/03-02-PLAN.md",
    "line": 75,
    "description": "read_first concurrency.test.ts was stale; used the live concurrency/normative-races.test.ts and support.ts analogs",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T21:44:37.982Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "03",
    "file": ".planning/phases/03-video-and-screen-sharing/03-02-PLAN.md",
    "line": 118,
    "description": "read_first topic.ts was stale; used the live useAudioSignaling.ts canonical media-topic implementation",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T21:44:38.379Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "03",
    "file": "__tests__/presence-db/screen-share-realtime-policy.test.ts",
    "line": null,
    "description": "Task 2 RED passed immediately because immutable migrations already implemented the contract; no artificial failure was introduced",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T21:44:38.892Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "03",
    "file": ".planning/phases/03-video-and-screen-sharing/03-03-SUMMARY.md",
    "line": null,
    "description": "Mandatory presence-safety-reviewer could not spawn because the two-agent thread limit was occupied; local Presence checklist completed and parent must schedule formal review",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:07:38.833Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "lint-warning",
    "phase": "03",
    "file": ".claude/gsd-core/bin/gsd-tools.cjs",
    "line": 231,
    "description": "Repository-wide lint remains blocked by 3230 pre-existing vendored rule-resolution errors and unrelated legacy warnings; focused plan lint passes",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:07:39.389Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "03",
    "file": "src/hooks/realtime/useAudioSignaling.ts",
    "line": null,
    "description": "Local Presence review added an exact owned-channel fence for mute metadata across simultaneous identity scope swaps",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:07:39.760Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "03",
    "file": "src/lib/webrtc/WebRTCManager.ts",
    "line": null,
    "description": "Presence Safety blocker fixed: retain generation-matched winning-answer ICE received before the answer while excluding ignored colliding-offer ICE",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:21:50.012Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "03",
    "file": "src/lib/webrtc/WebRTCManager.ts",
    "line": null,
    "description": "Presence Safety interoperability risk fixed: quarantine omitted/null-generation glare ICE and suppress only explicit ICE-generation mismatch errors",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:31:18.711Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "03",
    "file": "src/lib/webrtc/WebRTCManager.ts",
    "line": null,
    "description": "Presence Safety blocker fixed: drain every eligible queued ICE candidate exactly once before surfacing ordered errors",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T22:38:16.280Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "03",
    "file": "src/app/api/spaces/[id]/screen-share/claim/route.ts",
    "line": null,
    "description": "Formal Presence risk fixed: exact legacy CLAIMED envelopes receive bounded observed-release compensation before terminal 426; migration 20260723224547 remains database-first required",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T12:38:47.614Z",
    "resolved_at": "2026-07-25T12:38:52.224Z"
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "03",
    "file": "__tests__/screen-share-tracer.test.tsx",
    "line": null,
    "description": "Post-merge regression fixed: PRESENTER_BUSY tracer fixture now matches strict public retryability contract and preserves exact losing-track cleanup plus zero manager publication",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T12:52:28.907Z",
    "resolved_at": "2026-07-25T12:52:35.991Z"
  },
  {
    "id": 12,
    "kind": "deviation",
    "phase": "03",
    "file": "src/app/api/spaces/[id]/screen-share/claim/route.ts",
    "line": null,
    "description": "Resolved: aborted committed claims require server-side compensation under the original verified auth identity.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T16:46:15.165Z",
    "resolved_at": "2026-07-25T16:46:34.239Z"
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "03",
    "file": "src/contexts/AudioContext.tsx",
    "line": null,
    "description": "Resolved: screen-share renewal cadence must not depend on the browser clock.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T16:46:15.642Z",
    "resolved_at": "2026-07-25T16:46:34.781Z"
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "03",
    "file": "__tests__/screen-share-tracer.test.tsx",
    "line": null,
    "description": "Resolved: fixed claim expiry fixtures became stale relative to test execution.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T16:46:16.047Z",
    "resolved_at": "2026-07-25T16:46:35.176Z"
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "03",
    "file": "src/contexts/AudioContext.tsx",
    "line": null,
    "description": "Exposed the existing scoped application user identity so duplicate owner controls agree",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T21:20:02.235Z",
    "resolved_at": "2026-07-25T21:21:15.188Z"
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "03",
    "file": "src/components/floor-plan/SpaceAudioControls.tsx",
    "line": null,
    "description": "Hardened the M shortcut for non-HTMLElement event targets",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T21:20:02.825Z",
    "resolved_at": "2026-07-25T21:21:15.653Z"
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "03",
    "file": "src/components/floor-plan/FloorPlanPresentationStage.tsx",
    "line": null,
    "description": "Kept mismatched display candidates in connecting state while refusing attachment",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-07-25T21:20:03.516Z",
    "resolved_at": "2026-07-25T21:21:16.050Z"
  },
  {
    "id": 18,
    "kind": "deviation",
    "phase": "03",
    "file": "__tests__/api/playwright/screen-sharing.spec.ts",
    "line": null,
    "description": "Plan referenced stale monolithic Presence helper paths; execution reused the live split helper layout.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-25T22:13:09.992Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "deviation",
    "phase": "03",
    "file": "src/contexts/AudioContext.tsx",
    "line": null,
    "description": "Browser smoke exposed stale remote presenter state after release; targeted invalidation now triggers an authoritative active-route reread.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-25T22:13:14.841Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "03",
    "file": "playwright.config.ts",
    "line": null,
    "description": "Default reused development server targeted the incompatible online project; the screen-sharing project now starts a fresh loopback-only local-fixture server.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-25T22:13:22.669Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "src/hooks/realtime/useAudioSignaling.ts",
    "line": null,
    "description": "Mandatory presence-safety-reviewer could not spawn because the two-agent thread limit was occupied; local gates passed and parent must schedule the formal read-only review.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-25T22:13:35.048Z",
    "resolved_at": null
  }
]
````
