# Virtual Office — Combined Reference (Tech, Product, Structure, Code Rules)

# Product Context

## Overview

Virtual Office is a digital workspace platform that simulates a physical office environment for remote and hybrid teams. It provides real-time collaboration features including virtual floor plans, team rooms, user presence, messaging, and company management. The platform is built with Next.js 15.3.0, React 19.1.0, Supabase, and TypeScript for a modern, scalable architecture.

**CORE PRINCIPLES (IMMUTABLE TRUTHS):**
- NEVER, EVER GUESS about technical information
- ALWAYS verify information before presenting it as fact
- If you don't know something, explicitly state "I don't know" or "I need to look that up"
- NEVER make assumptions about code functionality
- ALWAYS ask users to test code before assuming it works

# Code Rules & Development Guidelines

* Follow TypeScript best practices and strict type safety when developing with Next.js

  * Enable strict mode in tsconfig.json
  * Use proper type annotations for props, state, and function parameters
  * Use App Router primitives: Server Components, Route Handlers, Server Actions, and typed `cookies()`/`headers()` access
  * Prefer interfaces for object shapes; use `type` for unions, utility types, and function signatures where appropriate
  * Use generic types where appropriate to maintain type safety

* Maintain code modularity by keeping files under 500 lines

  * Break down large components into smaller, focused components
  * Extract custom hooks when logic becomes complex
  * Separate business logic into utility functions or services
  * Use composition patterns to avoid monolithic components

* Implement componentization strategy for files exceeding 500 lines

  * Split large components into logical sub-components
  * Create reusable UI components in a shared components directory
  * Extract form logic into separate form components
  * Move data fetching logic to custom hooks or API utilities
  * Consider using compound component patterns for complex UI elements

* Always verify if functionality already exists before implementing new features

  * Check existing components, hooks, and utilities before creating duplicates
  * Search the codebase for similar patterns or implementations
  * Review shared component libraries and utility functions
  * Consult team documentation or component catalogs
  * Use existing APIs and services rather than creating new ones
  * Extend or modify existing functionality when appropriate instead of rebuilding
  * Document new functionality to prevent future duplication
  * **CRITICAL**: `src/lib/supabase/` folder contains:
    * `server-client.ts`: Server-side Supabase client with service role support
    * `browser-client.ts`: Browser Supabase client for client components
    * `client.ts`: Singleton client instance for consistent usage

  * **Authentication Pattern**: Use existing `createSupabaseServerClient()` in API routes instead of creating new auth helpers
  * **CRITICAL RLS ISSUE**: Never use browser Supabase client in API routes - this breaks Row Level Security policies

    * **Problem**: `auth.uid()` is not available in server context with browser client
    * **Result**: RLS policies fail with "new row violates row-level security policy"
    * **Solution**: Always pass server client instance to repositories in API routes

---

## Development Guidelines

### Development Philosophy

```
- Write clean, maintainable, and scalable code
- Follow SOLID principles
- Prefer functional and declarative programming patterns over imperative
- Emphasize type safety and static analysis
- Practice component-driven development
```

---

### Naming Conventions

#### General Rules

```
- **PascalCase for**: React component filenames and exported components
- **kebab-case for**: Directory names and non-component filenames (e.g., `components/auth-wizard`, `avatar-utils.ts`)
- **camelCase for**: Variables, Functions, Methods, Hooks (identifiers)
- **Hooks filenames**: kebab-case starting with `use-` (e.g., `use-user-presence.ts`)
- **UPPERCASE for**: Environment variables, Constants, Global configurations
```

#### Specific Naming Patterns

```
- Prefix event handlers with `handle`: `handleClick`, `handleSubmit`
- Prefix boolean variables with verbs: `isLoading`, `hasError`, `canSubmit`
- Prefix custom hooks with `use`: `useAuth`, `useForm`
- Use complete words over abbreviations except for:
		- `err` (error)
		- `req` (request)
		- `res` (response)
		- `props` (properties)
		- `ref` (reference)
```

---

## Core Features Status

### ✅ Implemented Features

#### Authentication System — Implemented, pending verification

* **Multi-Provider Auth**: Email/password and Google OAuth integration
* **Session Management**: Secure session handling with automatic refresh
* **User Profile Sync**: Automatic profile creation and Google avatar integration
* **Multi-Account Support**: Account switching and conflict resolution
* **Status Management**: Online/offline presence tracking
* **Implementation**: `src/contexts/AuthContext.tsx`, `src/lib/auth/`

#### Company Management — Partially Implemented

* **Multi-Tenant Architecture**: Company-based workspace isolation
* **Role-Based Access**: Admin and member role management
* **Company Context**: Global company state management
* **User Management**: Company user listing and profile management
* **Implementation**: `src/contexts/CompanyContext.tsx`, `src/repositories/`

#### Dashboard System — Partially Implemented

* **Main Dashboard**: Welcome screen with company overview
* **Quick Links**: Navigation to key features
* **Admin Panel**: Administrative functions for company admins
* **Company Overview**: User count, activity metrics
* **Implementation**: `src/app/(dashboard)/dashboard/`

#### Real-Time Messaging — Need integration on spaces, user, handle events etc...

* **Chat System**: Real-time messaging with Supabase Realtime
* **Message Components**: Composer, feed, and item components
* **Conversation Management**: Multiple conversation support
* **Room-Based Messaging**: Location-specific chat functionality
* **Implementation**: `src/components/messaging/`, `src/hooks/realtime/`

#### User Presence System — Implemented - needs verification

* **Real-Time Presence**: Live user status tracking
* **Presence Context**: Global presence state management
* **Status Updates**: Automatic online/offline detection
* **Implementation**: `src/contexts/PresenceContext.tsx`, `src/hooks/useUserPresence.ts`

#### Avatar System (CRITICAL CONSOLIDATION NEEDED)

* **Status**: Functionally working but architecturally problematic
* **Critical Issue**: 11 different avatar components causing maintenance chaos
* **Current Duplicates**:

  * 5 UI avatar components (`avatar.tsx`, `enhanced-avatar.tsx`, `enhanced-avatar-v2.tsx`, `avatar-with-fallback.tsx`, `status-avatar.tsx`)
  * 2 profile avatar components (`ProfileAvatar.tsx`, `UploadableAvatar.tsx`)
  * 3 floor-plan avatar components (`user-avatar.tsx`, `UserAvatarPresence.tsx`, `ModernUserAvatar.tsx`)
  * 1 showcase component (`AvatarShowcase.tsx`)
* **Working Parts**:

  * Avatar utilities in `src/lib/avatar-utils.ts` (excellent, no duplicates)
  * Google OAuth avatar sync (working correctly)
  * Basic avatar display across all components
  * Upload functionality in some components
* **Consolidation Plan**: Reduce from 11 to 7 components (36% reduction)

  * **Canonical Display**: `EnhancedAvatarV2` (most comprehensive)
  * **Canonical Upload**: `UploadableAvatar` (advanced upload features)
* **Developer Impact**: Major confusion about which component to use
* **Implementation**: Multiple scattered implementations need consolidation

#### Invitation System (EXCELLENT ARCHITECTURE)

* **Status**: Well-architected with minor restoration needs
* **Architecture Quality**: Exemplary organization, zero duplicates found
* **Current Components** (all well-structured):

  * `invitation-management.tsx` - Container component
  * `invite-user-dialog.tsx` - Creation interface
  * `invitation-list.tsx` - Management interface
  * `invitation-error-display.tsx` - Error handling
* **Working Parts**:

  * Admin invitation management interface (fully functional)
  * Comprehensive error handling system
  * Token generation and validation (working correctly)
  * Invitation data structures and validation
* **Minor Issues**: Invitation acceptance flow needs restoration
* **Architecture Note**: This system serves as a reference model for other features
* **Implementation**: `src/components/invitation/`, `src/app/admin/invitations/`, `src/lib/invitation-error-handler.ts`

#### Virtual Floor Plan

* **Status**: Basic structure in place, needs development
* **Current State**: Component structure exists, interactive features planned
* **Implementation**: `src/components/floor-plan/`

### 📋 Planned Features

#### AI Integration

* **Meeting Transcription**: AI-powered meeting notes and transcription
* **Task Extraction**: Automatic task identification from conversations
* **Smart Summaries**: AI-generated meeting and conversation summaries
* **Status**: Not yet implemented

#### Advanced Communication

* **WebRTC Integration**: Video and voice calling capabilities
* **Screen Sharing**: Collaborative screen sharing features
* **File Sharing**: Document and media sharing system
* **Status**: Planned for future development

#### Global Blackboard

* **Company Announcements**: Company-wide communication system
* **Notification System**: Advanced notification management
* **Status**: Basic notification system exists, needs expansion

## User Types & Capabilities

### Company Administrators

* **Roles**: `admin`
* **Capabilities**:

  * Manage company settings and user roles
  * Access admin panel and invitation management
  * View company overview and user metrics
  * Full dashboard access with admin-specific features
* **Implementation**: Role-based access control in `src/contexts/CompanyContext.tsx`

### Team Members

* **Roles**: `member`
* **Capabilities**:

  * Access main dashboard and company overview
  * Participate in real-time messaging
  * Update profile and presence status
  * Navigate virtual office interface
* **Implementation**: Standard user permissions and dashboard access

### New Employees (via Invitation)

* **Capabilities**:

  * Receive invitation links (when system is fully restored)
  * Complete signup process with company assignment
  * Automatic profile creation and onboarding
* **Status**: Invitation acceptance flow needs restoration

## Key User Workflows

### 1. User Authentication & Onboarding

* **Status**: Implemented with known bugs
* **Flow**: Registration → Email/Google auth → Profile creation → Company assignment
* **Implementation**: `src/app/(auth)/`, `src/contexts/AuthContext.tsx`

### 2. Company Dashboard Navigation

* **Status**: Partially Implemented
* **Flow**: Login → Dashboard → Quick links → Feature access
* **Implementation**: `src/app/(dashboard)/dashboard/`

### 3. Real-Time Communication

* **Status**: Needs verification
* **Flow**: Join room → Send messages → Real-time updates → Presence tracking
* **Implementation**: `src/components/messaging/`, `src/hooks/realtime/`

### 4. Invitation Management (Admin)

* **Status**: Partially working
* **Flow**: Admin panel → Create invitation → Send link → User acceptance
* **Issues**: Invitation acceptance flow needs restoration

### 5. Avatar Management

* **Status**: Partially working
* **Flow**: Profile → Upload/sync avatar → Display across platform
* **Issues**: Multiple implementations need consolidation

## Technical Architecture

### Frontend Architecture

* **Framework**: Next.js 15.3.0 with App Router and React 19.1.0
* **State Management**: TanStack Query + React Context
* **UI Components**: Shadcn/UI with Radix primitives
* **Styling**: TailwindCSS 4.1.3 with custom theme

### Backend Architecture

* **Database**: Supabase PostgreSQL with Row Level Security
* **Authentication**: Supabase Auth with multi-provider support
* **Real-Time**: Supabase Realtime for live updates
* **File Storage**: AWS S3 integration for avatar uploads

### Data Patterns

* **Repository Pattern**: Abstracted data access layer
* **Multi-Tenancy**: Company-based data isolation
* **Type Safety**: Comprehensive TypeScript throughout

# Technical Stack & Guidelines

## Core Technologies

* **Framework**: Next.js 15.3.0 with App Router and TypeScript 5
* **Runtime**: React 19.1.0 with React DOM 19.1.0
* **Database**: Supabase (PostgreSQL) with real-time subscriptions and Row Level Security (RLS)
* **Authentication**: Supabase Auth with SSR support (@supabase/ssr v0.6.1)
* **Styling**: TailwindCSS 4.1.3 + Shadcn/UI components with CSS custom properties
* **State Management**: TanStack Query v5.72.2 + React Context patterns
* **Real-time**: Supabase Realtime for live updates and presence
* **Testing**: Vitest 3.1.1 + Playwright 1.51.1 + Testing Library 16.3.0

## Key Libraries

* **UI Components**: Radix UI primitives (v1.1.x–v2.1.x) via Shadcn/UI
* **Icons**: Lucide React v0.487.0
* **Date Handling**: date-fns v4.1.0
* **Utilities**: clsx v2.1.1, tailwind-merge v3.2.0, class-variance-authority v0.7.1
* **Canvas**: React Zoom Pan Pinch v3.7.0 for interactive floor plans
* **Notifications**: Sonner v2.0.3 for toast messages
* **Theming**: next-themes v0.4.6 for dark/light mode
* **File Handling**: Sharp v0.34.1 for image optimization
* **Cloud Storage**: AWS SDK v2.1692.0 for file uploads

## Architecture Patterns

* **Repository Pattern**: Data access abstraction in `src/repositories/` with interfaces and implementations
* **Context + Hooks**: State management with React Context and custom hooks in `src/hooks/`
* **Server Components**: Next.js App Router with server-side rendering optimization
* **Component-Driven Development**: Organized by feature domains with atomic design principles
* **Query-Mutation Pattern**: TanStack Query for data fetching with separate query and mutation hooks
* **Provider Pattern**: Context providers in `src/providers/` and `src/contexts/`
* **Middleware Pattern**: Next.js middleware for authentication and routing protection

## Development Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack (Next.js 15 optimization)
npm run build            # Production build with static optimization
npm run start            # Start production server

# Code Quality
npm run lint             # ESLint check with Next.js configuration
```

## Build Configuration

* **Next.js Config**: Minimal configuration with TypeScript support
* **TypeScript**: Strict mode enabled with `"target": "ES2022"`, `"moduleResolution": "bundler"`, and path aliases (see below)
* **Tailwind**: Custom theme with CSS variables and dark mode support
* **Vitest**: JSdom environment with React plugin and path aliases
* **ESLint**: Next.js configuration with TypeScript parser and import plugin

### Path Aliases (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## Database Strategy

* **Primary**: Supabase PostgreSQL with Row Level Security (RLS) for multi-tenant isolation
* **Real-time**: Supabase Realtime for live updates, presence, and messaging
* **Schema**: Company-based multi-tenancy with proper data isolation via RLS policies
* **Migrations**: SQL files in `src/migrations/` for schema versioning
* **Authentication Integration**: Automatic user creation via database triggers

### User Authentication Flow

When users sign up with username/password, Supabase Auth triggers automatic user record creation:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	-- Insert into public.users, letting 'id' default, and setting 'supabase_uid'
	INSERT INTO public.users (supabase_uid, email, display_name, role, status, preferences, avatar_url)
VALUES ( NEW.id,
				 NEW.email,
				 COALESCE(NEW.raw_user_meta_data->>'displayName', NEW.email),
				 'member',
				 'online',
				 '{"theme":"light","notifications":true}',
				 NEW.raw_user_meta_data->>'avatar_url')
ON CONFLICT (supabase_uid) DO NOTHING;

	RETURN NEW;
END;
$$;

-- Trigger to call the function after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
	AFTER INSERT ON auth.users
	FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Data Access Patterns

* **Repository Pattern**: Abstracted data access in `src/repositories/`
* **Interface-Based**: Separate interfaces and implementations for testability
* **Query Hooks**: TanStack Query hooks in `src/hooks/queries/`
* **Mutation Hooks**: Data modification hooks in `src/hooks/mutations/`
* **Real-time Hooks**: Subscription hooks in `src/hooks/realtime/`

### Environment Variables

* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `NEXTAUTH_URL` or equivalent if used

### Realtime Glossary

* **Room**: A logical channel for location-specific chat and presence
* **Conversation**: A message thread between one or more participants
* **Presence**: User connection state propagated via Supabase Realtime

---

# Project Structure & Organization

## Source Code Organization

```
src/
├── app/                 # Next.js App Router pages and layouts
│   ├── (auth)/         # Authentication routes (grouped)
│   ├── (dashboard)/    # Main dashboard routes (grouped)
│   ├── admin/          # Admin-specific routes
│   ├── api/            # API route handlers
│   ├── avatar-demo/    # Avatar testing and demo pages
│   ├── debug/          # Debug and development tools
│   ├── join/           # Invitation acceptance routes
│   ├── tools/          # Development utilities
│   ├── globals.css     # Global styles and CSS variables
│   ├── layout.tsx      # Root layout component
│   └── page.tsx        # Home page component
├── components/         # React components organized by feature
│   ├── ui/             # Shadcn/UI base components (Button, Dialog, etc.)
│   ├── auth/           # Authentication components
│   ├── dashboard/      # Dashboard-specific components
│   ├── floor-plan/     # Virtual office floor plan components
│   ├── invitation/     # Invitation system components
│   ├── messaging/      # Chat and communication components
│   ├── profile/        # User profile and avatar components
│   ├── providers/      # Component-level providers
│   ├── search/         # Search functionality components
│   ├── shell/          # Layout and navigation components
│   ├── ErrorBoundary.tsx # Global error boundary
│   ├── nav.tsx         # Navigation component
│   ├── shell.tsx       # Main shell component
│   └── theme-toggle.tsx # Theme switching component
├── contexts/           # React Context providers for global state
│   ├── messaging/      # Messaging-specific contexts
│   ├── AuthContext.tsx # Authentication state management
│   ├── CompanyContext.tsx # Company data management
│   ├── PresenceContext.tsx # User presence management
│   └── SearchContext.tsx # Search state management
├── hooks/              # Custom React hooks organized by purpose
│   ├── queries/        # TanStack Query data fetching hooks
│   ├── mutations/      # Data mutation and update hooks
│   ├── realtime/       # Supabase real-time subscription hooks
│   ├── useAuthErrorHandler.ts # Authentication error handling
│   ├── useConversations.ts # Messaging conversations
│   ├── useImageUpload.ts # File upload functionality
│   ├── useInvitationOperation.ts # Invitation operations
│   ├── useLocalStorage.ts # Local storage management
│   ├── useMessages.ts  # Message handling
│   ├── useNotification.ts # Notification system
│   ├── useProtectedRoute.ts # Route protection
│   ├── useSession.ts   # Session management
│   └── useUserPresence.ts # User presence tracking
├── lib/                # Utility functions and configurations
│   ├── auth/           # Authentication utilities and helpers
│   ├── services/       # Business logic services
│   ├── supabase/       # Supabase client and database utilities
│   ├── uploads/        # File upload utilities
│   ├── api.ts          # API client configuration
│   ├── avatar-utils.ts # Avatar handling utilities
│   ├── messaging-api.ts # Messaging API utilities
│   └── utils.ts        # General utility functions
├── providers/          # Application-level providers
│   ├── query-provider.tsx # TanStack Query provider
│   └── theme-provider.tsx # Theme provider setup
├── repositories/       # Data access layer with repository pattern
│   ├── interfaces/     # Repository interface definitions
│   ├── implementations/ # Concrete repository implementations
│   └── getSupabaseRepositories.ts # Repository factory
├── types/              # TypeScript type definitions
│   ├── auth.ts         # Authentication types
│   ├── common.ts       # Common/shared types
│   ├── database.ts     # Database schema types
│   ├── messaging.ts    # Messaging system types
│   └── ui.ts           # UI component types
├── utils/              # General utility functions
│   ├── debug-logger.ts # Development logging utilities
│   └── user-type-adapters.ts # Type conversion utilities
├── migrations/         # Database migration files
│   ├── 00001_add_current_space_id.sql
│   ├── 20250405_add_user_presence_rls.sql
│   └── fix_avatar_rls_policies.sql
├── __tests__/          # Test files (unit tests)
│   └── realtime-presence.test.ts
└── middleware.ts       # Next.js middleware for auth and routing
```

## Naming Conventions

### File Naming

* **Components**: PascalCase for React component files (`UserProfile.tsx`)
* **Utilities**: kebab-case for utility files (`avatar-utils.ts`)
* **Hooks**: kebab-case starting with `use-` (`use-user-presence.ts`)
* **Types**: descriptive filenames (`database.ts`, `messaging.ts`)
* **Tests**: Match source file with `.test.ts` or `.spec.ts` suffix

### Code Naming

* **Components**: PascalCase React components (`UserProfile`, `MessageItem`)
* **Functions**: camelCase for functions and methods (`getUserProfile`, `sendMessage`)
* **Variables**: camelCase for variables and properties (`currentUser`, `messageList`)
* **Constants**: UPPER\_SNAKE\_CASE for constants (`API_BASE_URL`, `MAX_FILE_SIZE`)
* **Types/Interfaces**: PascalCase for TypeScript definitions (`User`, `MessageData`)

## Import Patterns

### Path Aliases

* **@/**: Points to `src/` directory for clean imports
* **Absolute Imports**: Preferred over relative imports for better maintainability
* **Consistent Paths**: Use same import style throughout the project

---
