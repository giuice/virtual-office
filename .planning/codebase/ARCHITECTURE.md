<!-- refreshed: 2026-07-22 -->
# Architecture

**Analysis Date:** 2026-07-22

## System Overview

```text
Next.js App Router UI (`src/app/`, `src/components/`)
        |
        v
Client providers, contexts, and hooks
(`src/contexts/`, `src/providers/`, `src/hooks/`)
        |
        +--> same-origin API clients (`src/lib/api.ts`, `src/lib/messaging-api.ts`)
        |         |
        |         v
        |    Route handlers (`src/app/api/**/route.ts`)
        |         |
        |         v
        |    authorization + repositories/RPC contracts
        |
        +--> browser-safe Supabase Realtime/query clients
                  |
                  v
Supabase Auth + PostgreSQL/RLS/RPC + Realtime + Storage
(`src/lib/supabase/`, `src/repositories/`, `supabase/migrations/`)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root composition | Orders themes, query cache, Auth, company, messaging, Presence, calling, and global UI | `src/app/layout.tsx` |
| Auth context | Supabase session actions and logout fencing for Presence | `src/contexts/AuthContext.tsx` |
| Company context | Tenant bootstrap, company/users/spaces state, and guarded mutations | `src/contexts/CompanyContext.tsx` |
| Presence route boundary | Mounts Presence only on eligible authenticated application routes | `src/components/presence/PresenceRouteBoundary.tsx` |
| Presence transition coordinator | Serializes/supersedes location transitions and reconciles snapshots | `src/lib/presence/location-transition-coordinator.ts` |
| Presence API | Validates verified sessions and invokes the atomic transition RPC | `src/app/api/presence/location/route.ts` |
| Repositories | Abstract table-oriented data access behind interfaces | `src/repositories/interfaces/`, `src/repositories/implementations/supabase/` |
| Messaging | Query/cache hooks, route handlers, repositories, and global drawer UI | `src/hooks/useMessages.ts`, `src/app/api/messages/`, `src/components/messaging/` |
| Audio/WebRTC | Owns peer connections, media tracks, signaling, and room audio UI state | `src/lib/webrtc/WebRTCManager.ts`, `src/contexts/AudioContext.tsx` |

## Pattern Overview

**Overall:** Layered Next.js application with server-authoritative domain boundaries and client-side provider/hook orchestration.

**Key Characteristics:**
- App Router pages and route handlers are the HTTP entry points.
- Client Components own interactive state; TanStack Query owns server-derived caches.
- Supabase repositories isolate most table access, while security-critical Presence operations use validated contracts and atomic RPCs.
- Supabase Realtime is a delivery/synchronization channel, not the sole source of truth for persisted membership or location.
- Project-specific safety rules in `CLAUDE.md` and `.agents/skills/presence-safety/SKILL.md` constrain auth, RLS, Presence, and placement work.

## Layers

**Presentation:**
- Purpose: Render routes, dashboards, floor plans, messaging, admin screens, and dialogs.
- Location: `src/app/`, `src/components/`.
- Depends on: contexts, hooks, types, UI primitives.

**Client orchestration:**
- Purpose: Coordinate Auth/company/Presence/messaging/audio state and mutations.
- Location: `src/contexts/`, `src/providers/`, `src/hooks/`.
- Depends on: API clients, Supabase browser client, TanStack Query, domain utilities.

**Application/domain services:**
- Purpose: Validate contracts, coordinate transitions, map errors, and implement reusable behavior.
- Location: `src/lib/`, `src/utils/`.
- Examples: `src/lib/presence/location-transition-coordinator.ts`, `src/lib/auth/authorize.ts`, `src/lib/api/company-membership-contracts.ts`.

**HTTP boundary:**
- Purpose: Authenticate, authorize, validate request data, construct repositories, and return sanitized responses.
- Location: `src/app/api/**/route.ts`.
- Constraint: API routes authenticate independently because `src/proxy.ts` excludes `/api`.

**Persistence/infrastructure:**
- Purpose: Implement repository interfaces, database RPC calls, Storage, and Realtime connections.
- Location: `src/repositories/`, `src/lib/supabase/`, `supabase/migrations/`.

## Data Flow

### Presence Location Transition

1. UI calls `transitionLocation` from `src/hooks/useLocationTransition.ts`.
2. `src/lib/presence/location-transition-coordinator.ts` assigns a transition UUID, manages supersession, and sends a normalized command.
3. `POST /api/presence/location` validates the schema and verified Presence session in `src/app/api/presence/location/route.ts`.
4. The route invokes PostgreSQL RPC `transition_user_location_observed` atomically.
5. The client reconciles `/api/presence/snapshot` and updates the TanStack Query snapshot only when company, viewer, location, and version agree.

### Messaging Request

1. Components/hooks call `src/lib/messaging-api.ts` or a focused mutation/query hook.
2. A handler such as `src/app/api/messages/create/route.ts` validates the authenticated user and conversation membership.
3. The route constructs `SupabaseMessageRepository` / `SupabaseConversationRepository` from a server client.
4. Repository operations persist rows; Realtime hooks such as `src/hooks/realtime/useMessageSubscription.ts` update/invalidate caches.

### WebRTC Audio

1. `src/contexts/AudioContext.tsx` creates one `WebRTCManager` for the active space/user.
2. `src/hooks/realtime/useAudioSignaling.ts` subscribes to `room:audio:{spaceId}` and exchanges handshakes, offers, answers, and ICE candidates.
3. `src/lib/webrtc/WebRTCManager.ts` owns `RTCPeerConnection` objects and browser media tracks.
4. Media travels peer-to-peer; Supabase Realtime carries signaling and mute Presence metadata.

**State Management:**
- React contexts hold session-wide UI/application state.
- TanStack Query holds remote snapshots and lists.
- Reducer-style state helper `src/hooks/useReducerState.ts` is common in large providers.
- Local storage is advisory; server snapshots/RPC results are authoritative for Presence.

## Key Abstractions

**Repository interfaces:**
- Purpose: Separate application behavior from Supabase table calls.
- Examples: `src/repositories/interfaces/IUserRepository.ts`, `IMessageRepository.ts`, `ISpaceRepository.ts`.
- Pattern: Interfaces define public object behavior; implementations receive a `SupabaseClient`.

**Validated contracts:**
- Purpose: Normalize untrusted API/RPC/Realtime data.
- Examples: `src/lib/presence/transition-contract.ts`, `src/lib/presence/session-schemas.ts`, `src/lib/api/company-membership-contracts.ts`.
- Pattern: Zod schemas plus explicit error/status mapping.

**Query keys:**
- Purpose: Keep invalidation tenant- and user-scoped.
- Examples: `src/lib/presence/query-keys.ts`, hooks under `src/hooks/queries/`.

## Entry Points

**Application shell:**
- Location: `src/app/layout.tsx`.
- Responsibilities: Global fonts, themes, provider ordering, messaging drawer, call notifications, and toast host.

**Route protection:**
- Location: `src/proxy.ts`.
- Responsibilities: Refresh Supabase cookies, validate page sessions with `auth.getUser()`, and redirect protected page routes.

**API surface:**
- Location: `src/app/api/`.
- Responsibilities: Domain-specific authenticated HTTP boundaries for companies, invitations, users, spaces, Presence, messaging, and test support.

## Architectural Constraints

- **Runtime:** React/Next.js executes on a single-threaded event loop; concurrency correctness belongs in PostgreSQL transactions/RPCs, not client timing.
- **Auth IDs:** `users.id` is the application UUID; `users.supabase_uid` maps to `auth.uid()`.
- **Service role:** Privileged clients never replace application authorization checks and never enter client code.
- **Presence:** Apply `.agents/skills/presence-safety/SKILL.md`; movement has one server-authoritative transition path and strict multi-user test gates.
- **WebRTC topology:** Current audio is a P2P mesh with a soft warning at eight peers; video expansion must account for mesh scaling.
- **Provider ordering:** Components beneath `PresenceRouteBoundary` assume Auth, company, messaging, and query providers already exist.

## Anti-Patterns

### Direct client ownership of authoritative Presence state

**What happens:** Local or Realtime-only state is treated as proof of persisted occupancy.
**Why it's wrong:** Reload, reconnect, multi-tab, and delayed events can diverge from database state.
**Do this instead:** Use `src/hooks/useLocationTransition.ts`, `src/app/api/presence/location/route.ts`, and reconciled snapshots.

### Unscoped service-role access

**What happens:** A service-role query is used without first validating the caller and tenant relationship.
**Why it's wrong:** RLS is bypassed and cross-company data becomes reachable.
**Do this instead:** Authenticate with `auth.getUser()`, resolve the application user, authorize company/resource scope, then use the service client narrowly as shown by `src/lib/auth/authorize.ts`.

## Error Handling

**Strategy:** Validate at boundaries, return stable error codes/statuses, keep logs diagnostic, and present friendly client errors.

**Patterns:**
- `ApiError` and response parsing in `src/lib/api/client-error.ts`.
- Zod validation in Presence and membership contracts.
- Sanitized internal errors in `src/app/api/presence/location/route.ts`.
- User-facing Auth error mapping in `src/lib/auth/error-messages.ts`.
- Query/mutation failures are surfaced through hooks and Sonner where appropriate.

## Cross-Cutting Concerns

**Logging:** Console plus scoped `src/utils/debug-logger.ts`; Auth/Presence have dedicated metrics/evidence scripts.
**Validation:** Zod at newer critical boundaries; older routes still contain manual parsing and regex validation.
**Authentication:** Supabase `auth.getUser()` on server boundaries; proxy protection for pages; route-specific authorization for APIs.

---

*Architecture analysis: 2026-07-22*
