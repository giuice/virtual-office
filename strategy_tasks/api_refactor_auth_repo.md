# Task: Refactor Auth API Routes using Repository Pattern

**Date:** 3/31/2025

**Objective:** Modify any existing authentication-related API routes (`src/pages/api/auth/`) that interact with the database (e.g., creating or retrieving user profiles during signup) to depend on the relevant repository interfaces (`IUserRepository`, `ICompanyRepository`) and use their methods.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`IUserRepository`, `ICompanyRepository` defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseUserRepository`, `SupabaseCompanyRepository` implemented).
*   Understanding of how Clerk (or the current auth provider) webhooks or callbacks interact with these API routes.

**Target Files:**

*   `src/pages/api/auth/signup.ts` (Likely target if user profile is created here)
*   *(Potentially other files in `src/pages/api/auth/` if they perform DB operations like fetching user roles or company info based on auth context).*

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import necessary repository interfaces (e.g., `IUserRepository`) and their concrete implementations (e.g., `SupabaseUserRepository`).
    *   **Instantiate:** Create instances of the required repositories within the API handler:
        ```typescript
        import { IUserRepository } from '@/repositories/interfaces';
        import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const userRepository: IUserRepository = new SupabaseUserRepository();
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`User`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify direct database calls related to user creation or retrieval.
    *   Replace these calls with method calls on the repository instances (e.g., `userRepository.create(userData)`, `userRepository.findByFirebaseUid(firebaseUid)`).
    *   Use only methods defined in the respective repository interfaces.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods (e.g., user already exists).
    *   Return appropriate HTTP status codes.

**Specific File Guidance:**

*   **`signup.ts`:**
    *   This route likely receives user information (e.g., from a Clerk webhook after successful signup).
    *   Extract necessary user details (email, potentially Firebase UID, display name).
    *   Check if a user with this email or Firebase UID already exists using `userRepository.findByEmail` or `userRepository.findByFirebaseUid`. Handle accordingly if they do.
    *   Prepare the `userData` object based on the `User` type (excluding DB-generated fields). Set default values for `role`, `status`, `preferences`, etc. `companyId` might be null initially unless determined during signup.
    *   Use `userRepository.create(userData)` to create the user profile in the Supabase database.
    *   Return a success response (often required by webhooks like Clerk's).

*   **Other Auth Files:**
    *   Analyze any other files in `src/pages/api/auth/`. If they fetch user roles, company details, or other DB information based on the authenticated user, refactor them to use repository methods (`userRepository.findById`, `companyRepository.findById`, etc.).

**Testing:**

*   Test the signup flow thoroughly, potentially using mock webhook events if possible, or by manually triggering the signup process in the application.
*   Verify:
    *   User profiles are correctly created in the Supabase `users` table upon signup.
    *   Duplicate user creation is handled gracefully.
    *   Any other auth-related DB interactions function correctly.
    *   Appropriate HTTP responses are returned.
    *   The API routes interact only with the repository interface methods for DB operations.

**Completion Criteria:**
*   All identified auth API routes that perform database operations successfully use methods from the relevant repository instances.
*   No direct database implementation details remain in the API route logic.
*   Endpoints function correctly as verified by testing.