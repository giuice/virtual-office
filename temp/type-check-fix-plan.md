# Type-Check Fix Plan — feature/user_consolidation

Goal: Resolve all current `tsc --noEmit` errors and align code with the project’s SSR + DI constraints.

## Summary of Errors (from last run)
1) `src/app/api/auth/callback/route.ts`: Incorrect import name from `google-avatar-service` (uses `googleAvatarService` but export is `GoogleAvatarService`).
2) `src/app/api/companies/cleanup.ts`: (fixed) Needed Supabase client injection for `SupabaseCompanyRepository`.
3) Floor plan types and props mismatches:
   - `src/components/floor-plan/floor-plan.tsx`: RoomTemplate type mismatch between `src/types/database` and `src/components/floor-plan/types`.
   - `src/components/floor-plan/modern/ModernFloorPlan.tsx`: `updateInProgress` not in `PresenceContextType`.
   - `src/components/floor-plan/modern/ModernSpaceCard.tsx`: AvatarGroup `size` prop expects 'sm'|'md'|'lg'|'xl', code passes 'xs'.
   - `src/components/floor-plan/room-dialog/view-room-tabs.tsx`: Refers to `userIds` on `Space`, but `Space` doesn’t have `userIds`.
   - `src/components/floor-plan/user-avatar.tsx`: Compares `user.status` to 'active' but `UserStatus` is different.
4) Presence hooks fields:
   - `src/hooks/useConversationPresence.ts`: `user.displayName` does not exist on `User`.
   - `src/hooks/useUserPresence.ts`: `debouncedUpdateLocation` used before declaration.
5) Client-only / build-time imports:
   - `src/lib/api.ts`: importing internal vitest chunk — remove/refactor.
   - `src/providers/theme-provider.tsx`: `next-themes/dist/types` import path mismatch.
6) Tailwind config typing:
   - `tailwind.config.ts`: `darkMode` typing mismatch with v4 types.
7) DI adjustments in client hook:
   - `src/hooks/queries/useSpaces.ts`: (fixed) Construct repo with `createSupabaseBrowserClient()`.

## Fix Plan by File

### 1) src/app/api/auth/callback/route.ts
- Change import to `import { GoogleAvatarService } from '@/lib/services/google-avatar-service'` or, if using an instance, construct: `const googleAvatarService = new GoogleAvatarService(...)`.
- Ensure no barrel import side effects; import repository types directly if needed.
- Verify: `tsc` no longer shows missing export error.

### 2) src/app/api/companies/cleanup.ts (done)
- Already updated to `new SupabaseCompanyRepository(supabase)`.
- Verify: no errors in this file.

### 3) Floor Plan — Types and Props
- `src/components/floor-plan/floor-plan.tsx`
  - Align RoomTemplate type: ensure both usage and state use the same type source.
  - Option A: Import and use `RoomTemplate` from `src/components/floor-plan/types` everywhere in that component.
  - Option B: Map DB `RoomTemplate` to UI `RoomTemplate` when setting state.
  - Fix setState generic if needed: `setUserTemplates((prev: RoomTemplate[]) => [...prev, template])` with the correct `RoomTemplate` type.
- `src/components/floor-plan/modern/ModernFloorPlan.tsx`
  - Remove `updateInProgress` from destructure unless defined in `PresenceContextType`.
  
- `src/components/floor-plan/modern/ModernSpaceCard.tsx`
  - Replace `'xs'` with `'sm'` or extend `AvatarGroup` types to include `'xs'` if intended. Safer: use `'sm'`.
- `src/components/floor-plan/room-dialog/view-room-tabs.tsx`
  - Remove `'userIds'` from the list passed to `pick`/`select`/whitelist arrays.
  - Remove usages of `roomData.userIds`; if needed, derive people count from presence or related query instead of `Space`.
- `src/components/floor-plan/user-avatar.tsx`
  - Replace string comparison with enum-safe check. Example:
    - If `UserStatus` has `'online' | 'offline' | ...'`, map from current user model fields accordingly.
    - Or if `user.status` is a `UserStatus`, compare to `UserStatus.ACTIVE` (if defined) or adjust logic to a consistent status mapping function.

### 4) Presence Hooks
- `src/hooks/useConversationPresence.ts`
  - Replace `user.displayName` with `user.name` or `user.fullName` based on `src/types/auth.ts` User definition.
  - If `User` has `display_name` in DB, ensure the type reflects `displayName` camelized.
- `src/hooks/useUserPresence.ts`
  - Define `debouncedUpdateLocation` before first use:
    - Move the `useMemo` declaration above any effect that calls `.cancel()` or awaits it, or guard with optional chaining.
    - Example: Place the `useMemo` at top, then effects below; and wrap cancel with `debouncedUpdateLocation?.cancel?.()`.

### 5) Client/Build Imports
- `src/lib/api.ts`
  - Remove import of internal vitest file. If this file is only used in tests, gate with `if (process.env.NODE_ENV === 'test')` and require dynamically, or delete the file if dead code.
- `src/providers/theme-provider.tsx`
  - Update import to `import { type ThemeProviderProps } from 'next-themes'` (top-level), or use local typing without importing internal `dist/types`.

### 6) Tailwind
- `tailwind.config.ts`
  - With Tailwind v4, fix typing by using the expected literal union or cast. Example:
    ```ts
    import type { Config } from 'tailwindcss';
    export default {
      darkMode: 'class',
      // ...
    } satisfies Config;
    ```
  - Replace `darkMode: ["class"]` with `darkMode: 'class'`.

### 7) Remaining DI Cleanups (for completeness)
- Repositories still importing browser client server-side:
  - Invitation, MeetingNote, Announcement, SpaceReservation repositories.
  - Convert to constructor DI like done for Company and Space when used in server contexts.
  - Update any routes/services calling them to pass a server client.

## Execution Steps
1) Fix `auth/callback/route.ts` import and instantiation.
2) Floor plan fixes (types, props, userIds removal, Avatar size value).
3) Presence hooks field names and debounced variable placement/guards.
4) Remove/adjust problematic imports (`lib/api.ts`, `theme-provider.tsx`).
5) Tailwind config `darkMode` value.
6) (Optional next) Convert remaining repos to DI and update any affected routes/services.

## Verification
- Run:
  - `npm run type-check`
  - `npm run lint`
- If tests exist for affected modules, run:
  - `npm test -w` or `npm run test`
- Manually QA (dev server):
  - `npm run dev`, load pages touching presence/floor-plan to validate runtime behavior.

## Notes
- Keep to existing types in `src/types/`; do not create new types if an equivalent exists.
- Avoid barrel imports for repos in server code to prevent browser-client side effects.
- Ensure all server routes create a request-scoped Supabase client and inject it into repos.
