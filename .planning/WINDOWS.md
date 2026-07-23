---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-07-23T16:47:46.656Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | unrun-verify | src/app/api/spaces/[spaceId]/screen-share/claim/route.ts |  | npm run build could not complete because unrelated debug prerender lacks Supabase URL/API key environment values | open |  | 2026-07-23T16:47:46.656Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "src/app/api/spaces/[spaceId]/screen-share/claim/route.ts",
    "line": null,
    "description": "npm run build could not complete because unrelated debug prerender lacks Supabase URL/API key environment values",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T16:47:46.656Z",
    "resolved_at": null
  }
]
````
