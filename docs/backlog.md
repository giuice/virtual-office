# Engineering Backlog

This backlog collects cross-cutting or future action items that emerge from reviews and planning.

Routing guidance:

- Use this file for non-urgent optimizations, refactors, or follow-ups that span multiple stories/epics.
- Must-fix items to ship a story belong in that story’s `Tasks / Subtasks`.
- Same-epic improvements may also be captured under the epic Tech Spec `Post-Review Follow-ups` section.

| Date | Story | Epic | Type | Severity | Owner | Status | Notes |
| ---- | ----- | ---- | ---- | -------- | ----- | ------ | ----- |
| 2025-10-29 | N/A | 4A/4B | Decision | N/A | Giuliano | Closed | All automated testing (Playwright E2E) eliminated from project scope. Technical assessment: Playwright incompatible with Supabase Realtime complexity - infinite development cycle. Manual testing approach adopted for all Epic 4A/4B stories. Original Story 4A.1 removed, Story 4B.8 eliminated (not deferred). |
| 2025-11-25 | N/A | 3 | Tech Debt | Medium | TBD | Open | **Theme System Component Migration**: ~50+ hardcoded Tailwind color classes (bg-green-500, bg-blue-100, text-red-500, etc.) bypass the new theme system (Story 3.1). These only respond to dark: modifier, not data-theme attributes. Affected areas: QuickLinksGrid (dashboard cards), UserAvatarPresence (status indicators), designTokens.ts (floor plan), messaging components, shell/header components, error states. Should be addressed before investor demos for visual consistency across all 4 themes. Recommend creating Story 3.15 or extending Story 3.2 scope. |
| 2025-11-26 | 3.11 | 3 | Feature | Low | TBD | Open | **Space Agenda Management UI**: Story 3.11 created the `space_agendas` table and API endpoint for fetching agenda phase data (AC3). Missing: Admin UI to create/update meeting agendas for spaces. Migration file: `migrations/20251126_create_space_agendas.sql`. Recommend creating Story 3.16 "Space Agenda Management" to complete the feature. |
