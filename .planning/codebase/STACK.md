# Technology Stack

**Analysis Date:** 2026-07-22

## Languages

**Primary:**
- TypeScript 6.0.3 - Application code, Next.js route handlers, React components, hooks, repositories, tests, and tooling under `src/`, `__tests__/`, and root config files.
- SQL / PostgreSQL - Schema, RLS, RPC, storage, and Realtime migrations under `supabase/migrations/`.

**Secondary:**
- JavaScript / ESM - Test runners, maintenance scripts, and configuration such as `scripts/*.mjs`, `run-tests.js`, and `eslint.config.mjs`.
- CSS - Tailwind 4 entry point and application themes in `src/app/globals.css` and `src/styles/`.
- HTML / Markdown - Product/design references and operational documentation under `docs/`.

## Runtime

**Environment:**
- Node.js 20 in GitHub Actions (`.github/workflows/e2e-playwright.yml`, `.github/workflows/presence-remediation.yml`).
- No `engines` constraint is declared in `package.json`; local Node versions can therefore diverge from CI.
- Browser runtime is required for React, MediaDevices, WebRTC, local storage, and Supabase Realtime clients.

**Package Manager:**
- npm with lockfile version 3.
- Lockfile: `package-lock.json` present.

## Frameworks

**Core:**
- Next.js 16.1.6 - App Router pages, layouts, proxy, and route handlers in `src/app/` and `src/proxy.ts`.
- React 19.2.4 / React DOM 19.2.4 - Client providers, contexts, hooks, and UI.
- Supabase JS 2.97.0 and `@supabase/ssr` 0.12.0 - PostgreSQL, Auth, Storage, Realtime, and cookie-aware SSR clients.
- TanStack Query 5.90.21 - Server-state caching and invalidation through `src/providers/query-provider.tsx` and hooks.
- Tailwind CSS 4.2.1 - Styling through `@tailwindcss/postcss`, `src/app/globals.css`, and theme tokens.
- Radix UI plus shadcn conventions - Accessible primitives in `src/components/ui/`; aliases are defined in `components.json`.

**Testing:**
- Vitest 4.0.18 - Unit, component, API, presence, database, and remote messaging suites.
- Testing Library 16.3.2 and `@testing-library/jest-dom` 7.0.0 - React component and DOM behavior tests.
- Playwright 1.58.2 - API and browser workflows in `__tests__/api/playwright/`.

**Build/Dev:**
- Turbopack via `npm run dev`.
- Next production builder via `npm run build`.
- ESLint 10 flat configuration in `eslint.config.mjs`.
- TypeScript strict no-emit validation via `npm run type-check`.
- Supabase CLI 2.109.1 for the local database stack and migration reset.

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` / `@supabase/ssr` - All persisted application data and authenticated server boundaries.
- `@tanstack/react-query` - Presence, spaces, neighborhoods, conversations, and messaging caches.
- `zod` - Runtime schemas in `src/lib/presence/`, `src/lib/api/company-membership-contracts.ts`, and API routes. It is currently available only transitively and is not declared directly in `package.json`.
- `sharp` 0.35.0 - Server-side avatar image processing in `src/app/api/users/avatar/route.ts`.
- `sonner` 2.0.7 - User notifications and errors.

**Infrastructure:**
- PostgreSQL client `pg` - Database/concurrency tooling and integration tests.
- Supabase CLI - Local Postgres/Auth/Realtime/Storage test environment.
- WebRTC browser APIs - P2P room audio implemented by `src/lib/webrtc/WebRTCManager.ts`.
- `uuid` - Attachment identifiers and transition/test helpers.
- `date-fns` - User-facing relative timestamps.

## Configuration

**Environment:**
- Never read or commit `.env.local`; it exists locally and is ignored by `.gitignore`.
- Public Supabase client configuration uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `src/lib/supabase/` and `src/proxy.ts`.
- Server-only privileged access uses `SUPABASE_SERVICE_ROLE_KEY` through `src/lib/supabase/server-client.ts`; it must never enter client bundles.
- WebRTC uses `NEXT_PUBLIC_STUN_URL` and optional `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` in `src/lib/webrtc/ice-config.ts`.
- Test-only configuration includes `PLAYWRIGHT_TEST_SECRET`, test user settings, Presence database URLs, and concurrency approval variables referenced by `playwright.config.ts` and `scripts/`.

**Build:**
- `next.config.ts` supports isolated `VO_NEXT_DIST_DIR` and `VO_NEXT_TSCONFIG` outputs for auth-metrics E2E.
- `tsconfig.json` enables strict mode, bundler resolution, React JSX, and alias `@/* -> ./src/*`.
- `postcss.config.mjs`, `tailwind.config.ts`, and `components.json` configure Tailwind/shadcn UI.
- `vitest*.config.mts` separate unit, Presence, database, concurrency, and remote suites.

## Platform Requirements

**Development:**
- Node.js 20 is the CI reference runtime; use a compatible npm release and `npm ci`.
- Supabase CLI and a container runtime are required for `npm run db:local:start`, database integration tests, and concurrency tests.
- Chromium/Playwright dependencies are required for browser suites.

**Production:**
- A Node-compatible Next.js hosting environment is required; no repository-level hosting provider configuration was detected.
- A Supabase project must provide Postgres, Auth, Realtime, and private Storage buckets.
- A provisioned TURN service is required for reliable WebRTC across symmetric NAT/firewalls; the code otherwise falls back to public Google STUN.

---

*Stack analysis: 2026-07-22*
