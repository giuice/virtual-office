## ADDED Requirements
### Requirement: Messaging Drawer End-to-End Coverage
The system MUST exercise the unified messaging drawer via Playwright tests to verify conversation grouping, pinning, filtering, and cross-room navigation behaviours.

#### Scenario: Drawer groups direct messages and rooms
- **GIVEN** seeded direct-message and room conversations with distinct unread and pin states
- **WHEN** the Playwright test signs in and opens the unified messaging drawer
- **THEN** the drawer SHALL render grouped sections by conversation type with pinned conversations ordered ahead of others within each group.

#### Scenario: Drawer switching maintains context
- **GIVEN** an active conversation displayed in the drawer
- **WHEN** the Playwright test navigates between room conversations via the floor plan
- **THEN** the drawer SHALL remain open, update the active conversation, and preserve unread counts for previously active threads.

#### Scenario: Filtering surfaces pinned and searched conversations
- **GIVEN** pinned conversations and searchable participants
- **WHEN** the Playwright test applies the pinned filter and executes a participant search
- **THEN** only matching conversations SHALL appear and selecting a result SHALL focus the conversation without closing the drawer.
