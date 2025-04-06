# Task: Refactor Invitation API Routes using Repository Pattern

**Date:** 3/31/2025

**Objective:** Modify the existing invitation management API routes (`src/pages/api/invitations/`) to depend on the `IInvitationRepository` interface and use its methods for data access.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`IInvitationRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseInvitationRepository` is implemented).
*   Potentially depends on `IUserRepository` and `ICompanyRepository` for related operations during acceptance.

**Target Files:**

*   `src/pages/api/invitations/create.ts`
*   `src/pages/api/invitations/accept.ts`

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import `IInvitationRepository` from `src/repositories/interfaces` and `SupabaseInvitationRepository` from `src/repositories/implementations/supabase`. Also import other needed repositories like `IUserRepository`, `ICompanyRepository`.
    *   **Instantiate:** Create instances of the required repositories within the API handler:
        ```typescript
        import { IInvitationRepository, IUserRepository, ICompanyRepository } from '@/repositories/interfaces';
        import { SupabaseInvitationRepository, SupabaseUserRepository, SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
        const userRepository: IUserRepository = new SupabaseUserRepository();
        const companyRepository: ICompanyRepository = new SupabaseCompanyRepository(); // If needed
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`Invitation`, `User`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify and replace direct database calls with method calls on the repository instances (e.g., `invitationRepository.create(invitationData)`, `invitationRepository.findByToken(token)`, `userRepository.update(...)`).
    *   Use only methods defined in the respective repository interfaces.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods (e.g., token not found, invitation expired, user update failed).
    *   Return appropriate HTTP status codes (e.g., 200, 201, 400, 404, 410 Gone for expired, 500).

**Specific File Guidance:**

*   **`create.ts`:**
    *   Generate a unique token (e.g., using `crypto.randomBytes`).
    *   Calculate the expiration timestamp.
    *   Use `invitationRepository.create({ token, email, companyId, role, expiresAt, status: 'pending' })`.
    *   Handle potential errors during creation (e.g., duplicate token, though unlikely).
    *   Implement logic to send the invitation email containing the token/link.

*   **`accept.ts`:**
    *   Extract the `token` from the request.
    *   Use `invitationRepository.findByToken(token)` to retrieve the invitation.
    *   **Validate:**
        *   Check if the invitation exists (`null` return). Return 404 if not found.
        *   Check if the invitation `status` is 'pending'. Return 400 or 410 if already accepted/expired.
        *   Check if `expiresAt` is in the past. If so, potentially update status to 'expired' using `invitationRepository.updateStatus(token, 'expired')` and return 410.
    *   Get the authenticated user's ID (e.g., from Clerk).
    *   Use `userRepository.updateCompanyAssociation(userId, invitation.companyId)` to link the user to the company. Handle potential errors.
    *   Optionally update the user's role using `userRepository.update(userId, { role: invitation.role })`.
    *   Update the invitation status using `invitationRepository.updateStatus(token, 'accepted')`.
    *   Return a success response.

**Testing:**

*   Test the full invitation flow:
    *   Create an invitation via the `create` endpoint.
    *   Attempt to accept with an invalid/expired token.
    *   Attempt to accept a valid token.
    *   Verify user's `companyId` and `role` are updated correctly in the database (using Supabase UI or another API call).
    *   Verify invitation status is updated to 'accepted'.
*   Check edge cases and error handling (e.g., user already in a company).

**Completion Criteria:**
*   The `create` and `accept` invitation API routes successfully use methods from the relevant repository instances (`IInvitationRepository`, `IUserRepository`).
*   No direct database implementation details remain in the API route logic.
*   The invitation flow functions correctly as verified by testing.