---CLINE_RULES_START---
[PHASE_MARKER]
CURRENT: Execution
NEXT: Strategy
LAST_ACTION: Restructured implementation plan to prioritize critical floor plan and messaging fixes (T8, T9, T10)
REQUIRED_BEFORE_TRANSITION: Complete critical floor plan and messaging fixes (T8, T9, T10)
[/PHASE_MARKER]

[CODE_ROOT_DIRECTORIES]
- src

[LEARNING_JOURNAL]
- Initial setup completed on March 13, 2025.
- Identified code roots: src.
- Active Context updated on March 14, 2025 with detailed project status, configuration, and next steps.
- Dependency information updated on March 14, 2025 with verified dependencies between modules.
- Transitioned to Strategy Phase on March 14, 2025 to begin creating detailed instruction files for prioritized tasks.
- Created detailed instruction files for all prioritized tasks on March 14, 2025, including floor plan enhancements, messaging, blackboard, user profiles, notifications, and advanced communication tools.
- Completed Interactive Floor Plan Implementation on March 14, 2025, adding drag-and-drop functionality, zooming capabilities, grid snapping, and visual feedback for interactions.
- Fixed Floor Plan Canvas Rendering Issues on March 14, 2025, resolving canvas initialization problems and improving room interaction.
- Implemented Room Management Features on March 15, 2025, adding room creation, editing, deletion, and template selection capabilities. Improved code organization by applying SOLID principles and DRY practices, breaking down large components into smaller, more focused ones.
- Updated Memory Bank on March 17, 2025, replacing all placeholder dependencies in dependency_tracker.md with actual dependency information based on codebase analysis. Updated progress.md and activeContext.md to reflect the completion of Room Management Features and the next task (Messaging System).
- Started Messaging System Implementation on March 18, 2025, creating API endpoints for messages and conversations, enhancing room components for chat integration, and adding necessary dependencies. Created initial endpoints for sending/retrieving messages and conversations with proper typing and validation.
- Set up basic Socket.IO infrastructure (context, server, provider, test component) for real-time messaging on March 27, 2025.
- Verified Socket.IO connection and confirmed basic message state updates in MessagingContext on March 27, 2025.
- Created placeholder UI components (ChatWindow, MessageList, MessageInput, RoomMessaging, ConversationList) in src/components/messaging/ on March 27, 2025.
- Improved dashboard layout by prioritizing key info and removing large static floor plan card on March 27, 2025.
- Integrated RoomMessaging and MessageDialog components with MessagingContext for basic message display and sending on March 27, 2025.
- Updated dependency trackers (doc_tracker.md, dependency_tracker.md) on March 27, 2025. Note: 2 placeholders remain in doc_tracker.md due to tool limitations.
- Integrated room chat panel opening on floor plan double-click in floor-plan.tsx on March 27, 2025.
- Integrated user profile data (name/avatar) into MessageList.tsx using CompanyContext on March 27, 2025.
- Added initial UI for message reactions (button on hover) in MessageList.tsx on March 27, 2025.
- Added reaction selection popover UI in MessageList.tsx on March 27, 2025.
- Connected reaction handler (handleSelectReaction) in MessageList.tsx to context function (addReaction) for optimistic updates on March 27, 2025.
- Created placeholder API endpoint `src/app/api/messages/react/route.ts` on March 27, 2025.
- Connected `MessagingContext.addReaction` to call the placeholder reaction API endpoint on March 27, 2025.
- Implemented database logic in reaction API endpoint `/api/messages/react` on March 27, 2025.
- Implemented initial UI for message threading (reply indicator/button in MessageList, reply context in MessageInput) on March 27, 2025.
- Added state management for reply context in ChatWindow.tsx on March 27, 2025.
- Ensured correct Date object assignment in MessagingContext to avoid TypeScript errors.
- Updated simple socket server to acknowledge replyToId for basic threading support.
- Implemented Socket.IO listeners and emitters for real-time reaction updates in both backend (`socket-server.js`) and frontend (`MessagingContext.tsx`). Ensured `replyToId` is broadcast.
- Refactored user invitation to use token-based flow, fixing ID mismatch. Added DB functions, API endpoints, and frontend page/component updates.
- Regularly running `analyze-project` after significant code changes keeps the dependency trackers (`module_relationship_tracker.md`, mini-trackers) accurate and prevents potential issues during development.
- Adding console logs to relevant frontend and backend components is a useful technique for tracing the execution flow during manual testing, especially for multi-step processes like user invitations.
- Pages within `src/pages` (Pages Router) are not automatically wrapped by providers defined in `src/app/layout.tsx` (App Router). Context-dependent pages in `src/pages` need their own provider wrapping if `src/pages/_app.tsx` is not used.
- Identified that `src/lib/messaging-api.ts` is missing several functions needed by the messaging hooks (reactions, status updates, typing indicators, archiving, read status). These need to be implemented along with corresponding backend API routes.
- Corrected import paths and type definitions in messaging hooks (`useMessages`, `useConversations`, `useSocketEvents`) to resolve build errors after fixing floor plan import.
- Adding placeholder client-side API functions first helps structure the frontend logic before implementing the corresponding backend routes.
- Creating placeholder backend route handlers with TODOs helps structure the backend implementation and identify necessary database functions early.
- Refactoring large utility files (like dynamo.ts) into smaller, entity-specific modules improves code organization and maintainability (SOLID). Using a barrel file (index.ts) ensures backward compatibility.
- Updating type definitions (`src/types/database.ts`) is crucial when adding new fields to data models to avoid TypeScript errors during implementation.
- Using atomic `UpdateExpression` in DynamoDB (e.g., for reactions, unread counts) is safer than get-modify-put operations to avoid race conditions.
- TypeScript null checks (`if (!var)`) might not always satisfy the compiler in later scopes; non-null assertion (`var!`) can be used if nullness is guaranteed by prior logic.
- Using `apply_diff` is more reliable than `search_and_replace` when the exact content might have subtle variations or when replacing multi-line blocks.
- Remember to update shared constants (like `TABLES` in `utils.ts`) when adding new entities or features that rely on them.
- Integrating newly created DB functions into API routes requires careful updating of import paths and function arguments.
- Refactoring duplicated code (like generic DB helpers) into a central location (`operations.ts`) improves maintainability and reduces redundancy. Need to update imports in all consuming files.
- Running `analyze-project` after significant refactoring (like moving shared functions) is crucial for keeping dependency trackers accurate.
- **Project Pivot (3/31):** Switched focus from DynamoDB to Supabase due to cost concerns. Paused DynamoDB feature work and initiated planning for Supabase migration.
- Status check complete (3/31). Transitioned to Strategy phase for Supabase migration planning.
- **Repository Pattern Pivot (3/31):** Adopted Repository Pattern during Strategy phase for Supabase migration to improve data access abstraction and maintainability. Updated instruction files accordingly.
- Refactoring API routes requires careful checking of repository interface capabilities. If a required method (like `findByUserId`) is missing, the refactoring for that specific route must be deferred until the interface and implementation are updated.
- Transitioned to Execution phase (3/31) to begin Supabase migration implementation.
- Corrected execution path (3/31) to follow Repository Pattern migration plan, starting with interface definitions.
- Defined all repository interfaces (IUserRepository, ICompanyRepository, etc.) in `src/repositories/interfaces/` (3/31).
- Implemented all Supabase repository classes (SupabaseUserRepository, etc.) in `src/repositories/implementations/supabase/` (3/31).
- Refactoring API routes involves replacing direct DB calls with repository method calls, updating imports, adjusting data handling/types, and ensuring error handling remains appropriate. Sometimes type definitions or repository interfaces need adjustments discovered during implementation (e.g., `Space.userIds`, filtering logic).
- When refactoring API routes, carefully check the *specific logic* of the route. A simple repository method (like `findByUserId`) might not be sufficient if the route needs to find *all* related items (requiring `findAllByUserId`).
- **Type Consistency:** When refactoring API routes to use repositories, ensure the data types used in the route (e.g., for request body parsing, preparing data for the repository) match the types expected by the repository interface methods (e.g., `Message` from `@/types/messaging` vs. `@/types/database`). Mismatches can cause subtle TypeScript errors.
- Repository method return types must match the expected usage in the API route. If a method like `findByConversation` returns `Message[]` but the route expects `PaginatedResult<Message>`, the route needs temporary adjustments until the repository method is updated.
- If strict type checking causes persistent issues with object indexing (e.g., `Element implicitly has an 'any' type`), and the underlying type definition cannot be immediately fixed, using a type assertion (`as any`) can be a temporary workaround to proceed, but the type definition should be revisited later.
- Prioritize refactoring/implementing prerequisite features (e.g., Space/Room management APIs) before attempting end-to-end testing of dependent features (e.g., messaging within rooms).
- Placing hooks (`useX`) in `src/hooks` is standard convention and avoids confusion compared to placing them within `src/contexts`.
- Duplicate files (like `MessagingContext.tsx`) can cause significant issues; verify imports (`layout.tsx`, components) to ensure the correct version is used before deleting duplicates.
- Ensure type definitions are consistent across files (`src/types/` vs `src/contexts/x/types.ts`) and remove unused/undefined type imports.
- Breaking down large React components into smaller, focused components improves maintainability and makes the code easier to understand and test
- Using a directory structure for related components helps organize code and makes relationships clearer
- Separating types, utils, and components helps maintain clean separation of concerns
- Aligning component structure with database schema (like space_reservations table) makes it easier to manage data flow
- Using TypeScript interfaces to define props makes component relationships explicit and catches errors early
- When refactoring components to use new data fetching methods (like React Query), ensure local type definitions (like `LocalSpace`) are updated to match the actual data structure returned by the database/adapter to avoid type mismatches.
- Double-check imports when creating new files (e.g., hooks). Assumed barrel exports might not exist. Verify repository implementations and instantiate them directly if needed. If `apply_diff` fails unexpectedly, reading the file back and using `write_to_file` with the full correct content can be a reliable fallback.
- Implementing real-time updates with Supabase Realtime and React Query requires careful consideration of cache invalidation strategies based on event types (INSERT, UPDATE, DELETE).
- Transitioning to Strategy phase (4/4) to plan fixes for messaging and conversations
- Completed all task instructions for messaging fixes, fixed space creation bug, and transitioned to Execution phase

---CLINE_RULES_END---
