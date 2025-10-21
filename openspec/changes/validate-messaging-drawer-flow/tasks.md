## 1. Playwright Coverage
- [x] 1.1 Audit existing Playwright fixtures to support authenticated multi-user messaging sessions for `__tests__/api/playwright/messages-api.spec.ts`; document any missing seeding or teardown steps.
- [x] 1.2 Implement a unified drawer interaction test that signs in, opens the messaging drawer, and verifies DM vs room grouping, pinned ordering, and unread badge accuracy.
- [x] 1.3 Extend coverage to validate cross-room switching via floor-plan navigation, ensuring the drawer stays open and syncs the active conversation state.
- [x] 1.4 Add pinned + search filtering assertions, including deterministic data seeding for starred conversations, and record the expected outcomes in test documentation.
