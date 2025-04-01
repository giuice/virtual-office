# Task: Refactor Company API Routes using Repository Pattern

**Date:** 3/31/2025

**Objective:** Modify the existing company management API routes (`src/pages/api/companies/`) to depend on the `ICompanyRepository` interface and use its methods for data access.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`ICompanyRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseCompanyRepository` is implemented).

**Target Files:**

*   `src/pages/api/companies/create.ts`
*   `src/pages/api/companies/get.ts` (Verify logic: Get by ID or user association?)
*   `src/pages/api/companies/update.ts`
*   `src/pages/api/companies/cleanup.ts` (Verify logic: Delete or other action?)

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import `ICompanyRepository` from `src/repositories/interfaces` and `SupabaseCompanyRepository` from `src/repositories/implementations/supabase`.
    *   **Instantiate:** Create an instance of the repository within the API handler:
        ```typescript
        import { ICompanyRepository } from '@/repositories/interfaces';
        import { SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`Company`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify and replace direct database calls with method calls on the `companyRepository` instance (e.g., `companyRepository.findById(id)`, `companyRepository.create(companyData)`).
    *   Use only methods defined in the `ICompanyRepository` interface.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods, which should match the interface contract.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods.
    *   Return appropriate HTTP status codes based on the outcome (e.g., 200, 201, 404, 500).

**Specific File Guidance:**

*   **`create.ts`:** Use `companyRepository.create(companyData)`. Ensure creating user's ID is added to `admin_ids`.
*   **`get.ts`:**
    *   If getting by ID: Use `companyRepository.findById(id)`. Handle `null` for 404.
    *   If getting by user association: This might require a method like `companyRepository.findByUserId(userId)` (which may need to be added to the interface/implementation, potentially involving a join or lookup via the `users` table/repository).
*   **`update.ts`:** Use `companyRepository.update(companyId, updates)`. Handle updates to `settings` and `admin_ids` correctly.
*   **`cleanup.ts`:**
    *   If deleting: Use `companyRepository.deleteById(id)`. Consider cascade effects.
    *   If archiving or other logic: Use `companyRepository.update(...)` with appropriate status fields.

**Testing:**

*   Test each endpoint thoroughly using Postman or `curl`.
*   Verify:
    *   Correct data operations occur.
    *   Appropriate HTTP status codes are returned.
    *   Authentication/authorization logic remains functional.
    *   The API route interacts only with the `ICompanyRepository` interface methods.

**Completion Criteria:**
*   All listed company API routes successfully use methods from an instance of `ICompanyRepository`.
*   No direct database implementation details remain in the API route logic.
*   Endpoints function correctly as verified by testing.