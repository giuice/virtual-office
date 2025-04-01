# Task: Refactor Conversation API Routes using Repository Pattern (App Router)

**Date:** 3/31/2025

**Objective:** Modify the existing conversation management API routes (`src/app/api/conversations/`) to depend on the `IConversationRepository` interface and use its methods for data access.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`IConversationRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseConversationRepository` is implemented).

**Target Files:**

*   `src/app/api/conversations/archive/route.ts`
*   `src/app/api/conversations/create/route.ts`
*   `src/app/api/conversations/get/route.ts`
*   `src/app/api/conversations/read/route.ts`

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import `IConversationRepository` from `src/repositories/interfaces` and `SupabaseConversationRepository` from `src/repositories/implementations/supabase`.
    *   **Instantiate:** Create an instance of the repository within the API handler:
        ```typescript
        import { IConversationRepository } from '@/repositories/interfaces';
        import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const conversationRepository: IConversationRepository = new SupabaseConversationRepository();
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`Conversation`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify and replace direct database calls with method calls on the `conversationRepository` instance (e.g., `conversationRepository.create(conversationData)`, `conversationRepository.findForUser(userId)`, `conversationRepository.update(id, updates)`).
    *   Use only methods defined in the `IConversationRepository` interface.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods. Handle JSONB fields like `unread_count` if necessary.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods.
    *   Return appropriate HTTP responses (e.g., using `NextResponse.json` with correct status codes).

**Specific File Guidance:**

*   **`archive/route.ts`:**
    *   Extract `conversationId` and `isArchived` status from the request body.
    *   Use `conversationRepository.update(conversationId, { isArchived })`.
    *   Return success or error response.

*   **`create/route.ts`:**
    *   Extract participant IDs, type, name (if group/room) from the request body.
    *   Initialize `unread_count` (likely setting all participants to 0).
    *   Use `conversationRepository.create(conversationData)`.
    *   Return the newly created conversation.

*   **`get/route.ts`:**
    *   Get the current user ID.
    *   Use `conversationRepository.findForUser(userId)` (assuming this method exists in the interface/implementation to get conversations where the user is a participant). This method might need filtering options (e.g., exclude archived).
    *   Return the list of conversations.

*   **`read/route.ts`:**
    *   Extract `conversationId` from the request body.
    *   Get the current user ID.
    *   Use `conversationRepository.markAsRead(conversationId, userId)` (assuming this method exists to update the `unread_count` JSONB field for the specific user). This might involve fetching the conversation, updating the JSON, and saving it back via `conversationRepository.update`.
    *   Return success or error response.

**Testing:**

*   Test each endpoint thoroughly using Postman or `curl`.
*   Verify:
    *   Conversations are created, retrieved, archived, marked as read correctly.
    *   Filtering (e.g., by user, archived status) works as expected.
    *   Appropriate HTTP responses and status codes are returned.
    *   Authentication/authorization logic functions correctly.
    *   The API routes interact only with the `IConversationRepository` interface methods for DB operations.

**Completion Criteria:**
*   All listed conversation API routes successfully use methods from an instance of `IConversationRepository`.
*   No direct database implementation details remain in the API route logic.
*   Endpoints function correctly as verified by testing.