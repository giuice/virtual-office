# External Integrations

**Analysis Date:** 2026-07-22

## APIs & External Services

**Supabase platform:**
- Supabase Auth - Email/password and Google OAuth identity.
  - SDK/Client: `@supabase/supabase-js`, `@supabase/ssr`.
  - Browser client: `src/lib/supabase/browser-client.ts`.
  - Server client: `src/lib/supabase/server-client.ts`.
  - OAuth callback: `src/app/api/auth/callback/route.ts`.
- Supabase Realtime - Presence, database changes, knock delivery, messaging subscriptions, and WebRTC signaling.
  - Presence topics and contracts: `src/lib/presence/`.
  - Realtime hooks: `src/hooks/realtime/`, `src/hooks/usePresenceRealtime.ts`.
  - WebRTC signaling channel: `src/hooks/realtime/useAudioSignaling.ts`.
- Supabase Storage - Avatars and message attachments.
  - `user-uploads` bucket: `src/app/api/users/avatar/route.ts` and `src/app/api/users/avatar/remove/route.ts`.
  - `attachments` bucket: `src/app/api/messages/upload/route.ts` and `src/app/api/messages/attachment/[id]/route.ts`.

**WebRTC networking:**
- Public Google STUN is the default in `src/lib/webrtc/ice-config.ts`.
- An operator-provided TURN server can be configured through public WebRTC environment variables.
- Supabase Realtime broadcasts SDP offers/answers and ICE candidates; media remains peer-to-peer in `src/lib/webrtc/WebRTCManager.ts`.

**Google identity/profile data:**
- Google OAuth is initiated through Supabase Auth in `src/contexts/AuthContext.tsx`.
- Google avatar synchronization logic lives in `src/lib/services/google-avatar-service.ts` and `src/lib/services/avatar-sync-service.ts`.

## Data Storage

**Databases:**
- Supabase PostgreSQL.
  - Connection: public URL/anon key for browser-safe operations; service role and database URLs only in server/test environments.
  - Client: Supabase query builder plus PostgreSQL RPCs.
  - Schema evolution: 23 ordered SQL files in `supabase/migrations/` at analysis time.
  - Data access: repository interfaces in `src/repositories/interfaces/` and Supabase implementations in `src/repositories/implementations/supabase/`.

**File Storage:**
- Supabase Storage private buckets for user uploads and attachments.
- Avatar processing occurs server-side with Sharp before upload.

**Caching:**
- TanStack Query client cache configured in `src/providers/query-provider.tsx`.
- Browser local storage is advisory for selected theme, scoped Presence recovery data, and UI preferences; database/RPC responses remain authoritative for Presence.
- No external Redis/Memcached service detected.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth.
  - Server authorization validates JWTs with `auth.getUser()`.
  - Page protection/cookie refresh is handled by `src/proxy.ts`.
  - API routes authenticate independently because the proxy excludes `/api`.
  - Application user keys are `users.id`; Supabase Auth identities map through `users.supabase_uid`.
  - Privileged service-role clients are created only in server code and must be paired with application authorization.

## Monitoring & Observability

**Error Tracking:**
- No hosted error-tracking SDK was detected.

**Logs:**
- Console logging is widespread across application and route code.
- Messaging has a scoped helper in `src/utils/debug-logger.ts`.
- Auth validation metrics are produced by `src/lib/auth/auth-metrics.ts` and exercised by auth-metrics Playwright tooling.
- Presence concurrency produces NDJSON evidence through `scripts/run-presence-concurrency.mjs` and CI artifacts.

## CI/CD & Deployment

**Hosting:**
- Not detected in committed configuration. The application is a standard Next.js Node deployment.

**CI Pipeline:**
- GitHub Actions.
- `.github/workflows/e2e-playwright.yml` runs repeated browser messaging/API scenarios.
- `.github/workflows/presence-remediation.yml` runs the movement gate, unit suite, typecheck, lint, production build, local Supabase database tests, concurrency tests, and Presence E2E.

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for privileged server routes and integration tooling
- `NEXT_PUBLIC_STUN_URL` optionally overrides the default STUN server
- `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` enable TURN
- `PLAYWRIGHT_TEST_SECRET` and Playwright user variables for seeded browser tests
- Presence database/concurrency variables are documented by scripts and CI, not client code

**Secrets location:**
- Local secrets belong in ignored `.env.local`.
- CI secrets are injected through GitHub Actions secret contexts.
- Never expose service-role, database, or test-user credentials to `NEXT_PUBLIC_*` variables.

## Webhooks & Callbacks

**Incoming:**
- Supabase OAuth callback: `src/app/api/auth/callback/route.ts`.
- No third-party webhook receivers were detected under `src/app/api/`.

**Outgoing:**
- No external outgoing webhook client was detected.
- Browser/API communication primarily targets same-origin App Router endpoints through `src/lib/api.ts` and `src/lib/messaging-api.ts`.

---

*Integration audit: 2026-07-22*
