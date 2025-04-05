# IP1_MessagingConversationsFixes

## Overview
This implementation plan addresses critical issues and missing functionality in the messaging and conversations system of the Virtual Office application. The current implementation has several gaps between the frontend hooks/components and the backend API, as well as inconsistencies in data handling and real-time updates.

## Goals
- Fix missing API endpoints and functions in messaging-api.ts
- Ensure consistent error handling across messaging components
- Improve real-time updates for messaging using Supabase Realtime
- Align messaging hooks with React Query patterns used elsewhere in the application
- Ensure proper handling of Firebase UIDs vs Database UUIDs in messaging operations

## Components
- **API Client**: `src/lib/messaging-api.ts`
- **API Routes**: 
  - `/api/messages/*` endpoints
  - `/api/conversations/*` endpoints
- **Hooks**:
  - `src/hooks/useMessages.ts`
  - `src/hooks/useConversations.ts`
  - `src/hooks/useSocketEvents.ts`
- **Repositories**:
  - `src/repositories/interfaces/IMessageRepository.ts`
  - `src/repositories/interfaces/IConversationRepository.ts`
  - `src/repositories/implementations/supabase/SupabaseMessageRepository.ts`
  - `src/repositories/implementations/supabase/SupabaseConversationRepository.ts`
- **UI Components**:
  - Messaging-related components in `src/components/messaging/`

## Technical Approach
1. **API Completion**: Implemented missing functions in messaging-api.ts, particularly for file attachments, typing indicators, and message status updates.

2. **Repository Enhancement**: Ensure the Supabase repositories fully implement their interfaces and handle all required operations correctly.

3. **React Query Migration**: Refactor messaging hooks to use React Query for data fetching and mutations, following the pattern established with spaces.

4. **Real-time Updates**: Implement Supabase Realtime listeners for messaging to replace or augment Socket.IO.

5. **ID Handling**: Implemented proper handling of Firebase UIDs vs Database UUIDs in all messaging operations.

6. **Error Handling**: Implemented consistent error handling and user feedback across all messaging operations.

7. **Testing**: Created a comprehensive testing strategy document for the messaging system to ensure reliability, addressing specific challenges with Next.js App Router API routes.

## Progress Update (April 4, 2025)
- Completed implementation of all messaging API endpoints:
  - File upload functionality in `/api/messages/upload/route.ts`
  - Message attachment retrieval in `/api/messages/attachments/route.ts`
  - Message status updates in `/api/messages/status/route.ts`
  - Typing indicators in `/api/messages/typing/route.ts`
  - Conversation archive/unarchive and read status functionality
- Added proper participant authorization checks in all API routes
- Created a comprehensive testing strategy document (`__tests__/TESTING_APPROACH.md`) that outlines the challenges and recommended approaches for testing Next.js App Router API routes
- Set up Jest environment with mocks for web APIs (Request, Response, Headers, etc.)
- Encountered and documented challenges with testing ES modules in Jest, particularly with the `uuid` package

## Related Tasks
- T1_MessagingAPICompletion - Implemented missing functions in messaging-api.ts and corresponding API routes
- T2_RepositoryEnhancement - Ensure repositories fully implement their interfaces
- T3_ReactQueryMigration - Refactor messaging hooks to use React Query
- T4_RealtimeMessaging - Implement Supabase Realtime for messaging
- T5_FileAttachments - Completed file attachment upload and management
- T6_MessageStatusHandling - Implemented proper message status tracking
- T7_MessagingErrorHandling - Improved error handling and user feedback

## Timeline
- Phase 1 (Days 1-2): Completed API client and repository enhancements (T1)
- Phase 2 (Days 3-4): Implement React Query migration and real-time updates (T3, T4)
- Phase 3 (Days 5-6): Completed file attachments and message status handling (T5, T6)
- Phase 4 (Day 7): Implemented error handling improvements and testing strategy (T7)

## Risks and Mitigations
- **Data Inconsistency**: Ensure proper data synchronization between client and server with optimistic updates and proper error recovery.
- **Real-time Performance**: Monitor performance of real-time updates and implement throttling if necessary.
- **ID Mismatch**: Implemented consistent ID format detection and conversion in all messaging operations.
- **API Dependency**: Ensured all API endpoints are properly implemented before refactoring frontend components.
- **Backward Compatibility**: Maintain backward compatibility with existing code during incremental improvements.
- **Testing Challenges**: Documented challenges with testing Next.js App Router API routes and provided alternative testing strategies focusing on core logic.
