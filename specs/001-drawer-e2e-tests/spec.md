# Feature Specification: Playwright E2E — Messaging Drawer Interactions

**Feature Branch**: `001-drawer-e2e-tests`  
**Created**: 2025-10-24  
**Status**: Draft  
**Input**: User description: "Playwright E2E tests for Messaging Drawer interactions: validate open/select DM/send/verify realtime delivery; filter by pinned; switch between room/DM tabs; navigate floor plan and ensure drawer persistence; archive/unarchive flows; all passing in CI/CD."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Open, Select DM, Send, Verify Delivery (Priority: P1)

As a QA engineer,
I want to open the messaging drawer, select a direct message, send a message, and verify delivery,
So that the core user flow is validated end-to-end.

**Why this priority**: This is the primary path for communication and must be reliable to consider the messaging experience viable.

**Independent Test**: Can be fully tested by opening the drawer, selecting a DM, sending a message, and asserting delivery and visibility without other stories.

**Acceptance Scenarios**:

1. Given a user is authenticated and has at least one DM conversation, When the user opens the drawer and selects that DM, Then sending a text message results in the new message appearing in the feed.
2. Given the recipient is online, When the message is sent, Then delivery is reflected in the UI and appears in the recipient feed in real time or within an acceptable delay window.

---

### User Story 2 - Filter by Pinned Conversations (Priority: P2)

As a QA engineer,
I want to filter conversations by pinned in the drawer,
So that users can quickly access important conversations.

**Why this priority**: Pinned filtering affects navigation and prioritization, improving user efficiency.

**Independent Test**: Can be tested by pinning one conversation and verifying the filter shows only pinned items.

**Acceptance Scenarios**:

1. Given at least one conversation is pinned, When the user enables the pinned filter, Then only pinned conversations are listed.
2. Given the pinned filter is enabled, When the user unpins the only pinned conversation, Then the list becomes empty and the UI reflects no results.

---

### User Story 3 - Switch Tabs and Persist Drawer on Navigation (Priority: P2)

As a QA engineer,
I want to switch between room and DM tabs and navigate the floor plan without closing the drawer,
So that the drawer remains a stable context for messaging.

**Why this priority**: Stability and state persistence prevent frustrating user interruptions.

**Independent Test**: Can be tested by toggling tabs and navigating to a different space while ensuring the drawer remains open and selected conversation persists.

**Acceptance Scenarios**:

1. Given the drawer is open, When the user switches between Room and DM tabs, Then correct lists load and the previously selected conversation remains selected where applicable.
2. Given the drawer is open with a selected conversation, When the user navigates to a different space via floor plan, Then the drawer remains open and the selected conversation remains active.

---

### User Story 4 - Archive and Unarchive Conversation (Priority: P3)

As a QA engineer,
I want to archive and unarchive a conversation from the drawer,
So that users can control the visibility of inactive threads.

**Why this priority**: Archiving affects conversation management and discoverability.

**Independent Test**: Can be tested by archiving a conversation from the list, verifying it moves to archived, and unarchiving it to restore visibility.

**Acceptance Scenarios**:

1. Given an active conversation, When the user archives it from the drawer, Then it disappears from the active list and appears in the archived section.
2. Given a conversation is archived, When the user unarchives it, Then it reappears in the appropriate list and is selectable.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- No existing conversations: Drawer opens, empty state renders with clear call to action; tests skip flows requiring existing threads.
- Realtime delay or temporary disconnect: Delivery verification allows a bounded wait window before falling back or failing deterministically.
- Mixed state (pinned + archived): Pinned filter should not surface archived conversations unless specifically viewing archived.
- Permission mismatch: Attempting to open a restricted room conversation surfaces an appropriate error state.
- Drawer persistence across route reload: Refresh does not unexpectedly close the drawer during test flows.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: Feature MUST validate core drawer flow: open → select DM → send message → confirm visible delivery.
- **FR-002**: Feature MUST allow filtering conversations by pinned and display only pinned when enabled.
- **FR-003**: Feature MUST support switching between Room and DM tabs without losing selected context.
- **FR-004**: Feature MUST keep the drawer open and preserve selection across floor plan navigation.
- **FR-005**: Feature MUST allow archiving and unarchiving conversations with visible state transitions.
 - **FR-006**: Tests MUST be deterministic under CI with bounded waits for realtime updates (maximum 3 seconds) and clear failure messages.
 - **FR-007**: Test environment MUST seed data via API fixtures prior to test execution to ensure at least one DM conversation and two test users are available (CI-safe fixtures).
 - **FR-008**: Authentication in tests MUST use seeded test user credentials via the login UI flow to mirror real user behavior.
 - **FR-009**: Realtime verification MUST allow up to 3 seconds for live updates before falling back to a polling assertion (API fetch) within the same threshold.

### Key Entities *(include if feature involves data)*

- **User Session**: Represents an authenticated user context for E2E runs.
- **Conversation**: Represents a DM or room thread that can be selected, pinned, archived.
- **Message**: Represents a text payload associated with a conversation, subject to delivery and read semantics.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: E2E suite validates 5 flows (send, pinned filter, tab switch, navigation persistence, archive/unarchive) with 100% pass rate on main.
- **SC-002**: E2E suite is deterministic: no flake rate >2% over 10 CI runs.
- **SC-003**: End-to-end run time under 3 minutes on CI standard runners for this feature suite.
- **SC-004**: Failures produce actionable diagnostics: clear error messages and captured artifacts (screenshots/video/logs) for each failed assertion.
