# Research Findings: Playwright E2E — Messaging Drawer Interactions

**Date**: 2025-10-24  
**Context**: E2E testing for messaging drawer in Next.js app with Supabase realtime.

## Findings

### Playwright Best Practices for Realtime Features
- **Decision**: Use dual browser contexts with `page.waitForFunction` for realtime assertions, fallback to polling API checks within 3 seconds.
- **Rationale**: Ensures deterministic tests without flakes; handles Supabase realtime subscriptions reliably in E2E.
- **Alternatives considered**: WebSocket mocking (rejected: too complex, doesn't test real realtime); fixed delays (rejected: flaky and slow).

### Test Data Seeding
- **Decision**: Seed via API fixtures before tests, using existing repositories and server client.
- **Rationale**: CI-safe, mirrors production data setup; reuses existing auth and data access patterns.
- **Alternatives considered**: Direct DB inserts (rejected: bypasses RLS, not realistic); UI setup (rejected: slow and error-prone).

### Handling UI Interactions (Click-Stop Standard)
- **Decision**: Use data attributes for selectors, simulate real clicks, assert propagation prevention.
- **Rationale**: Validates actual user interactions including click-stop guards.
- **Alternatives considered**: Force clicks (rejected: doesn't test real behavior); CSS selectors (rejected: brittle).

### Performance and Determinism
- **Decision**: Bounded waits (max 3s), retry logic for flakes, clear error messages.
- **Rationale**: Meets spec constraints, provides actionable failures.
- **Alternatives considered**: Longer timeouts (rejected: slows CI); no retries (rejected: increases flakes).</content>
<parameter name="filePath">/home/giuice/apps/virtual-office/specs/001-drawer-e2e-tests/research.md