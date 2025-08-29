# Product Context

## Overview
Virtual Office is a digital workspace platform that simulates a physical office environment for remote and hybrid teams. It provides real-time collaboration features including virtual floor plans, team rooms, user presence, messaging, and company management. The platform is built with Next.js 15, React 19, Supabase, and TypeScript for a modern, scalable architecture.

## Core Features Status

### ✅ Implemented Features

#### Authentication System
- **Multi-Provider Auth**: Email/password and Google OAuth integration
- **Session Management**: Secure session handling with automatic refresh
- **User Profile Sync**: Automatic profile creation and Google avatar integration
- **Multi-Account Support**: Account switching and conflict resolution
- **Status Management**: Online/offline presence tracking
- **Implementation**: `src/contexts/AuthContext.tsx`, `src/lib/auth/`

#### Company Management
- **Multi-Tenant Architecture**: Company-based workspace isolation
- **Role-Based Access**: Admin and member role management
- **Company Context**: Global company state management
- **User Management**: Company user listing and profile management
- **Implementation**: `src/contexts/CompanyContext.tsx`, `src/repositories/`

#### Dashboard System
- **Main Dashboard**: Welcome screen with company overview
- **Quick Links**: Navigation to key features
- **Admin Panel**: Administrative functions for company admins
- **Company Overview**: User count, activity metrics
- **Implementation**: `src/app/(dashboard)/dashboard/`

#### Real-Time Messaging
- **Chat System**: Real-time messaging with Supabase Realtime
- **Message Components**: Composer, feed, and item components
- **Conversation Management**: Multiple conversation support
- **Room-Based Messaging**: Location-specific chat functionality
- **Implementation**: `src/components/messaging/`, `src/hooks/realtime/`

#### User Presence System
- **Real-Time Presence**: Live user status tracking
- **Presence Context**: Global presence state management
- **Status Updates**: Automatic online/offline detection
- **Implementation**: `src/contexts/PresenceContext.tsx`, `src/hooks/useUserPresence.ts`

### 🔧 Partially Implemented Features

#### Avatar System (CRITICAL CONSOLIDATION NEEDED)
- **Status**: Functionally working but architecturally problematic
- **Critical Issue**: 11 different avatar components causing maintenance chaos
- **Current Duplicates**:
  - 5 UI avatar components (`avatar.tsx`, `enhanced-avatar.tsx`, `enhanced-avatar-v2.tsx`, `avatar-with-fallback.tsx`, `status-avatar.tsx`)
  - 2 profile avatar components (`ProfileAvatar.tsx`, `UploadableAvatar.tsx`)
  - 3 floor-plan avatar components (`user-avatar.tsx`, `UserAvatarPresence.tsx`, `ModernUserAvatar.tsx`)
  - 1 showcase component (`AvatarShowcase.tsx`)
- **Working Parts**: 
  - Avatar utilities in `src/lib/avatar-utils.ts` (excellent, no duplicates)
  - Google OAuth avatar sync (working correctly)
  - Basic avatar display across all components
  - Upload functionality in some components
- **Consolidation Plan**: Reduce from 11 to 7 components (36% reduction)
  - **Canonical Display**: `EnhancedAvatarV2` (most comprehensive)
  - **Canonical Upload**: `UploadableAvatar` (advanced upload features)
- **Developer Impact**: Major confusion about which component to use
- **Implementation**: Multiple scattered implementations need consolidation

#### Invitation System (EXCELLENT ARCHITECTURE)
- **Status**: Well-architected with minor restoration needs
- **Architecture Quality**: Exemplary organization, zero duplicates found
- **Current Components** (all well-structured):
  - `invitation-management.tsx` - Container component
  - `invite-user-dialog.tsx` - Creation interface
  - `invitation-list.tsx` - Management interface
  - `invitation-error-display.tsx` - Error handling
- **Working Parts**: 
  - Admin invitation management interface (fully functional)
  - Comprehensive error handling system
  - Token generation and validation (working correctly)
  - Invitation data structures and validation
- **Minor Issues**: Invitation acceptance flow needs restoration
- **Architecture Note**: This system serves as a reference model for other features
- **Implementation**: `src/components/invitation/`, `src/app/admin/invitations/`, `src/lib/invitation-error-handler.ts`

#### Virtual Floor Plan
- **Status**: Basic structure in place, needs development
- **Current State**: Component structure exists, interactive features planned
- **Implementation**: `src/components/floor-plan/`

### 📋 Planned Features

#### AI Integration
- **Meeting Transcription**: AI-powered meeting notes and transcription
- **Task Extraction**: Automatic task identification from conversations
- **Smart Summaries**: AI-generated meeting and conversation summaries
- **Status**: Not yet implemented

#### Advanced Communication
- **WebRTC Integration**: Video and voice calling capabilities
- **Screen Sharing**: Collaborative screen sharing features
- **File Sharing**: Document and media sharing system
- **Status**: Planned for future development

#### Global Blackboard
- **Company Announcements**: Company-wide communication system
- **Notification System**: Advanced notification management
- **Status**: Basic notification system exists, needs expansion

## User Types & Capabilities

### Company Administrators
- **Current Capabilities**:
  - Manage company settings and user roles
  - Access admin panel and invitation management
  - View company overview and user metrics
  - Full dashboard access with admin-specific features
- **Implementation**: Role-based access control in `src/contexts/CompanyContext.tsx`

### Team Members
- **Current Capabilities**:
  - Access main dashboard and company overview
  - Participate in real-time messaging
  - Update profile and presence status
  - Navigate virtual office interface
- **Implementation**: Standard user permissions and dashboard access

### New Employees (via Invitation)
- **Current Capabilities**:
  - Receive invitation links (when system is fully restored)
  - Complete signup process with company assignment
  - Automatic profile creation and onboarding
- **Status**: Invitation acceptance flow needs restoration

## Key User Workflows

### 1. User Authentication & Onboarding
- **Status**: ✅ Fully implemented
- **Flow**: Registration → Email/Google auth → Profile creation → Company assignment
- **Implementation**: `src/app/(auth)/`, `src/contexts/AuthContext.tsx`

### 2. Company Dashboard Navigation
- **Status**: ✅ Fully implemented
- **Flow**: Login → Dashboard → Quick links → Feature access
- **Implementation**: `src/app/(dashboard)/dashboard/`

### 3. Real-Time Communication
- **Status**: ✅ Mostly implemented
- **Flow**: Join room → Send messages → Real-time updates → Presence tracking
- **Implementation**: `src/components/messaging/`, `src/hooks/realtime/`

### 4. Invitation Management (Admin)
- **Status**: 🔧 Partially working
- **Flow**: Admin panel → Create invitation → Send link → User acceptance
- **Issues**: Invitation acceptance flow needs restoration

### 5. Avatar Management
- **Status**: 🔧 Partially working
- **Flow**: Profile → Upload/sync avatar → Display across platform
- **Issues**: Multiple implementations need consolidation

## Technical Architecture

### Frontend Architecture
- **Framework**: Next.js 15 with App Router and React 19
- **State Management**: TanStack Query + React Context
- **UI Components**: Shadcn/UI with Radix primitives
- **Styling**: TailwindCSS 4.1.3 with custom theme

### Backend Architecture
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth with multi-provider support
- **Real-Time**: Supabase Realtime for live updates
- **File Storage**: AWS S3 integration for avatar uploads

### Data Patterns
- **Repository Pattern**: Abstracted data access layer
- **Multi-Tenancy**: Company-based data isolation
- **Type Safety**: Comprehensive TypeScript throughout

## Success Metrics & KPIs

### User Engagement
- **Daily Active Users**: Track regular platform usage
- **Session Duration**: Average time spent in virtual office
- **Feature Adoption**: Usage rates of messaging, presence, dashboard features
- **User Retention**: Monthly and quarterly retention rates

### Collaboration Metrics
- **Message Volume**: Real-time messaging activity
- **Cross-Team Interaction**: Communication between different company departments
- **Presence Utilization**: Active presence tracking usage
- **Admin Engagement**: Company admin feature usage

### Technical Performance
- **Real-Time Latency**: Message delivery and presence update speed
- **Authentication Success Rate**: Login and signup completion rates
- **System Reliability**: Uptime and error rates
- **Feature Completion Rate**: Successful workflow completion

## Integration Points

### External Services
- **Supabase**: Database, authentication, real-time, storage
- **Google OAuth**: Third-party authentication provider
- **AWS S3**: File storage and avatar management
- **Next.js**: Full-stack framework with API routes

### Internal Dependencies
- **Authentication ↔ Company Management**: User-company relationships
- **Presence ↔ Messaging**: Real-time status in conversations
- **Avatar ↔ Profile**: User identity across platform
- **Admin ↔ Invitations**: Company management workflows

## System Audit Results (December 2024)

### Comprehensive Analysis Summary
A thorough audit of the Virtual Office codebase revealed a system with **excellent architectural foundations** but specific areas requiring consolidation.

#### ✅ Exemplary Systems (Use as Reference Models)
1. **Authentication System**: Zero duplicates, industry best practices
   - 9 well-structured components with proper separation of concerns
   - Comprehensive error handling and session management
   - **Gold standard** for system architecture
2. **Hooks Directory**: Excellent organization, no duplicates found
   - 12+ custom hooks with clear responsibilities
   - Proper separation of queries, mutations, and real-time updates
   - **Reference model** for hook organization
3. **Repository Pattern**: Clean implementation, no issues
   - Interface-based design with proper abstraction
   - Consistent patterns across all implementations
   - **Architectural excellence** in data access layer
4. **Library Directory**: No duplicates, excellent separation of concerns
   - Well-organized utilities with clear purposes
   - Comprehensive avatar utilities (ironically perfect at lib level)

#### 🔧 Systems Requiring Consolidation
1. **Avatar Components**: 11 components → 7 components (36% reduction needed)
   - **Critical issue**: Major source of developer confusion
   - **Impact**: Affects entire application
   - **Priority**: Highest (1-2 weeks effort)
2. **Messaging Components**: 4 duplicates due to naming inconsistency
   - **Issue**: PascalCase vs kebab-case confusion
   - **Impact**: Medium (affects messaging functionality)
   - **Priority**: Medium (2-3 days effort)

### Functionality Status Report
**Overall System Health**: ✅ FUNCTIONAL (71 comprehensive tests passed)
- **Avatar System**: ✅ 25/25 tests passed (functionally working)
- **Invitation System**: ✅ 25/25 tests passed (excellent architecture)
- **Authentication System**: ✅ 21/21 tests passed (exemplary implementation)

## Current Development Priorities

### Priority 1 (Critical): Avatar System Consolidation
**Issue**: 11 different avatar components causing maintenance chaos
**Impact**: High - affects entire application, developer confusion
**Effort**: 1-2 weeks
**Risk**: Medium - requires careful migration
**Actions**:
1. Consolidate to canonical components (`EnhancedAvatarV2`, `UploadableAvatar`)
2. Remove 4 duplicate components after migration
3. Refactor 3 specialized floor-plan components
4. Update all import references across codebase

### Priority 2 (Important): Messaging Component Cleanup
**Issue**: Naming inconsistency leading to duplicate implementations
**Impact**: Medium - affects messaging functionality
**Effort**: 2-3 days
**Risk**: Low - straightforward cleanup
**Actions**:
1. Standardize to PascalCase naming (`ConversationList.tsx`, `RoomMessaging.tsx`)
2. Remove lowercase duplicates after ensuring feature parity
3. Update import references

### Priority 3 (Maintenance): Minor File Cleanup
**Issue**: Unused files and organizational improvements
**Impact**: Low - organizational improvement
**Effort**: 1 day
**Risk**: Very low
**Actions**:
1. Remove empty `useSocketEvents.ts` file
2. Move test utilities to appropriate locations
3. Clean up unused configuration files

### Priority 4 (Enhancement): Feature Development
1. **Virtual Floor Plan Development**: Interactive office navigation
2. **Advanced Messaging Features**: File sharing, message history
3. **Enhanced Admin Tools**: User management, company analytics

### Priority 5 (Future): Advanced Features
1. **AI Integration**: Meeting transcription and task extraction
2. **WebRTC Implementation**: Video and voice calling
3. **Mobile Optimization**: Responsive design improvements