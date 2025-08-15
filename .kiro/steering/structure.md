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
```## Key D
irectories

### `/app` - Next.js App Router
- **Route Groups**: Parentheses for logical organization without affecting URL structure
- **API Routes**: RESTful endpoints in `/api` directory with proper HTTP methods
- **Server Components**: Default server-side rendering for optimal performance
- **Special Routes**: Debug tools, admin panels, and invitation flows
- **Layout System**: Nested layouts for consistent UI structure

### `/components` - UI Components
- **ui/**: Base Shadcn/UI components (Button, Dialog, Input, etc.)
  - **CRITICAL ISSUE**: 5 duplicate avatar components need consolidation
  - **Canonical Avatar**: Use `enhanced-avatar-v2.tsx` for display avatars
- **Feature Folders**: Domain-specific components (auth, messaging, profile)
  - **messaging/**: Contains 2 duplicate pairs due to naming inconsistency
  - **profile/**: Contains 2 avatar upload components (use `UploadableAvatar.tsx`)
  - **floor-plan/**: Contains 3 specialized avatar components that need refactoring
- **Shell Components**: Layout, navigation, and structural components
- **Provider Components**: Component-level context providers
- **Atomic Design**: Components organized by complexity and reusability

#### Component Quality Assessment (December 2024 Audit)
- **Total Components Analyzed**: 50+ components across 11 directories
- **Duplicates Identified**: 11 avatar components, 4 messaging components
- **Consolidation Needed**: Avatar system (36% reduction possible)
- **Exemplary Organization**: Invitation components (zero duplicates, reference model)

### `/contexts` - State Management
- **Global State**: React Context providers for application-wide state
- **Feature Contexts**: Domain-specific state management (messaging, auth)
- **Hook Integration**: Each context paired with custom hook for consumption
- **Type Safety**: Comprehensive TypeScript interfaces for all context values

### `/hooks` - Custom Hooks ✅ EXCELLENT ORGANIZATION
- **queries/**: TanStack Query hooks for data fetching with caching
- **mutations/**: Data modification hooks with optimistic updates
- **realtime/**: Supabase real-time subscription management
- **Feature Hooks**: Domain-specific logic encapsulation
- **Utility Hooks**: Reusable functionality (localStorage, notifications)

#### Hooks Quality Assessment (December 2024 Audit)
- **Organization Quality**: ✅ Excellent - zero duplicates found
- **Separation of Concerns**: ✅ Clear separation between queries, mutations, and real-time
- **Error Handling**: ✅ Comprehensive error handling throughout
- **Performance**: ✅ Proper memoization and optimization
- **Architecture**: ✅ Use as reference model for other systems
- **Minor Issue**: Empty `useSocketEvents.ts` file should be removed

### `/lib` - Utilities and Configuration
- **supabase/**: Database client configuration and utilities
- **auth/**: Authentication helpers and session management
- **services/**: Business logic services and API clients
- **uploads/**: File handling and cloud storage utilities
- **Feature Libraries**: Domain-specific utility functions

### `/repositories` - Data Access Layer ✅ EXCELLENT ARCHITECTURE
- **Interface-Based**: Abstract repository interfaces for testability
- **Implementation Separation**: Concrete implementations for different data sources
- **Factory Pattern**: Repository creation and dependency injection
- **Type Safety**: Comprehensive typing for all data operations

#### Repository Quality Assessment (December 2024 Audit)
- **Architecture Quality**: ✅ Excellent - clean repository pattern implementation
- **Duplication Status**: ✅ Zero duplicates found
- **Pattern Consistency**: ✅ Consistent patterns across all implementations
- **Error Handling**: ✅ Strong error handling and type safety
- **Best Practice**: ✅ Use as architectural reference for other systems
- **Minor Issue**: Duplicate export in `implementations/supabase/index.ts`

### `/types` - TypeScript Definitions
- **Domain Types**: Feature-specific type definitions
- **Database Types**: Generated from Supabase schema
- **API Types**: Request/response interfaces
- **UI Types**: Component prop and state interfaces
- **Common Types**: Shared type definitions across features

## Naming Conventions

### File Naming
- **Components**: PascalCase for React components (`UserProfile.tsx`)
- **Utilities**: kebab-case for utility files (`avatar-utils.ts`)
- **Hooks**: camelCase starting with "use" (`useUserPresence.ts`)
- **Types**: kebab-case with descriptive names (`database.ts`, `messaging.ts`)
- **Tests**: Match source file with `.test.ts` or `.spec.ts` suffix

### Code Naming
- **Components**: PascalCase React components (`UserProfile`, `MessageItem`)
- **Functions**: camelCase for functions and methods (`getUserProfile`, `sendMessage`)
- **Variables**: camelCase for variables and properties (`currentUser`, `messageList`)
- **Constants**: UPPER_SNAKE_CASE for constants (`API_BASE_URL`, `MAX_FILE_SIZE`)
- **Types/Interfaces**: PascalCase for TypeScript definitions (`User`, `MessageData`)

## Import Patterns

### Import Organization
```typescript
// 1. External library imports
import React from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal imports with @/ alias
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

// 3. Relative imports (when necessary)
import './component.css';
```

### Path Aliases
- **@/**: Points to `src/` directory for clean imports
- **Absolute Imports**: Preferred over relative imports for better maintainability
- **Consistent Paths**: Use same import style throughout the project

## Component Organization

### Component Structure
- **Single Responsibility**: One component per file with clear purpose
- **Feature Grouping**: Related components in same directory
- **Composition**: Prefer composition over inheritance
- **Props Interface**: TypeScript interfaces for all component props

### Component Patterns
- **Server Components**: Default for Next.js App Router pages
- **Client Components**: Marked with 'use client' for interactivity
- **Compound Components**: Complex UI patterns with multiple related components
- **Higher-Order Components**: Reusable logic patterns (rare, prefer hooks)

## Best Practices

### Code Organization
- **Feature-First**: Organize by business domain rather than technical layer
- **Colocation**: Keep related files close together
- **Clear Boundaries**: Separate concerns between layers
- **Consistent Structure**: Follow established patterns throughout project

### Development Workflow
- **Type Safety**: Comprehensive TypeScript usage with strict configuration
- **Testing**: Unit tests for utilities, integration tests for components
- **Code Quality**: ESLint and Prettier for consistent formatting
- **Documentation**: Clear comments and README files for complex features