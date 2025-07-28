# Technical Stack & Guidelines

## Core Technologies
- **Framework**: Next.js 15.3.0 with App Router and TypeScript 5
- **Database**: Supabase (PostgreSQL) with real-time subscriptions
- **Authentication**: Supabase Auth
- **Styling**: TailwindCSS 4.1.3 + Shadcn/UI components
- **State Management**: TanStack Query v5 + React Context
- **Real-time**: Supabase Realtime + Socket.IO
- **Testing**: Vitest + Playwright + Testing Library

## Key Libraries
- **UI Components**: Radix UI primitives via Shadcn/UI
- **Icons**: Lucide React
- **Date Handling**: date-fns v4
- **Utilities**: clsx, tailwind-merge, class-variance-authority
- **Canvas**: React Zoom Pan Pinch for interactive floor plans
- **Notifications**: Sonner for toast messages

## Architecture Patterns
- **Repository Pattern**: Data access abstraction in `src/repositories/`
- **Context + Hooks**: State management with custom hooks
- **Server Components**: Next.js optimization for initial loads
- **Atomic Design**: Component organization by complexity

## Common Commands
```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run build           # Production build
npm run start           # Start production server

# Testing
npm run test            # Run Vitest unit tests
npm run test:watch      # Watch mode for unit tests
npm run test:ui         # Vitest UI interface
npm run test:api        # Run Playwright API tests
npm run test:all        # Run all tests sequentially

# Code Quality
npm run lint            # ESLint check
```

## Database Strategy
- **Primary**: Supabase PostgreSQL with Row Level Security (RLS)
- **Real-time**: Supabase Realtime for live updates
- **Schema**: Company-based multi-tenancy with proper isolation
- **Migrations**: SQL files in `src/migrations/`

## Performance Considerations
- Server Components for initial page loads
- TanStack Query for client-side caching
- Image optimization with Next.js
- Tailwind CSS optimization and purging