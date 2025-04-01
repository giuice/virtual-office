# Task: Refactor Message API Routes using Repository Pattern (App Router)

**Date:** 3/31/2025

**Objective:** Modify the existing message management API routes (`src/app/api/messages/`) to depend on the `IMessageRepository` interface and use its methods for data access.

**Depends On:**
*   Completion of `repository_interfaces_definition.md` (`IMessageRepository` is defined).
*   Completion of `supabase_repository_implementation.md` (`SupabaseMessageRepository` is implemented).
*   Potentially depends on `IConversationRepository` for context or updates.

**Target Files:**

*   `src/app/api/messages/create/route.ts`
*   `src/app/api/messages/get/route.ts`
*   `src/app/api/messages/react/route.ts`
*   `src/app/api/messages/status/route.ts`
*   `src/app/api/messages/typing/route.ts` (Note: Typing indicators might not involve direct DB persistence, potentially using real-time system only)

**General Refactoring Steps for Each File:**

1.  **Repository Instantiation/Injection:**
    *   **Import:** Import `IMessageRepository` from `src/repositories/interfaces` and `SupabaseMessageRepository` from `src/repositories/implementations/supabase`. Import `IConversationRepository` if needed.
    *   **Instantiate:** Create instances of the required repositories within the API handler:
        ```typescript
        import { IMessageRepository, IConversationRepository } from '@/repositories/interfaces';
        import { SupabaseMessageRepository, SupabaseConversationRepository } from '@/repositories/implementations/supabase';
        // ... other imports

        const messageRepository: IMessageRepository = new SupabaseMessageRepository();
        const conversationRepository: IConversationRepository = new SupabaseConversationRepository(); // If needed
        ```

2.  **Update Imports:**
    *   Remove imports related to `src/lib/dynamo` or direct Supabase client usage.
    *   Ensure necessary types (`Message`, `MessageReaction`, etc.) are imported from `src/types/`.

3.  **Replace Data Access Calls:**
    *   Identify and replace direct database calls with method calls on the repository instances (e.g., `messageRepository.create(messageData)`, `messageRepository.findByConversation(...)`, `messageRepository.addReaction(...)`).
    *   Use only methods defined in the respective repository interfaces.

4.  **Adapt Data Handling:**
    *   Adjust API route logic to handle the data returned by the repository methods.

5.  **Update Error Handling:**
    *   Handle errors potentially thrown by the repository methods.
    *   Return appropriate HTTP responses (e.g., using `NextResponse.json` with correct status codes).

**Specific File Guidance:**

*   **`create/route.ts`:**
    *   Use `messageRepository.create(messageData)`.
    *   May need to update `lastActivity` on the related conversation using `conversationRepository.update(conversationId, { lastActivity: new Date() })`.
    *   Handle potential file attachments by saving them (e.g., to Supabase Storage) and then calling `messageRepository.addAttachment(...)`.
    *   Trigger real-time event after successful creation.

*   **`get/route.ts`:**
    *   Extract `conversationId` and pagination options from the request.
    *   Use `messageRepository.findByConversation(conversationId, paginationOptions)`.
    *   Return the list of messages.

*   **`react/route.ts`:**
    *   Determine if adding or removing a reaction based on request body.
    *   If adding: Use `messageRepository.addReaction(messageId, { userId, emoji })`.
    *   If removing: Use `messageRepository.removeReaction(messageId, userId, emoji)`.
    *   Trigger real-time event after successful update.

*   **`status/route.ts`:**
    *   Use `messageRepository.update(messageId, { status: newStatus })`.
    *   Trigger real-time event after successful update.

*   **`typing/route.ts`:**
    *   This route might not interact with the database directly.
    *   Its primary purpose is likely to receive typing indicator events and broadcast them via the real-time system (e.g., Supabase Realtime).
    *   No repository calls might be needed here unless typing status is persisted briefly.

**Testing:**

*   Test each endpoint thoroughly using Postman or `curl`, simulating different request bodies.
*   Verify:
    *   Messages are created, retrieved, updated correctly.
    *   Reactions are added/removed correctly.
    *   Status updates work.
    *   Appropriate HTTP responses and status codes are returned.
    *   Authentication/authorization logic functions correctly.
    *   The API routes interact only with the repository interface methods for DB operations.

**Completion Criteria:**
*   All listed message API routes successfully use methods from the relevant repository instances.
*   No direct database implementation details remain in the API route logic.
*   Endpoints function correctly as verified by testing.