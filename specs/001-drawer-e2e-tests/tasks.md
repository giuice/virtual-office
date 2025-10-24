# Tasks: Playwright E2E — Messaging Drawer Interactions

**Feature Branch**: `001-drawer-e2e-tests`  
**Generated**: 2025-10-24  
**Input**: Feature specification from `/specs/001-drawer-e2e-tests/spec.md`  
**Tech Stack**: TypeScript 5, Next.js 15.3.0, React 19.1.0, Supabase (@supabase/ssr v0.6.1), Playwright, Vitest 3, Testing Library  
**Project Structure**: E2E tests in `__tests__/e2e/messaging-drawer-interactions.spec.ts`, fixtures in `__tests__/e2e/fixtures/`  

## Implementation Strategy

MVP Scope: User Story 1 (core send/receive flow) - delivers basic E2E validation of messaging drawer.  
Incremental Delivery: Add one user story at a time, each independently testable.  
Parallel Opportunities: User stories 2-4 can be implemented in parallel after foundational setup.  
Dependency Graph: US1 → (US2, US3, US4 parallel) → Polish.  

## Phase 1: Setup Tasks

- [X] T001 Create test data seeding fixtures in `__tests__/e2e/fixtures/seed-test-data.ts`  
- [X] T002 Setup test user credentials and API login helpers in `__tests__/e2e/fixtures/test-users.ts`  

## Phase 2: Foundational Tasks

- [X] T003 Update `playwright.config.ts` for E2E test configuration if needed  
- [X] T004 Create base test utilities for realtime assertions in `__tests__/e2e/utils/realtime-helpers.ts`  

## Phase 3: User Story 1 - Open, Select DM, Send, Verify Delivery (Priority: P1)

**Story Goal**: Validate core drawer flow: open → select DM → send message → confirm visible delivery.  
**Independent Test Criteria**: Can be fully tested by opening the drawer, selecting a DM, sending a message, and asserting delivery and visibility without other stories.  

- [X] T005 [US1] Implement test for sender opening drawer, selecting DM, sending message in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  
- [X] T006 [US1] Implement test for recipient receiving message in realtime in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  

## Phase 4: User Story 2 - Filter by Pinned Conversations (Priority: P2)

**Story Goal**: Allow filtering conversations by pinned in the drawer.  
**Independent Test Criteria**: Can be tested by pinning one conversation and verifying the filter shows only pinned items.  

- [X] T007 [P] [US2] Implement test for enabling pinned filter and verifying only pinned conversations shown in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  
- [X] T008 [P] [US2] Implement test for unpinning and verifying empty list in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  

## Phase 5: User Story 3 - Switch Tabs and Persist Drawer on Navigation (Priority: P2)

**Story Goal**: Support switching between room and DM tabs without losing selected context, and persist drawer on floor plan navigation.  
**Independent Test Criteria**: Can be tested by toggling tabs and navigating to a different space while ensuring the drawer remains open and selected conversation persists.  

- [X] T009 [P] [US3] Implement test for switching tabs and restoring last selection in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  
- [X] T010 [P] [US3] Implement test for navigating floor plan with drawer persistence in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  

## Phase 6: User Story 4 - Archive and Unarchive Conversation (Priority: P3)

**Story Goal**: Allow archiving and unarchiving conversations with visible state transitions.  
**Independent Test Criteria**: Can be tested by archiving a conversation from the list, verifying it moves to archived, and unarchiving it to restore visibility.  

- [X] T011 [P] [US4] Implement test for archiving conversation and verifying hidden from active list in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  
- [X] T012 [P] [US4] Implement test for unarchiving and restoring visibility in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T013 Run full E2E suite locally and fix any flakes in `__tests__/e2e/messaging-drawer-interactions.spec.ts`  
- [X] T014 Integrate tests with CI pipeline and ensure artifacts on failure  
- [X] T015 Update `README.md` or docs with E2E test instructions  

## Dependencies

- T001, T002 must complete before T003-T004.  
- T003-T004 must complete before all US tasks.  
- US1 (T005-T006) can start immediately after foundational.  
- US2-US4 (T007-T012) can run in parallel after foundational, but depend on shared test file.  
- Polish (T013-T015) after all US tasks.  

## Parallel Execution Examples

- After Phase 2: Run T005-T006 (US1) on one machine, T007-T008 (US2) on another.  
- US3 and US4 similarly parallel.  
- Shared file requires sequential writes but tests can run independently.</content>
<parameter name="filePath">/home/giuice/apps/virtual-office/specs/001-drawer-e2e-tests/tasks.md