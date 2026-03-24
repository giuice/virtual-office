---
status: diagnosed
trigger: "Bug 1: default space dropdown shows only one space. Bug 2: save throws Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON."
created: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:00:00Z
---

## Current Focus

hypothesis: confirmed for both bugs
test: code trace complete
expecting: n/a — diagnosis delivered
next_action: deliver structured findings to user

## Symptoms

expected: All company spaces appear in the dropdown; save completes without error
actual: Bug 1 — only one space shown in dropdown. Bug 2 — fetch throws JSON parse error because the server returned an HTML page instead of JSON.
errors: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
reproduction: Open company settings admin > Spaces tab > observe dropdown; click Save Changes
started: unknown

## Eliminated

- hypothesis: Space repository query is wrong (wrong column, wrong filter)
  evidence: SupabaseSpaceRepository.findByCompany queries .eq('company_id', companyId) with no status filter; returns all spaces. The API route /api/spaces returns all of them too.
  timestamp: 2026-03-19

- hypothesis: The /api/spaces route is broken or missing
  evidence: /api/spaces/route.ts exists as a valid App Router handler and calls spaceRepository.findByCompany correctly.
  timestamp: 2026-03-19

## Evidence

- timestamp: 2026-03-19
  checked: src/components/dashboard/company-settings.tsx lines 49-52
  found: activeSpaces = spaces.filter(s => s.status === 'active')
  implication: Only spaces with status exactly equal to 'active' are shown. The DB enum for space_status is ['active','available','maintenance','locked','reserved','in_use']. Any space whose status is anything other than 'active' is excluded from the dropdown entirely.

- timestamp: 2026-03-19
  checked: migrations/database-structure.md — spaces table
  found: space_status enum values: active, available, maintenance, locked, reserved, in_use
  implication: Most usable spaces likely have status 'available' or 'in_use', not 'active'. If only one space was created with status 'active', only that one appears.

- timestamp: 2026-03-19
  checked: src/lib/api.ts updateCompany function (line 174-192)
  found: Makes a PATCH request to /api/companies/update?id={companyId}
  implication: This URL is the critical path for the save operation. The target file must be resolvable by Next.js App Router as an API route.

- timestamp: 2026-03-19
  checked: src/app/api/companies/ directory listing
  found: Files are: cleanup.ts, create/route.ts, get/route.ts, update.ts
  implication: update.ts is a plain TypeScript file at the path src/app/api/companies/update.ts. It is NOT a route.ts segment file. Next.js App Router only serves files named route.ts (or route.js). A file named update.ts in src/app/api/companies/ is not recognized as a route handler — it is simply ignored by the framework.

- timestamp: 2026-03-19
  checked: src/app/api/companies/update.ts header comment and exports
  found: Comment says "// src/pages/api/companies/update.ts". Exports `export default async function handler(req: NextApiRequest, res: NextApiResponse)` — the Pages Router handler signature.
  implication: This file was written for the Pages Router (pages/api/) but placed inside src/app/api/. The App Router does not process it. When the client fetches /api/companies/update?id=..., Next.js finds no route handler at that path and returns the default Next.js 404 HTML error page. The client then tries to JSON.parse that HTML, producing the "Unexpected token '<'" error.

- timestamp: 2026-03-19
  checked: src/contexts/CompanyContext.tsx updateCompanyDetails lines 275-280
  found: settings merge: data.settings ? { ...company.settings, ...data.settings } : data.settings
  implication: When data.settings is undefined (e.g. saving only the company name), the ternary resolves to undefined, so mergedData.settings = undefined. This would send undefined as the settings field to updateCompany, potentially wiping settings in the DB on a name-only save. This is a secondary data-hazard bug not in the original report but present in the same code path.

## Resolution

root_cause: |
  BUG 1 — Overly restrictive status filter:
  In company-settings.tsx (line 50), activeSpaces is computed as
  spaces.filter(s => s.status === 'active'). The database space_status enum
  has six values: active, available, maintenance, locked, reserved, in_use.
  If company spaces were created with status 'available' (or any other non-'active'
  value), they are filtered out. Only spaces whose status column is exactly 'active'
  appear in the dropdown. This is not a data-fetching bug — the API and repository
  return all spaces — it is a client-side filter that is too narrow.

  BUG 2 — Pages Router handler file in App Router directory, wrong filename:
  src/app/api/companies/update.ts uses the Pages Router export format
  (export default function handler(req, res)) and is located in the App Router
  directory tree. The App Router only serves files named route.ts as API route
  handlers. Because the file is named update.ts (not route.ts), Next.js ignores
  it entirely. A GET/PATCH to /api/companies/update returns the Next.js 404 HTML
  page. The client's updateCompany() in api.ts then tries to JSON.parse that HTML
  body, producing "Unexpected token '<', <!DOCTYPE..."

fix: empty — diagnosis only, no fix applied
verification: empty
files_changed: []
