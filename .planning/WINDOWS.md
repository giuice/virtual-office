---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-07-24T21:44:38.892Z
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
  }
]
````
