## Why
Task 2.5 of the unified messaging system backlog requires Playwright coverage that exercises the unified drawer UX. The current Playwright script only issues direct API calls and does not validate the actual drawer interactions, leaving critical regressions undetected.

## What Changes
- Add Playwright coverage for unified messaging drawer interactions across direct messages and room conversations.
- Replace the placeholder API-only Playwright tests with scenario-driven UI workflows that cover grouping, pinning, filtering, and navigation.
- Capture fixture and data seeding requirements to keep cross-room switching assertions deterministic.

## Impact
- Affected specs: messaging-drawer-playwright
- Affected code: `__tests__/api/playwright/messages-api.spec.ts`, Playwright fixtures, messaging test data helpers
