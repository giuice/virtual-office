# Active Context
```guidance
**Date:** 3/31/2025
**Last Updated:** 3/31/2025, 10:12 PM (UTC-3:00)

**Purpose:** This file provides a concise overview of the current work focus, immediate next steps, and active decisions for the project.

**Use Guidelines:**
- **Current Work Focus:** List the 2-3 *most critical* tasks currently being actively worked on.
- **Next Steps:** List the immediate next steps required to advance the project.
- **Active Decisions and Considerations:** Document key decisions currently being considered.
- **Do NOT include:** Detailed task breakdowns, historical changes, long-term plans.
- **Maintain Brevity:** Keep this file concise and focused on the *current* state.
```
## Current Work Focus:
- **Execute Supabase Migration (Phase 2: API Refactoring):** Refactoring existing API routes to use the new Supabase repository interfaces.
    - User routes: Complete.
    - Company routes (`create`, `get`, `update`): Complete.
    - Company route (`cleanup`): Blocked - Requires `ICompanyRepository.findByUserId`.

## Next Steps:

1.  **(Blocked Task):** Update `ICompanyRepository` interface and `SupabaseCompanyRepository` implementation to include a `findByUserId` method.
2.  **(Blocked Task):** Refactor `src/pages/api/companies/cleanup.ts` using the updated repository.
3.  **Load Space API Refactor Instructions:** Read and begin executing `strategy_tasks/api_refactor_spaces_repo.md`.
3.  **Refactor Space API Routes:** Proceed with refactoring space routes using `ISpaceRepository` as per `strategy_tasks/api_refactor_spaces_repo.md`.
4.  **(Prerequisite Check):** Ensure Supabase project is created and schema applied.

## Active Decisions and Considerations:

- **Data Migration:** Confirmed decision: No data migration needed; start fresh.
- **Repository Pattern:** Adopted for data access abstraction. Interfaces and Supabase implementations complete.
- **Real-time:** Plan is to use Supabase Realtime Subscriptions/Presence/Broadcast (to be implemented after API refactoring).
- **Dependency Injection:** Currently planning manual instantiation of repositories in API routes; consider a more formal DI approach later if complexity increases.
