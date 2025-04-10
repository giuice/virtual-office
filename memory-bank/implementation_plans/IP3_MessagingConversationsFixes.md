# IP1_MessagingConversationsFixes

## Overview
This implementation plan addresses critical issues and missing functionality in the messaging and conversations system of the Virtual Office application, as well as floor plan visualization problems. The current implementation has several gaps between the frontend hooks/components and the backend API, as well as inconsistencies in data handling and real-time updates. Additionally, users are experiencing issues with floor plan visualization and interaction.

## Goals
- Fix floor plan visibility issues (black spaces, missing spaces)
- Ensure users appear correctly on the floor plan across different sessions
- Fix missing API endpoints and functions in messaging-api.ts
- Ensure consistent error handling across messaging components
- Improve real-time updates for messaging using Supabase Realtime
- Align messaging hooks with React Query patterns used elsewhere in the application
- Ensure proper handling of Firebase UIDs vs Database UUIDs in messaging operations

## Components
- **Floor Plan Components**:
  - `src/components/floor-plan/FloorPlan.tsx`
  - Space visualization components
  - User avatar/representation components
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
1. **Floor Plan Fixes**: Address visibility issues for spaces, ensure proper rendering of all created spaces, and fix user avatar display across different sessions.

2. **Messaging Authentication Fixes**: Fix session validation and authentication issues in messaging API routes to resolve 401 errors and enable proper messaging functionality.

3. **User Interaction Fixes**: Enable proper user-to-user messaging and interaction in the floor plan so users can message each other.

4. **Repository Enhancement**: Ensure the Supabase repositories fully implement their interfaces and handle all required operations correctly.

5. **React Query Migration**: Refactor messaging hooks to use React Query for data fetching and mutations, following the pattern established with spaces.

6. **Real-time Updates**: Implement Supabase Realtime listeners for messaging to replace or augment Socket.IO.

## Progress Update (April 5, 2025)
- Identified critical floor plan visualization issues that need immediate attention

## Related Tasks
- T8_FloorPlanVisibilityFixes - Fix space visualization and loading issues
- T9_MessagingAuthenticationFixes - Address authentication and session issues in messaging
- T10_UserInteractionFixes - Fix user-to-user interaction for messaging
- T2_RepositoryEnhancement - Ensure repositories fully implement their interfaces
- T3_ReactQueryMigration - Refactor messaging hooks to use React Query
- T4_RealtimeMessaging - Implement Supabase Realtime for messaging

## Timeline
- Phase 1 (Immediate): Fix critical floor plan and messaging authentication issues (T8, T9, T10)
- Phase 2 (Days 3-4): Repository enhancement and React Query migration (T2, T3)
- Phase 3 (Days 5-6): Implement real-time messaging updates (T4)

## Risks and Mitigations
- **Data Inconsistency**: Ensure proper data synchronization between client and server with optimistic updates and proper error recovery.
- **Real-time Performance**: Monitor performance of real-time updates and implement throttling if necessary.
- **ID Mismatch**: Implemented consistent ID format detection and conversion in all messaging operations.
- **Authentication Complexity**: Carefully track session state and use consistent authentication methods.
- **Cross-Browser Issues**: Test changes across multiple browser sessions.
- **Visual Regression**: Maintain existing functionality while improving visualization.
