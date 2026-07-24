---
schema_version: 1
open_count: 8
waived_count: 0
fixed_count: 0
total_count: 8
last_updated: 2026-07-24T22:31:18.711Z
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
  }
]
````
