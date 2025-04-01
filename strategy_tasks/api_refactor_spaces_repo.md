# Task: Refactor Space API Routes using Repository Pattern

**Date:** 3/31/2025

**Objective:** Modify the existing space management API routes (primarily `src/pages/api/spaces/`) to depend on the `ISpaceRepository` interface and use its methods for data access.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`ISpaceRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseSpaceRepository` is implemented).

**Target Files:**

*   `src/pages/api/spaces/get.ts` (Likely gets spaces by company ID)
*   *(Note: API routes for creating, updating, or deleting spaces might exist elsewhere, possibly integrated within floor plan management logic or other dashboard components. These will need to be identified and refactored separately if they perform direct DB operations instead of calling an API.)*

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import `ISpaceRepository` from `src/repositories/interfaces` and `SupabaseSpaceRepository` from `src/repositories/implementations/supabase`.
    *   **Instantiate:** Create an instance of the repository within the API handler:
        ```typescript
        import { ISpaceRepository } from '@/repositories/interfaces';
        import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`Space`, `Position`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify and replace direct database calls with method calls on the `spaceRepository` instance (e.g., `spaceRepository.findByCompany(companyId)`, `spaceRepository.create(spaceData)`).
    *   Use only methods defined in the `ISpaceRepository` interface.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods. Handle JSONB fields like `position` and `access_control` if necessary.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods.
    *   Return appropriate HTTP status codes (e.g., 200, 404, 500).

**Specific File Guidance:**

*   **`get.ts`:**
    *   Likely fetches spaces based on a `companyId` query parameter.
    *   Replace the DynamoDB query with `spaceRepository.findByCompany(companyId)`.
    *   Ensure the returned array of spaces is handled correctly.

*   **Other Potential Routes (Create/Update/Delete):**
    *   If separate API routes exist for these operations, apply the general refactoring steps.
    *   Use `spaceRepository.create(spaceData)`, `spaceRepository.update(spaceId, updates)`, `spaceRepository.deleteById(spaceId)`.
    *   If this logic is embedded in components, it should ideally be moved to dedicated API routes first, then refactored to use the repository.

**Testing:**

*   Test the `get.ts` endpoint thoroughly.
*   If other space-related API routes are identified and refactored, test them as well.
*   Verify:
    *   Correct space data is returned/created/updated/deleted.
    *   Appropriate HTTP status codes are returned.
    *   Authentication/authorization logic remains functional.
    *   The API route interacts only with the `ISpaceRepository` interface methods.

**Completion Criteria:**
*   The `src/pages/api/spaces/get.ts` route successfully uses methods from an instance of `ISpaceRepository`.
*   Any other identified space-related API routes are also refactored.
*   No direct database implementation details remain in the refactored API route logic.
*   Endpoints function correctly as verified by testing.