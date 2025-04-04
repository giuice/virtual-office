# Technical Context

## Tech Stack Overview

### Core Technologies
- **Frontend Framework**: Next.js 15.2.4 with App Router
- **Language**: TypeScript 5
- **Database**: Supabase with PostgreSQL
- **Authentication**: Supabase Auth
- **Styling**: TailwindCSS 4.0 + Shadcn/UI

### State Management & Data Fetching
- **Server State**: TanStack Query (React Query) v5
- **Client State**: Zustand
- **Real-time**: Supabase Realtime + Socket.IO

### UI Components
- **Component Library**: Shadcn/UI (based on Radix UI)
- **Icons**: Lucide React
- **Canvas/Drawing**: Konva + React Konva
- **Date Handling**: date-fns v4
- **Toast Notifications**: Sonner

## Architecture Overview

### Repository Pattern
- Clear separation between data access and business logic
- Interfaces defined in `src/repositories/interfaces/`
- Implementations in `src/repositories/implementations/supabase/`

### Project Structure
```
src/
├── app/             # Next.js App Router pages
├── components/      # React components
├── config/         # Configuration files
├── contexts/       # React contexts
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── providers/      # React providers
├── repositories/   # Repository pattern implementations
└── types/          # TypeScript type definitions
```

### Key Design Patterns
- **Repository Pattern**: Data access abstraction
- **Context + Hooks Pattern**: State management
- **Atomic Design**: UI component organization
- **Server Components**: Next.js performance optimization

## Database Schema
- Companies
- Users
- Spaces (Rooms)
- Space Reservations
- Conversations
- Messages
- Message Attachments
- Message Reactions
- Announcements
- Meeting Notes
- Meeting Note Action Items
- Invitations

## API Structure
- RESTful endpoints using Next.js App Router
- Repository pattern for data access
- Strong typing with TypeScript
- Error handling middleware

## Real-time Features
- Chat messaging
- User presence
- Space updates
- Notifications

## Testing & Quality
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- React Query DevTools for debugging

## Performance Considerations
- Server Components for initial load
- React Query for data caching
- Image optimization with Next.js
- Tailwind for CSS optimization

## Security
- Supabase RLS policies
- Type-safe database queries
- Protected API routes
- Authentication middleware

## Development Workflow
- TypeScript for type safety
- ESLint + Prettier for code quality
- Repository pattern for data access
- Component-driven development
