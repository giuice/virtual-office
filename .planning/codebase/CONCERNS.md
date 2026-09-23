# Codebase Concerns

**Analysis Date:** 2026-07-22

## Tech Debt

**Large multi-responsibility modules:**
- Issue: Several files combine orchestration, transformation, network access, and UI/state concerns.
- Files: `src/lib/avatar-utils.ts` (~857 lines), `src/repositories/implementations/supabase/SupabaseMessageRepository.ts` (~689), `src/lib/messaging-api.ts` (~675), `src/contexts/CompanyContext.tsx` (~617), `src/hooks/useConversations.ts` (~553).
- Impact: Changes have a broad regression surface and are difficult to review/test in isolation.
- Fix approach: Extract cohesive contracts/services incrementally with focused regression tests; do not perform cosmetic bulk splits.

**Inconsistent strictness enforcement:**
- Issue: `eslint.config.mjs` defines several rules twice, with later warning levels overriding earlier errors; source still contains substantial `any` usage.
- Files: `eslint.config.mjs`, `vitest.setup.ts`, `src/app/tools/cleanup-companies/page.tsx`.
- Impact: Promise and type-safety defects can pass lint.
- Fix approach: Deduplicate the flat config, establish intended severities, then burn down warnings by feature rather than suppressing them.

**Implicit runtime dependency:**
- Issue: `zod` is imported throughout critical Presence/API code but is not a direct dependency in `package.json`; it is present transitively in `package-lock.json`.
- Files: `package.json`, `src/lib/presence/transition-contract.ts`, `src/lib/api/company-membership-contracts.ts`.
- Impact: A transitive dependency update can remove Zod and break install/build reproducibility.
- Fix approach: Declare and lock `zod` directly, then run typecheck, tests, and build.

**Logging volume:**
- Issue: Hundreds of direct console calls are distributed across client and server code.
- Files: notably `src/contexts/`, `src/hooks/`, `src/lib/webrtc/`, and `src/app/api/`.
- Impact: Noisy production logs, inconsistent redaction, and harder correlation.
- Fix approach: Extend scoped logging/metrics utilities and prohibit raw sensitive object logging.

## Known Bugs

**Company cleanup tool calls a missing API route:**
- Symptoms: `/tools/cleanup-companies` invokes `/api/companies/cleanup`, but no `src/app/api/companies/cleanup/route.ts` exists.
- Files: `src/app/tools/cleanup-companies/page.tsx`, `src/lib/api.ts`.
- Trigger: Submit the cleanup form.
- Workaround: None in current code; do not expose/use the tool until a fully authorized server implementation exists or remove the page/client method.

**Room dialog contains a placeholder join path:**
- Symptoms: The room-dialog module records a TODO instead of complete room joining behavior.
- Files: `src/components/floor-plan/room-dialog/index.tsx`.
- Trigger: Use the affected room-dialog join interaction.
- Workaround: Use the established floor-plan location transition path where available.

## Security Considerations

**Debug and maintenance pages in routable source:**
- Risk: Diagnostic component surfaces are reachable as normal App Router pages unless deployment routing blocks them.
- Files: `src/app/debug/messaging-test/page.tsx`, `src/app/debug/messaging-comparison/page.tsx`, `src/app/tools/cleanup-companies/page.tsx`, `src/proxy.ts`.
- Current mitigation: The service-role messaging seed API returns 404 in production and requires `PLAYWRIGHT_TEST_SECRET` outside production.
- Recommendations: Add explicit development-only guards or remove production routes; protect all administrative tools server-side, not only in UI.

**Public TURN credential variables:**
- Risk: `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_CREDENTIAL` are bundled for browsers and therefore cannot be treated as long-lived secrets.
- Files: `src/lib/webrtc/ice-config.ts`.
- Current mitigation: TURN is optional; STUN fallback works for simple NAT.
- Recommendations: Use short-lived TURN credentials issued by an authenticated server endpoint before broad video rollout.

**Service-role breadth:**
- Risk: Many API routes create service-role clients, which bypass RLS.
- Files: `src/app/api/`, `src/lib/auth/authorize.ts`, `src/lib/supabase/server-client.ts`.
- Current mitigation: Newer routes validate Auth and resource/company scope before privileged access.
- Recommendations: Audit every service-role route for `auth.getUser()`, application-user resolution via `supabase_uid`, tenant checks, and minimized queries; keep the Supabase/RLS review gate mandatory.

## Performance Bottlenecks

**P2P WebRTC mesh:**
- Problem: Each participant maintains a peer connection to every other participant; adding video multiplies upstream bandwidth and encode/decode load.
- Files: `src/lib/webrtc/WebRTCManager.ts`, `src/hooks/realtime/useAudioSignaling.ts`, `src/lib/webrtc/ice-config.ts`.
- Cause: Media is peer-to-peer and Supabase Realtime provides signaling only.
- Improvement path: Benchmark current audio at the supported room sizes; define an SFU/mesh decision before implementing a nine-participant video grid or recording.

**Provider and client cache breadth:**
- Problem: Global providers and large company/messaging contexts can cause broad updates and complex stale-work guards.
- Files: `src/app/layout.tsx`, `src/contexts/CompanyContext.tsx`, `src/contexts/messaging/MessagingContext.tsx`.
- Cause: Multiple domains are mounted globally and some state is managed outside focused query hooks.
- Improvement path: Profile real renders, move server-derived state toward scoped TanStack Query selectors, and keep identity/tenant generations fenced.

## Fragile Areas

**Presence and location:**
- Files: `src/lib/presence/`, `src/hooks/usePresenceSession.ts`, `src/hooks/usePresenceRealtime.ts`, `src/app/api/presence/`, `supabase/migrations/202607*.sql`.
- Why fragile: Multi-tab leases, logout/reload races, private access, Realtime delivery, RLS, and atomic database transitions interact.
- Safe modification: Load `.agents/skills/presence-safety/SKILL.md`, keep one authoritative transition path, and preserve tenant/user/session scoping.
- Test coverage: Strong dedicated unit, DB, concurrency, and E2E gates; all relevant layers must still be selected per change.

**Authentication/company bootstrap:**
- Files: `src/contexts/AuthContext.tsx`, `src/contexts/CompanyContext.tsx`, `src/lib/bootstrap/profile-sync.ts`, `src/proxy.ts`.
- Why fragile: Auth changes can retire in-flight tenant data and Presence sessions.
- Safe modification: Preserve auth-generation fencing and test logout/re-login plus transient bootstrap failures.
- Test coverage: `__tests__/auth-context-presence-logout.test.tsx`, `__tests__/contexts/company-context-bootstrap.test.tsx`, and Auth Playwright specs.

**Messaging cache and persistence:**
- Files: `src/lib/messaging-api.ts`, `src/hooks/useMessages.ts`, `src/hooks/useConversations.ts`, `src/repositories/implementations/supabase/SupabaseMessageRepository.ts`.
- Why fragile: Pagination, membership authorization, optimistic cache updates, Realtime delivery, attachments, reactions, pin/star, and read models span many layers.
- Safe modification: Update route, repository, cache keys, Realtime behavior, and focused tests together.
- Test coverage: Broad unit/API/Playwright coverage exists, but large modules make untouched branches hard to reason about.

## Scaling Limits

**WebRTC rooms:**
- Current capacity: Soft warning begins at eight peer connections; `HARD_LIMIT: 12` is documented as future behavior and is not a proven enforced capacity.
- Limit: P2P mesh bandwidth/CPU grows roughly with participant connections and is especially costly for video/screen tracks.
- Scaling path: Evaluate an SFU and server-side/egress recording architecture before promising nine-way video and recording.

**Presence concurrency:**
- Current capacity: CI runs exact 50-iteration cases in `scripts/run-presence-concurrency.mjs` against local Supabase.
- Limit: These tests prove specified races, not arbitrary production load.
- Scaling path: Keep staging/soak modes and rollout observability separate from correctness gates.

## Dependencies at Risk

**Version/documentation drift:**
- Risk: `package.json` uses Next.js 16, React 19, and TypeScript 6 while `CLAUDE.md` still states Next.js 15.
- Impact: Agents and humans can apply obsolete framework assumptions.
- Migration plan: Update the repository rules after verifying the intended supported versions and build/runtime baseline.

**Zod transitive installation:**
- Risk: Critical schemas depend on a package not declared directly.
- Impact: Clean installs can change when upstream packages alter optional/peer dependencies.
- Migration plan: Add an explicit compatible Zod dependency and verify lockfile/build.

## Missing Critical Features

**Production-grade video/screen sharing infrastructure:**
- Problem: Current code implements audio-only P2P media and signaling; no video grid, screen-share lifecycle, whiteboard synchronization, recording pipeline, virtual backgrounds, or PiP implementation was detected.
- Blocks: The planned Video and Screen Sharing phase cannot be treated as a small UI extension.
- Files: `src/lib/webrtc/WebRTCManager.ts`, `src/hooks/realtime/useAudioSignaling.ts`, `src/contexts/AudioContext.tsx`, `.planning/ROADMAP.md`.

**Reliable TURN credential issuance:**
- Problem: Static browser-exposed TURN variables are the only TURN configuration path.
- Blocks: Reliable enterprise/firewall media connectivity and secure credential rotation.
- Files: `src/lib/webrtc/ice-config.ts`.

## Test Coverage Gaps

**WebRTC peer engine:**
- What's not tested: Direct `WebRTCManager` offer/answer glare, ICE queuing, track replacement, disconnect/reconnect, TURN failure, and multi-peer media behavior.
- Files: `src/lib/webrtc/WebRTCManager.ts`; current tests focus on provider/signaling lifecycle in `__tests__/audio-context.test.tsx` and `__tests__/audio-signaling.test.tsx`.
- Risk: Video/screen-share changes can introduce ghost media, stale connections, and negotiation failures.
- Priority: High before Phase 3 implementation.

**Debug/maintenance route deployment behavior:**
- What's not tested: Production denial/removal of `src/app/debug/` and `src/app/tools/` pages.
- Files: `src/app/debug/`, `src/app/tools/`, `src/proxy.ts`.
- Risk: Internal tools or diagnostic UIs can remain reachable.
- Priority: Medium.

**Global coverage threshold:**
- What's not tested: No minimum line/branch/function threshold is enforced by `vitest.config.mts`.
- Files: `vitest.config.mts`.
- Risk: Untested branches can grow outside the stricter Presence gates.
- Priority: Medium; introduce targeted thresholds only after establishing a baseline.

---

*Concerns audit: 2026-07-22*
