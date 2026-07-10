# Phase 0 — Writer/caller inventory (2026-07-10, HEAD = handoff commit on staging)

Grep-based inventory of every file referencing presence placement, status, knock, and legacy storage keys. This is the allowlist basis for the movement-gate/CI check. Verified against the handoff's audited inventory from `b18ab26`; deltas noted at the end.

## Location/placement writers and callers

| Pattern | Files |
|---|---|
| `/api/users/location` (HTTP callers) | `src/hooks/useLastSpace.ts`, `src/hooks/useUserPresence.ts` |
| `updateLocation` | `src/app/api/users/location/route.ts`, `floor-plan.tsx`, `ModernFloorPlan.tsx`, `useModernFloorPlanKnock.ts`, `PresenceContext.tsx`, `useLastSpace.ts`, `useUserCalling.ts`, `useUserPresence.ts`, `SupabaseUserRepository.ts`, `IUserRepository.ts` |
| `updateCurrentSpace` | `SupabaseUserRepository.ts` (only) |
| `remove_user_from_all_spaces` RPC caller | `SupabaseUserRepository.ts` (only) — live RPC is a no-op; drop RPC after this caller is removed |
| `current_space_id` (raw column) | knock request route, location route, `useUserPresence.ts`, `SupabaseUserRepository.ts`, `realtime-presence.test.ts`, `types/ui.ts` |
| `currentSpaceId` (camel) | knock respond route, location route, remove-from-company route, **sync-profile route**, component-test page, floor-plan.tsx, AvatarGroup, ModernUserAvatar, useModernFloorPlanKnock, message-item, AuthContext, PresenceContext, presence-utils, useLastSpace, useUserPresence, messaging-test-seeder, types/database.ts, types/ui.ts |

## `space_presence_log` writers

- `src/app/api/users/location/route.ts` (`syncSpacePresenceLog`) — only application writer.

## `last_active` / status writers

- `last_active` (column): location route, users/update route, useUserPresence, SupabaseUserRepository (repository `update` always writes it).
- `/api/users/update` callers: ProfileForm, AuthContext, CompanyContext, ThemeContext, lib/api.ts.
- Client column-grant substrate: authenticated may UPDATE `users.status` and `users.last_active` directly (live column grants; see catalog doc).

## Knock

- `knock_requests` (table refs): knock request route, knock respond route, location route, `useKnockSignaling.ts` (postgres_changes subscription).
- `vo-knock-cooldown-<spaceId>` storage key: `src/hooks/useKnock.ts`.

## sendBeacon

- `src/hooks/useUserPresence.ts` (only).

## Storage keys

| Key | Files |
|---|---|
| `lastSpaceId` | floor-plan.tsx, useLastSpace.ts |
| `vo-disconnect-timestamp` | useLastSpace.ts, useUserPresence.ts |
| `vo-first-login-done` | useLastSpace.ts |
| `vo-knock-cooldown-<spaceId>` | useKnock.ts |

## Query keys

- `['user-presence']` (global, unscoped): useLastSpace.ts, useUserPresence.ts (CACHE-01 confirmed at HEAD).

## Direct `.from('users')` (server routes/lib)

auth/callback route, invitations create/list/resend/revoke, spaces/[id]/details, knock request, knock respond, users/location, `src/lib/auth/session.ts`, realtime-presence.test.ts.

## Deltas vs audited b18ab26 inventory

1. `src/app/api/users/sync-profile/route.ts` also handles `currentSpaceId` — add to Phase 3/10 route disposition review.
2. `src/hooks/useKnock.ts` owns the knock-cooldown storage key (handoff listed the key but not the file).
3. `src/lib/auth/session.ts` reads `users` directly (read-only; identity lookup).
4. `users.status` as literal SQL string: no hits in src/ (writes go through column grants / repository).
