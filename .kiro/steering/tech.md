# Technical Stack & Guidelines

## Core Technologies
- **Framework**: Next.js 15.3.0 with App Router and TypeScript 5
- **Runtime**: React 19.1.0 with React DOM 19.1.0
- **Database**: Supabase (PostgreSQL) with real-time subscriptions and Row Level Security (RLS)
- **Authentication**: Supabase Auth with SSR support (@supabase/ssr v0.6.1)
- **Styling**: TailwindCSS 4.1.3 + Shadcn/UI components with CSS custom properties
- **State Management**: TanStack Query v5.72.2 + React Context patterns
- **Real-time**: Supabase Realtime for live updates and presence
- **Testing**: Vitest 3.1.1 + Playwright 1.51.1 + Testing Library 16.3.0

## Key Libraries
- **UI Components**: Radix UI primitives (v1.1.x-v2.1.x) via Shadcn/UI
- **Icons**: Lucide React v0.487.0
- **Date Handling**: date-fns v4.1.0
- **Utilities**: clsx v2.1.1, tailwind-merge v3.2.0, class-variance-authority v0.7.1
- **Canvas**: React Zoom Pan Pinch v3.7.0 for interactive floor plans
- **Notifications**: Sonner v2.0.3 for toast messages
- **Theming**: next-themes v0.4.6 for dark/light mode
- **File Handling**: Sharp v0.34.1 for image optimization
- **Cloud Storage**: AWS SDK v2.1692.0 for file uploads

## Architecture Patterns
- **Repository Pattern**: Data access abstraction in `src/repositories/` with interfaces and implementations
- **Context + Hooks**: State management with React Context and custom hooks in `src/hooks/`
- **Server Components**: Next.js App Router with server-side rendering optimization
- **Component-Driven Development**: Organized by feature domains with atomic design principles
- **Query-Mutation Pattern**: TanStack Query for data fetching with separate query and mutation hooks
- **Provider Pattern**: Context providers in `src/providers/` and `src/contexts/`
- **Middleware Pattern**: Next.js middleware for authentication and routing protection

## Development Commands
```bash
# Development
npm run dev              # Start dev server with Turbopack (Next.js 15 optimization)
npm run build           # Production build with static optimization
npm run start           # Start production server

# Testing
npm run test            # Run Vitest unit tests (excludes Playwright API tests)
npm run test:watch      # Watch mode for unit tests with hot reload
npm run test:ui         # Vitest UI interface for interactive testing
npm run test:api        # Run Playwright API tests for integration testing
npm run test:api:debug  # Debug Playwright tests with browser UI
npm run test:api:ui     # Playwright test runner UI
npm run test:all        # Run all tests sequentially (custom script)

# Code Quality
npm run lint            # ESLint check with Next.js configuration
```

## Build Configuration
- **Next.js Config**: Minimal configuration with TypeScript support
- **TypeScript**: Strict mode enabled with ES2017 target and bundler module resolution
- **Tailwind**: Custom theme with CSS variables and dark mode support
- **Vitest**: JSdom environment with React plugin and path aliases
- **ESLint**: Next.js configuration with TypeScript parser and import plugin

## Database Strategy
- **Primary**: Supabase PostgreSQL with Row Level Security (RLS) for multi-tenant isolation
- **Real-time**: Supabase Realtime for live updates, presence, and messaging
- **Schema**: Company-based multi-tenancy with proper data isolation via RLS policies
- **Migrations**: SQL files in `src/migrations/` for schema versioning
- **Authentication Integration**: Automatic user creation via database triggers

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
- **Repository Pattern**: Abstracted data access in `src/repositories/`
- **Interface-Based**: Separate interfaces and implementations for testability
- **Query Hooks**: TanStack Query hooks in `src/hooks/queries/`
- **Mutation Hooks**: Data modification hooks in `src/hooks/mutations/`
- **Real-time Hooks**: Subscription hooks in `src/hooks/realtime/`

## Performance Considerations
- **Server Components**: Next.js App Router for initial page loads and SEO optimization
- **Client-Side Caching**: TanStack Query v5 for intelligent data caching and background updates
- **Image Optimization**: Next.js built-in image optimization with Sharp v0.34.1
- **CSS Optimization**: Tailwind CSS 4.1.3 with automatic purging and CSS variables
- **Bundle Optimization**: Turbopack for fast development builds
- **Real-time Efficiency**: Supabase Realtime with selective subscriptions
- **Code Splitting**: Automatic route-based code splitting with Next.js
- **Static Generation**: ISR (Incremental Static Regeneration) where applicable

## Security Best Practices
- **Row Level Security**: Supabase RLS policies for multi-tenant data isolation
- **Authentication**: Supabase Auth with secure session management
- **Type Safety**: Strict TypeScript configuration with comprehensive type checking
- **Input Validation**: Server-side validation for all API endpoints
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Environment Variables**: Secure configuration management with .env files

## Development Best Practices
- **Code Organization**: Feature-based directory structure with clear separation of concerns
- **Testing Strategy**: Unit tests with Vitest, integration tests with Playwright
- **Type Definitions**: Comprehensive TypeScript interfaces in `src/types/`
- **Error Handling**: Centralized error handling with proper logging
- **Code Quality**: ESLint configuration with TypeScript rules and import organization
- **Git Workflow**: Conventional commits and feature branch development

## System Architecture Quality Assessment (December 2024 Audit)

### ✅ Exemplary Architecture (Reference Models)
- **Authentication System**: Industry best practices with zero duplicates
- **Hooks Directory**: Excellent organization with clear separation of concerns
- **Repository Pattern**: Clean interface-based implementation
- **Library Directory**: Well-organized utilities with no duplicates
- **Invitation System**: Comprehensive error handling and validation

### 🔧 Areas Requiring Consolidation
- **Avatar Components**: 11 components need consolidation to 7 (36% reduction)
- **Messaging Components**: 4 duplicates due to naming inconsistency

### Performance Metrics (Audit Results)
- **Avatar System**: 100 avatar resolutions in <100ms ✅
- **Invitation System**: 1000 validations in <50ms ✅
- **Authentication System**: 1000 session validations in <100ms ✅
- **Overall Test Coverage**: 71 comprehensive tests across 3 major systems ✅

## Code Quality Standards

### Duplication Prevention
- **Avatar Components**: Use `EnhancedAvatarV2` for display, `UploadableAvatar` for uploads
- **Messaging Components**: Use PascalCase versions (`ConversationList.tsx`, `RoomMessaging.tsx`)
- **Authentication**: Use existing comprehensive auth system (never recreate)
- **Hooks**: Check `src/hooks/` directory before creating new hooks
- **Database Operations**: Always use repository pattern, never raw queries

### Architectural Patterns to Follow
- **Authentication System Pattern**: Use as gold standard for new systems
- **Hooks Organization**: Follow `/queries`, `/mutations`, `/realtime` structure
- **Repository Pattern**: Interface-based design with proper abstraction
- **Error Handling**: Centralized error handling with user-friendly messages