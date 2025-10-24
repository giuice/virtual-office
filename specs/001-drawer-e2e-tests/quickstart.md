# Quickstart: Playwright E2E — Messaging Drawer Interactions

**Date**: 2025-10-24  
**Purpose**: Guide to run the E2E tests.

## Prerequisites
- Node.js, npm
- Supabase project running
- Test users seeded

## Setup
1. Install dependencies: `npm install`
2. Seed test data: Run fixtures from `__tests__/e2e/fixtures/`
3. Configure Playwright: `npx playwright install`

## Run Tests
- All tests: `npx playwright test __tests__/e2e/messaging-drawer-interactions.spec.ts`
- Headed mode: Add `--headed`
- Debug: `npx playwright test --debug`

## CI
- Runs automatically on push to main
- Timeout: 3 minutes
- Artifacts: screenshots/videos on failure</content>
<parameter name="filePath">/home/giuice/apps/virtual-office/specs/001-drawer-e2e-tests/quickstart.md