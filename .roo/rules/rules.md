
# Project AI / Developer Rules (Merged)

Purpose
- Provide a single concise role document combining coding rules, project context, structure, and tech constraints. Use this as the canonical guidance when writing or reviewing code.

Scope
- Applies to all development work in this repository: feature code, bug fixes, tests, migrations, and infrastructure as code.

MCP Tools (Primary Sources)
- **Supabase**: For any question about database structure, types, column names or data semantics, consult Supabase first — it's the canonical source for schema and row-level behavior.
- **Context7**: For UI libraries (Shadcn), Supabase auth behavior, the invitation system, Tailwind conventions, and recent technical decisions, consult Context7 documentation and project prompts.


1. TypeScript & Project-wide Coding Rules
- **Enable strict mode** in `tsconfig.json` and follow TypeScript best practices.
- **Types & Interfaces**: Prefer interfaces for object shapes; use explicit types for props, state, function parameters, and return values. Use generics where appropriate.
- **File size limit**: Keep files under 500 lines. Split large components into smaller subcomponents and extract complex logic to hooks or utilities.
- **Separation of concerns**: Presentation (components) vs business logic (services, repositories, hooks, utils). Data access must follow the repository pattern located in `src/repositories/`.
- **Naming conventions**: Components/Types/Interfaces = PascalCase; files & directories = kebab-case; variables/functions/hooks = camelCase; constants/env = UPPER_SNAKE_CASE. Prefix hooks with `use`, handlers with `handle`, booleans with `is/has/can`.
- **Exports**: Prefer named exports; avoid default exports unless the module exports a single primary thing.

2. Project Structure & Import Patterns
- Follow the `src/` layout: `app/`, `components/`, `contexts/`, `hooks/`, `lib/`, `repositories/`, `types/`, `utils/`.
- Co-locate related components and keep one component per file.
- Use the `@/` alias for internal imports.
- Group imports: external → internal (`@/`) → relative.

Detailed `src/` structure (recommended)
```
src/
├── app/                 # Next.js App Router pages and layouts
│   ├── (auth)/         # Authentication route group
│   ├── (dashboard)/    # Dashboard route group
│   ├── api/            # API route handlers
│   └── globals.css     # Global styles
├── components/         # React components
│   ├── ui/             # Shadcn/UI base components (Button, Dialog, etc.)
│   ├── dashboard/      # Dashboard-specific components
│   ├── floor-plan/     # Virtual office floor plan components
│   ├── messaging/      # Chat and communication components
│   ├── profile/        # User profile components
│   └── shell/          # Layout and shell components
├── contexts/           # React Context providers
├── hooks/              # Custom React hooks
│   ├── queries/        # TanStack Query hooks
│   ├── mutations/      # Data mutation hooks
│   └── realtime/       # Real-time subscription hooks
├── lib/                # Utility functions and configurations
│   ├── supabase/       # Supabase client and utilities
│   └── auth/           # Authentication utilities
├── repositories/       # Data access layer
│   ├── interfaces/     # Repository interfaces
│   └── implementations/ # Concrete implementations
├── types/              # TypeScript type definitions
└── utils/              # General utility functions
```

Notes on structure
- Route groups: use parentheses `()` in `app/` to group related routes (e.g., `(auth)`).
- Server components by default in `app/` for initial render performance; use client components only where interactivity requires it.
- Keep UI primitives in `components/ui/` and feature components in domain folders under `components/`.
- Expose commonly-used hooks and utilities from index files to simplify imports (e.g., `src/hooks/index.ts`).

3. Architecture & Patterns
- **Repository Pattern**: Abstract data access in `src/repositories/` with clearly defined interfaces in `src/repositories/interfaces/` and implementations in `src/repositories/implementations/`.
- **Context + Hooks**: Use React Context for global state and custom hooks for data fetching and mutations.
- **Server Components**: Use Next.js Server Components for initial loads where appropriate.
- **Atomic Design**: Organize components by complexity (ui, atoms, molecules, organisms, pages).

4. Tech Stack & Constraints
- Next.js 15.3 (App Router) + TypeScript 5
- Supabase (Postgres) with Row Level Security and Realtime
- TailwindCSS 4.x + Shadcn/UI
- TanStack Query v5 for client caching
- Socket.IO for realtime where needed
- Testing: Vitest + Playwright + Testing Library
- Use Next.js image optimization and server components for performance.

Database note
- The project relies on a Supabase Auth trigger that inserts auth users into `public.users`. Preserve this behavior when modifying auth flows or user creation: the trigger function `public.handle_new_user()` inserts a user record after `auth.users` insert. Do not duplicate user creation logic that conflicts with the trigger.

5. Code Quality & Workflow
- Run linting and tests locally before creating a PR: `npm run lint`, `npm run test`.
- Include unit tests (Vitest) and Playwright tests for critical flows when adding features or fixing bugs.
- Keep PRs small and focused; document design decisions in the PR description.

6. AI Usage & Review Guidance
- Use AI tools for scaffolding, suggestions, or test drafts only. Every AI-assisted change must be reviewed by a human developer.
- Required checks before merge: linting, type-check, and tests must pass. Annotate PRs that used AI and include a short note about what was AI-generated.
- Verify any code that touches authentication, authorization, or database migrations thoroughly; prefer manual review for security-sensitive changes.

7. Naming, Conventions, and Best Practices (Quick Reference)
- Component files: `src/components/my-component/MyComponent.tsx` (PascalCase component name, kebab-case path)
- Hooks: `useSomething` in `src/hooks/` and exported from index files when shared
- Constants: `const API_BASE_URL = process.env.API_BASE_URL` (UPPER_SNAKE_CASE)

8. Testing & Migrations
- Place SQL migrations in `src/migrations/` and follow existing migration conventions.
- Add tests for repository logic and any business-critical UI flows.

9. Onboarding & Documentation
- Keep `memory-bank/` and `docs/` up to date for architecture decisions and runbooks.
- Document any notable deviations from these rules in the `memory-bank/activeContext.md` or a PR description.

10. Contact & Escalation
- For ambiguous architectural decisions, open an issue and tag `@team-arch` or the repository maintainers. For security or data issues, notify maintainers immediately and avoid merging changes without approval.

Appendix: Source Summary
- Based on `code-rules.md`, `product.md`, `structure.md`, and `tech.md` (project rules, product context, structure, and technical stack).

