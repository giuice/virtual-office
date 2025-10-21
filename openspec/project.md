# Project Context

## Purpose
Virtual Office is a digital workspace designed to enhance collaboration for remote and hybrid teams by simulating a physical office environment. It provides an interactive, user-friendly platform for seamless connection, communication, and collaboration.

**Key Goals:**
- Enable remote teams to collaborate as effectively as in-person teams
- Provide real-time presence awareness and communication tools
- Simulate physical office dynamics through interactive floor plans and spaces
- Support company management, invitations, and role-based access control

**Target Audience:** Remote workers, hybrid teams, and organizations seeking efficient digital collaboration tools.

## Tech Stack

### Frontend
- **Framework:** Next.js 15.3.0 (App Router, Server Components, Route Handlers, Server Actions)
- **UI Runtime:** React 19.1.0 / React DOM 19.1.0
- **Language:** TypeScript 5 (strict mode)
- **Styling:** TailwindCSS 4.1.3, shadcn/ui, Radix UI
- **State Management:** TanStack Query v5 + React Context
- **Canvas/Graphics:** Konva (for interactive floor plans)

### Backend & Data
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth with SSR (@supabase/ssr v0.6.1)
- **Real-time:** Supabase Realtime / Socket.IO
- **Security:** Row Level Security (RLS) policies

### Testing
- **Unit/Integration:** Vitest 3, Testing Library
- **E2E:** Playwright

## Project Conventions

### Code Style
- **Strict TypeScript:** Provide explicit types for props, state, params, and returns
- **Interfaces vs Types:** Prefer interfaces for object shapes; `type` for unions and function signatures
- **File Size:** Keep files under ~500 lines; split with cohesive subcomponents or hooks
- **Separation of Concerns:** Business logic in utilities/services, UI in components, data access via repositories

### Naming Conventions
- **PascalCase:** Exported React components and their filenames
- **kebab-case:** Directories and non-component filenames
- **camelCase:** Variables, functions, methods, hooks
- **Hook filenames:** `use-*.ts`
- **UPPER_SNAKE_CASE:** Environment variables and global constants
- **Prefix patterns:** `handle*` for handlers; `is/has/can` for booleans; `use*` for hooks
- **Abbreviations:** Prefer full words; allowed: `err`, `req`, `res`, `props`, `ref`

### Architecture Patterns

#### Repository Pattern
- Repository pattern in `src/repositories/`
- Keep interfaces and implementations separate
- In API routes, construct repositories with the **server** Supabase client instance
- Query hooks in `src/hooks/queries/`
- Mutation hooks in `src/hooks/mutations/`
- Realtime in `src/hooks/realtime/`

#### Supabase Client Usage (Critical)
- **Never use the browser Supabase client in API routes**
- Use `src/lib/supabase/server-client.ts` in server code and API routes
- Use `src/lib/supabase/browser-client.ts` only in Client Components
- In API routes call `createSupabaseServerClient()` and pass that instance to repositories
- **Reason:** `auth.uid()` requires server context; otherwise RLS fails

#### Type Registry & Change Control
- Canonical types live in `src/types/`: `auth.ts`, `common.ts`, `database.ts`, `messaging.ts`, `ui.ts`
- **Do not create new types** if a semantic equivalent exists; extend existing ones
- Allowed user roles: `type UserRole = 'admin' | 'member'` (do not add roles)
- To change a type, edit the existing file and document changes in PR

#### Anti-Duplication Protocol
1. Search the codebase for existing components/hooks/types that match the intent
2. If found, reuse or extend; do not create a new file
3. If extending, specify the exact file and exported name you will modify
4. Creating new files is allowed only when no suitable target exists

### Testing Strategy
- **Unit Tests:** Vitest 3 for utilities, hooks, services
- **Integration Tests:** Testing Library for component behavior
- **E2E Tests:** Playwright for critical user flows
- **Test Location:** `__tests__/` directory
- **Coverage Goals:** Focus on critical paths, business logic, and user interactions
- **Mocking:** Mock Supabase clients and external services in tests

### Git Workflow
- **Main Branch:** `main` (production-ready code)
- **Feature Branches:** `feature/[description]` or `feature/[epic]-[task]`
- **Commit Messages:** Clear, descriptive commits following conventional commit format
- **Pull Requests:** Required for all changes; include tests and documentation updates

### AI Assistant Workflow
When working with AI assistants on code changes, follow this sequence:

1. **Restate Scope:** Summarize the requested change and acceptance criteria (2–4 lines)
2. **Anti-Duplication Protocol:** Search for existing components/hooks/types; reuse vs extend
3. **Patch Plan:** List exact files to touch with paths; map each change to acceptance criteria
4. **Type & Contract Check:** List existing types/exports from `src/types/*`; note RLS/auth constraints
5. **Files Size:** Keep files < ~500 lines; extract hooks where effects are complex
6. **Tests First:** Point to existing tests or add new test paths with example assertions
7. **Local Verification Steps:** Provide exact commands (`npm run type-check`, `lint`, `test`) and manual check instructions
8. **Response Format:** Duplication check, patch plan, type usage, deprecations, confirmation request

**Completion Rule:** Never state or imply "done", "fixed", or "resolved". Always end with: **Status: Pending user confirmation**

### Planning Mode (For Major Changes)
Activate when requesting a plan, roadmap, implementation strategy, refactor plan, or debugging plan.

**Output:** GitHub-flavored Markdown report titled `# {FEATURE}_IMPLEMENTATION_PLAN`

**Required Sections:**
1. Executive Summary
2. Research Findings (cite sources; mark items needing research as `Further Research:`)
3. Implementation Strategy
4. Repository and File Structure (ASCII tree, change-impact table)
5. Detailed Action Plan (checkboxes with paths, symbols, rationale, dependencies, testing)
6. Risk Mitigation
7. Success Criteria
8. Open Questions and Assumptions

**Constraints:**
- Planning only (no code, no diffs, no commands)
- Prescriptive and step-by-step for junior developers
- Reference exact file paths for every change
- Name functions/classes/interfaces (no bodies or values)
- No questions in report (put in "Open Questions and Assumptions")

## Domain Context

### Key Workflows
- **Auth & Onboarding:** Register → Email/Google → Profile → Company (`src/app/(auth)/`)
- **Dashboard:** Login → Dashboard → Quick links (`src/app/(dashboard)/dashboard/`)
- **Messaging:** Join room → Send → Realtime updates → Presence
- **Invitations (Admin):** Create → Send → Accept (restore flow in progress)

### Virtual Office Concepts

#### Companies
- Organizations using the platform
- Have admins and members
- Own spaces, users, and data within company boundaries

#### Spaces (Rooms)
- Virtual locations within a company (e.g., meeting rooms, lounges, offices)
- Can be public or restricted with access control
- Support reservations, capacity limits, and templates
- Track real-time occupancy and presence

#### Presence & Status
- Real-time user availability tracking
- Status indicators: online, away, busy, offline
- Space entry/exit logging for analytics
- Session duration and interaction patterns

#### Messaging System
- **Conversations:** Chat threads (DMs, room chats, group chats)
- **Per-User Preferences:** Pin/star/archive conversations, notification settings
- **Message Features:** Threads, reactions, attachments, voice notes, read receipts
- **User-Specific Actions:** Pin/star individual messages
- **DM Deduplication:** Participant fingerprinting prevents duplicate conversations
- **Visibility Levels:** Public (space members), private (specific participants), direct (two users)

#### Space Access Control
- Explicit membership via `space_members` table
- Role-based permissions (member, admin, director)
- "Knock to Enter" workflow for restricted spaces
- Cross-space calling capability

### UI Interaction Standards

#### Canonical Avatar Components
- **Display:** `EnhancedAvatarV2`
- **Upload:** `UploadableAvatar`
- All other avatar components are **deprecated**; replace with canonical components when touching files.

#### Click-Stop Standard (Critical)
- **Mark interactive children:** Add `data-avatar-interactive` to children that open menus or trigger actions
- **Parent guard:** In clickable containers (e.g., `SpaceElement`), the click handler must:
  - Early-return if `!event.currentTarget.contains(event.target as Node)` (ignore portal events)
  - Early-return if target `closest('[data-avatar-interactive]')` or `closest('a, button, [role="button"], [data-space-action]')` matches
- **Portal menus (Radix/shadcn):** On `DropdownMenuContent`, stop propagation on `onPointerDown`, `onClick`, `onKeyDown`; on `DropdownMenuItem`, cancel `onSelect` and stop propagation in `onClick`; mark content with `data-avatar-interactive`
- **Avatars/menus:** Components like `UserAvatarPresence` and `UserInteractionMenu` must stop propagation to prevent space navigation

#### UI Library Migration
- **Current:** shadcn/ui + Radix
- **Planned:** Update/replace with DaisyUI equivalents; keep interaction contracts and data attributes stable

### Current Feature Status

#### Implemented
- User Authentication (Email/Password via Supabase Auth)
- Company Management (creation, settings, invitations)
- Virtual Office Layout (interactive floor plan with Konva)
- Space Management (CRUD, templates, reservations)
- Real-Time Communication (chat, threads, reactions, attachments, voice notes)
- User Profiles (avatars, status, presence)
- Message Features (pins, stars, read receipts, per-user preferences)

#### In Progress
- **Unified Messaging System:** Enhanced UX with grouped conversations, offline reliability
- **Meeting Notes System:** AI-generated notes, summaries, action items
- **Announcement System:** Company-wide announcements with priority

#### Planned
- Video conferencing and screen sharing
- Virtual whiteboard
- Administrative dashboard with analytics
- AI-powered features (transcription, translation, search, assistant)

## Important Constraints

### Immutable Rules
- **Do not guess.** Verify. If unknown, say "I don't know."
- **Do not assume code behavior.** Ask for or provide tests.
- **Prefer edits to existing code** over new files.
- **Run the Anti-Duplication Protocol** before proposing changes.
- **Completion is user-gated.** Never state or imply "done", "fixed", or "resolved". Only the user can confirm completion.

### Security
- All database access must respect Supabase RLS policies
- Server-side Supabase client required for auth context in API routes
- Role-based access control (Admin/Member)
- Input validation on all API routes
- Secure session management

### Performance
- Optimize database queries and leverage caching (React Query)
- Minimize bundle size
- Real-time updates must be efficient and not cause excessive re-renders
- Monitor Supabase usage limits

### User Experience
- Adhere to WCAG 2.1 Level AA accessibility guidelines
- Intuitive UI/UX for complex features (floor plans, messaging)
- Responsive design for various screen sizes

### Data Integrity
- Company-based data isolation
- Conversation deduplication (DMs use participant fingerprinting)
- Message visibility enforcement
- Space membership tracking

### Type Safety
- Strict TypeScript mode enforced
- No `any` types without justification
- Explicit typing for all props, state, params, returns

## External Dependencies

### Primary Services
- **Supabase:** PostgreSQL database, authentication, real-time subscriptions, storage
- **Supabase Client:** `@supabase/supabase-js`, `@supabase/ssr`

### Planned Integrations
- AI services for transcription/summarization (TBD)
- WebRTC or third-party video solution (TBD)
- Email service for invitations and notifications (TBD)

### Development Tools
- **Package Manager:** npm
- **Linting:** ESLint
- **Formatting:** Prettier (implied)
- **Type Checking:** TypeScript compiler

## Project Structure
- `src/app/`: App Router routes and layouts
- `src/components/`: UI by feature (auth, dashboard, floor-plan, invitation, messaging, profile, ui)
- `src/contexts/`: Global state (Auth, Company, Presence)
- `src/hooks/`: queries, mutations, realtime, shared hooks
- `src/lib/`: auth, services, supabase, uploads, utilities
- `src/providers/`: App-level providers
- `src/repositories/`: interfaces, implementations, factory
- `src/types/`: **Canonical types**
- `migrations/`, `middleware.ts`, `__tests__/`

**New files must live in existing feature folders. Do not add new top-level directories.**

## Database Schema (Key Tables)

### Core Tables
- `companies`: Organization data
- `users`: User profiles with company association
- `spaces`: Virtual spaces/rooms with access control
- `space_members`: Explicit space membership
- `space_reservations`: Space bookings
- `space_presence_log`: Entry/exit tracking for analytics

### Messaging Tables
- `conversations`: Chat threads with participant fingerprinting
- `conversation_preferences`: Per-user conversation settings (pin/star/archive)
- `messages`: Chat messages with threading support
- `message_attachments`: File attachments (including voice notes with waveform/transcription)
- `message_reactions`: Emoji reactions
- `message_read_receipts`: Read status tracking
- `message_pins`: User-specific pinned messages
- `message_stars`: User-specific starred/bookmarked messages

### Other Tables
- `invitations`: User invitation tokens
- `announcements`: Company-wide posts
- `meeting_notes`: Meeting transcripts and summaries
- `meeting_note_action_items`: Tasks from meetings
