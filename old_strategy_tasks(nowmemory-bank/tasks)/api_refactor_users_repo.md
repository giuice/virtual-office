# Task: Refactor User API Routes using Repository Pattern

**Date:** 3/31/2025

**Objective:** Modify the existing user management API routes (`src/pages/api/users/`) to depend on the `IUserRepository` interface and use its methods for data access, removing direct dependencies on specific database implementations.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`IUserRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseUserRepository` is implemented).

**Target Files:**

*   `src/pages/api/users/by-company.ts`
*   `src/pages/api/users/create.ts`
*   `src/pages/api/users/get-by-firebase-id.ts`
*   `src/pages/api/users/remove-from-company.ts`
*   `src/pages/api/users/update.ts`
*   `src/pages/api/users/[id]/index.ts` (GET by ID, DELETE)
*   `src/pages/api/users/[id]/status.ts`

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import the `IUserRepository` interface from `src/repositories/interfaces` and the concrete `SupabaseUserRepository` implementation from `src/repositories/implementations/supabase`.
    *   **Instantiate:** Inside the API handler function (or at the module level if appropriate), create an instance of the repository:
        ```typescript
        import { IUserRepository } from '@/repositories/interfaces';
        import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const userRepository: IUserRepository = new SupabaseUserRepository();
        ```
    *   *(Note: For more complex applications, a proper Dependency Injection container could be used, but manual instantiation is sufficient for Next.js API routes initially).*

2.  **Update Imports:**
    *   Remove any remaining imports related to `src/lib/dynamo` or direct Supabase client usage within the route logic.
    *   Ensure necessary types (`User`, `UserRole`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify all direct database calls (old DynamoDB functions or direct Supabase client calls).
    *   Replace these calls with method calls on the `userRepository` instance (e.g., `userRepository.findById(id)`, `userRepository.create(userData)`).
    *   Use the methods defined in the `IUserRepository` interface.

4.  **Adapt Data Handling:**
    *   The repository methods should already return data matching the interface contract (e.g., `Promise<User | null>`).
    *   Adjust the API route logic to handle the data returned by the repository methods directly.

5.  **Update Error Handling:**
    *   The repository implementation (`SupabaseUserRepository`) should handle low-level database errors.
    *   The API route should handle errors thrown by the repository (e.g., validation errors, unexpected failures) or handle specific return values (like `null` when a user is not found).
    *   Return appropriate HTTP status codes based on the outcome of the repository call (e.g., 200, 201, 404, 500).

**Specific File Guidance:**

*   **`create.ts`:** Use `userRepository.create(userData)`.
*   **`by-company.ts`:** Use `userRepository.findByCompany(companyId)`.
*   **`get-by-firebase-id.ts`:** Use `userRepository.findByFirebaseUid(firebaseUid)`.
*   **`update.ts`:** Use `userRepository.update(userId, updates)`.
*   **`[id]/index.ts` (GET):** Use `userRepository.findById(id)`. Handle `null` return for 404.
*   **`[id]/index.ts` (DELETE):** Use `userRepository.deleteById(id)`. Check boolean return value.
*   **`[id]/status.ts`:** Use `userRepository.update(id, { status: newStatus, statusMessage: newMessage })`.
*   **`remove-from-company.ts`:** Use `userRepository.updateCompanyAssociation(userId, null)`.

**Testing:**

*   Test each API endpoint thoroughly using Postman or `curl`.
*   Verify:
    *   Correct data is returned/created/updated/deleted.
    *   Appropriate HTTP status codes are returned for success and error scenarios.
    *   Authentication/authorization logic still functions correctly.
    *   Confirm that the API route *only* interacts with the `IUserRepository` interface methods for data operations.

**Completion Criteria:**
*   All listed user API routes successfully use methods from an instance of `IUserRepository`.
*   No direct database implementation details (DynamoDB or Supabase client) exist within the API route logic.
*   Endpoints function correctly as verified by testing.