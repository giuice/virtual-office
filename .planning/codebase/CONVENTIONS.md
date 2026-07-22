# Coding Conventions

**Analysis Date:** 2026-07-22

## Naming Patterns

**Files:**
- Use PascalCase for React component modules: `src/components/messaging/MessageList.tsx`.
- Use `use` prefix and camelCase for hooks: `src/hooks/useLocationTransition.ts`.
- Use kebab-case for domain utilities/contracts: `src/lib/presence/transition-contract.ts`.
- Use App Router reserved filenames (`page.tsx`, `layout.tsx`, `route.ts`).
- Use `I<Name>Repository` and `Supabase<Name>Repository` for persistence boundaries.

**Functions:**
- Use camelCase verbs that express behavior (`createSupabaseServerClient`, `transitionLocation`, `requireVerifiedPresenceAuth`).
- React components and providers use PascalCase.
- API handlers export uppercase HTTP verbs (`GET`, `POST`, `PATCH`, `DELETE`).

**Variables:**
- Use camelCase for local values and refs.
- Use `is*`, `has*`, and `can*` for booleans.
- Use `*Ref` for mutable React refs and `*Id` for application UUIDs.
- Keep Supabase identity explicit as `supabaseUid` / `supabase_uid`; do not conflate it with `users.id`.

**Types:**
- Interfaces describe object shapes and repository contracts.
- Type aliases describe unions, callback signatures, and derived types.
- Use readonly inputs/results for coordination contracts where mutation is not intended.

## Code Style

**Formatting:**
- Prettier 3.8.1 and `prettier-plugin-tailwindcss` are installed.
- Existing files contain mixed semicolon/quote/indent styles; apply the formatter to touched files rather than copying accidental local variance.
- Tailwind class composition uses `cn` from `src/lib/utils.ts` and shadcn conventions.

**Linting:**
- ESLint 10 flat config in `eslint.config.mjs`.
- Next Core Web Vitals and React Hooks rules are enabled.
- Floating and misused promises are warnings in the final merged rule object; explicitly use `void` for intentional fire-and-forget calls.
- `any`, unused variables, non-null assertions, and missing dependencies are warnings, but new code should remain strict and avoid them.

## Import Organization

**Order:**
1. React/Next and external packages.
2. `@/` absolute application imports.
3. Relative sibling imports.
4. Type-only imports use `import type` when no runtime value is required.

**Path Aliases:**
- Use `@/*` for `src/*`, configured in `tsconfig.json` and Vitest configs.
- Avoid deep `../../../` imports when an absolute source alias is available.

## Error Handling

**Patterns:**
- Treat caught values as `unknown`, narrow with `instanceof Error`, and preserve causes where helpful.
- Validate untrusted data with Zod at API/Realtime/RPC boundaries.
- Server routes return stable codes and sanitized messages; do not expose raw database/service errors.
- Browser API clients throw `ApiError` from `src/lib/api/client-error.ts` for HTTP failures.
- Client providers store user-facing state and may use Sonner; console output should remain diagnostic and credential-free.
- Critical cleanup paths use `try/finally` and aggregate multiple failures, as in `src/contexts/AuthContext.tsx`.

## Logging

**Framework:** Console plus scoped debug utilities.

**Patterns:**
- Use `src/utils/debug-logger.ts` for messaging diagnostics.
- Include a stable subsystem prefix/correlation ID for server logs where available.
- Never log tokens, passwords, service-role keys, raw cookies, or complete Auth objects.
- Prefer sanitized structured fields over dumping request payloads.

## Comments

**When to Comment:**
- Explain invariants, races, compatibility constraints, and why a seemingly redundant guard exists.
- Presence comments should capture authority/ordering assumptions, not restate syntax.
- Remove stale migration-era comments such as “Assuming this endpoint” once behavior is verified.

**JSDoc/TSDoc:**
- Used for public WebRTC methods and complex utilities.
- Prefer concise contracts on exported helpers; do not document obvious private wrappers.

## Function Design

**Size:**
- Keep route handlers and hooks focused; extract validation, authorization, and coordination when condition growth appears.
- Existing large files in `src/lib/messaging-api.ts`, `src/contexts/CompanyContext.tsx`, and repositories are refactoring signals, not templates for new modules.

**Parameters:**
- Prefer typed object parameters for multi-field commands.
- Keep tenant/user/resource identifiers explicit.
- Pass a server Supabase client into repositories; do not instantiate browser clients in server data access.

**Return Values:**
- Use explicit result unions for expected failures and exceptions for unexpected infrastructure errors.
- API routes return `NextResponse` with stable status/code pairs.
- Hooks expose typed state/actions rather than raw mutable internals.

## Module Design

**Exports:**
- Prefer named exports for hooks, utilities, contexts, and repositories.
- App Router pages/layouts use default exports as required by Next.js.
- Keep public boundaries explicit and type-only imports separate.

**Barrel Files:**
- Limited barrels exist for repositories and WebRTC (`src/repositories/interfaces/index.ts`, `src/lib/webrtc/index.ts`).
- Avoid broad barrels that introduce circular dependencies or hide server/client boundaries.

## Project-Specific Safety

- Follow `CLAUDE.md` for repository-wide behavior.
- Presence, Realtime, movement, occupancy, private spaces, and knock work must load `.agents/skills/presence-safety/SKILL.md`.
- Supabase/schema/RLS work must load `.agents/skills/supabase/SKILL.md` and pass the RLS review gate.
- Server Auth uses `auth.getUser()`; browser session reads may use `auth.getSession()`.
- Client Components use `src/lib/supabase/browser-client.ts`; server code uses `src/lib/supabase/server-client.ts`.
- Canonical avatar display is `EnhancedAvatarV2`; canonical upload is `UploadableAvatar`.

---

*Convention analysis: 2026-07-22*
