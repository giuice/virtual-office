# Supabase Migration Plan (Using Repository Pattern)

**Date:** 3/31/2025

**Objective:** Migrate the application backend from AWS DynamoDB to Supabase (PostgreSQL) using the Repository Pattern for data access abstraction.

**Assumptions:**
*   No data migration from DynamoDB is required. We will start with a fresh Supabase database.
*   Existing Clerk authentication will be maintained.

**High-Level Steps:**

1.  **Setup Supabase Project:** Create a new project on Supabase. Obtain Project URL and Anon Key. Set up environment variables.
2.  **Apply Schema:** Apply the defined PostgreSQL schema (see `supabase_schema_definition.sql`) to the Supabase project.
3.  **Define Repository Interfaces (`src/repositories/interfaces/`):** Create TypeScript interfaces defining data access methods for each entity (e.g., `IUserRepository`, `ICompanyRepository`). (See Task: `repository_interfaces_definition.md`)
4.  **Implement Supabase Client (`src/lib/supabase/client.ts`):** Create the Supabase client instance.
5.  **Implement Supabase Repositories (`src/repositories/implementations/supabase/`):** Create concrete classes implementing the repository interfaces using the Supabase client. (See Task: `supabase_repository_implementation.md`)
6.  **Refactor API Routes:** Refactor existing API routes (App Router and Pages Router) to depend on the repository *interfaces* and use their methods. Implement a way to inject the concrete Supabase repository implementations. (See Task files below)
7.  **Replace Direct DynamoDB Imports (If any):** Search the codebase for any direct imports from `src/lib/dynamo/` outside of API routes and refactor them to use repository interfaces.
8.  **Update Real-time Logic:** Replace Socket.IO/DynamoDB Streams logic with Supabase Realtime Subscriptions. This might involve creating specific methods in repositories or handling subscriptions separately. (See Task: `supabase_realtime_integration.md`)
9.  **Remove DynamoDB Code:** Delete the `src/lib/dynamo/` directory and related setup/test files.
10. **Testing:** Thoroughly test all affected features.

**Detailed Task Instruction Files:**

*   `supabase_schema_definition.sql`: Contains the final SQL `CREATE TABLE` statements. (Already Created)
*   `repository_interfaces_definition.md`: Instructions for creating the repository interfaces.
*   `supabase_repository_implementation.md`: Instructions for creating the Supabase repository implementations (includes client setup).
*   `api_refactor_users_repo.md`: Instructions for refactoring user-related API routes using `IUserRepository`.
*   `api_refactor_companies_repo.md`: Instructions for refactoring company-related API routes using `ICompanyRepository`.
*   `api_refactor_spaces_repo.md`: Instructions for refactoring space-related API routes using `ISpaceRepository`.
*   `api_refactor_invitations_repo.md`: Instructions for refactoring invitation-related API routes using `IInvitationRepository`.
*   `api_refactor_messages_repo.md`: Instructions for refactoring message-related API routes using `IMessageRepository`.
*   `api_refactor_conversations_repo.md`: Instructions for refactoring conversation-related API routes using `IConversationRepository`.
*   `api_refactor_auth_repo.md`: Instructions for refactoring auth-related API routes (if they interact with DB repositories).
*   `supabase_realtime_integration.md`: Instructions for implementing real-time features using Supabase Subscriptions.

**Next Steps:**
1. Create the `repository_interfaces_definition.md` file.
2. Create the `supabase_repository_implementation.md` file.
3. Create the detailed API refactoring instruction files (using the new `_repo` suffix).