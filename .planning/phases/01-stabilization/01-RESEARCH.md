# Phase 1: Stabilization - Research

**Researched:** 2026-02-24
**Domain:** Brownfield bug fixes, UI sizing alignment, audio cue replacement, tech debt cleanup
**Confidence:** HIGH

## Summary

Phase 1 addresses four stabilization requirements across an existing Next.js 15 + Supabase + React 19 application. The codebase is well-structured with clear separation of concerns (repositories, contexts, hooks, components). All four requirements involve modifying existing code -- no new features, no new libraries, no new architectural patterns.

The primary risk is **regression** -- changing existing working code. The floor plan sizing fix requires aligning Tailwind grid classes with the v3 design spec's `auto-fill` + `minmax()` approach. The auth fix requires diagnosing specific failure modes in existing login/signup/OAuth flows. The knock-to-enter fix is a verification task with a sound replacement. The avatar cleanup is straightforward file deletion with import updates.

**Primary recommendation:** Work requirement-by-requirement, smallest blast radius first. Start with avatar cleanup (STAB-04, pure deletion), then floor plan sizing (STAB-01, CSS-only), then knock verification (STAB-03, verify + sound swap), then auth fixes (STAB-02, most complex diagnosis needed).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Floor plan sizing must pixel-perfect match `docs/ux-space-grid-v3.html`
- Fixed grid layout -- desktop-only for now (mobile responsive deferred to v2, FLOR-05)
- Fix scope is sizing only -- card dimensions must match the spec. Internal content (avatars, labels, counts) is not in scope
- Three auth flows must work: email/password login, email/password signup, Google OAuth
- Error display: clear inline error messages next to the relevant form field -- no toast notifications
- Post-auth redirect: after successful login/signup, user lands on the floor plan page (not dashboard)
- Session expiry handling is out of scope
- Password reset and email verification are not in scope
- The knock-to-enter feature is already implemented and functional -- this is a verify-and-fix task
- Known issue: knock sound sometimes doesn't play -- fix sound reliability
- Replace current sound with a soft knock effect (realistic door knocking, not a doorbell)
- If timeout behavior is found broken during verification, fix it (auto-dismiss with "No one responded" message)
- Remove `UserAvatar` component (`src/components/floor-plan/user-avatar.tsx`)
- Remove `AvatarShowcase` component (`src/components/examples/AvatarShowcase.tsx`)
- Remove all debug avatar pages: `src/app/debug/avatars/`, `src/app/debug/avatarShowcase/`, `src/app/avatar-showcase/`, `src/app/(dashboard)/avatar-demo/`
- Keep all legitimate specialized wrappers: UserAvatarPresence, ModernUserAvatar, AvatarGroup, InteractiveUserAvatar

### Claude's Discretion
- Floor plan overflow strategy (scroll container vs page scroll)
- Exact knock sound file selection (as long as it's a soft knock effect)
- How to verify knock-to-enter timeout stability (manual testing approach)
- Import cleanup strategy for removed avatar components

### Deferred Ideas (OUT OF SCOPE)
- Mobile responsive floor plan -- v2 requirement (FLOR-05)
- Session expiry handling (auto-redirect to login) -- future stabilization
- Password reset and email verification flows -- separate scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAB-01 | Floor plan space cards render at correct size matching v3 design spec (`docs/ux-space-grid-v3.html`) | Grid sizing analysis below: spec uses `auto-fill` + `minmax()`, current code uses fixed breakpoint `grid-cols-*`. CSS-only fix in `ModernFloorPlan.tsx` |
| STAB-02 | Auth login and signup flows work without errors on current branch | Auth flow analysis below: login redirects to `/onboarding` instead of floor plan, error handling uses toasts despite inline being required, three flows identified with specific fix points |
| STAB-03 | Knock to Enter channel timeout does not cause stale state or broken UI | Knock system analysis below: timeout handling exists and looks correct, sound uses synthesized oscillator instead of realistic knock audio file, channel timeout has polling fallback |
| STAB-04 | Avatar components consolidated -- no references to deprecated avatar components | Avatar audit below: 2 files + 4 debug pages to remove, no cross-imports from production code, clean deletion path confirmed |
</phase_requirements>

## Standard Stack

This phase uses exclusively what's already in the codebase. No new libraries needed.

### Core (Already Installed)
| Library | Version | Purpose | Relevance to Phase |
|---------|---------|---------|---------------------|
| Next.js | 15.3.0 | App Router, Server Components | Auth callback route, floor plan page route |
| React | 19.1.0 | UI rendering | All components being modified |
| Tailwind CSS | 4.1.3 | Utility-first CSS | Floor plan grid sizing (STAB-01) |
| Supabase JS | latest | Auth + Realtime | Auth flows (STAB-02), Knock signaling (STAB-03) |
| sonner | latest | Toast notifications | Knock toast (STAB-03, currently used for auth too) |

### Supporting
| Library | Purpose | When Used |
|---------|---------|-----------|
| Web Audio API | Browser-native | Knock sound generation (STAB-03) |
| Vitest | Unit testing | Existing tests for useKnock, login page |

### No New Dependencies
This phase requires zero new npm packages. All fixes use existing stack.

## Architecture Patterns

### Existing Project Structure (Relevant Files)
```
src/
├── app/(auth)/login/page.tsx         # Login page (STAB-02)
├── app/(auth)/signup/page.tsx        # Signup page (STAB-02)
├── app/api/auth/callback/route.ts    # OAuth callback (STAB-02)
├── app/(dashboard)/floor-plan/       # Floor plan page (STAB-01)
├── components/floor-plan/modern/
│   ├── ModernFloorPlan.tsx           # Grid layout classes (STAB-01)
│   ├── ModernSpaceCard.tsx           # Card component (STAB-01)
│   └── KnockToast.tsx               # Knock notification (STAB-03)
├── components/floor-plan/
│   └── user-avatar.tsx               # TO DELETE (STAB-04)
├── components/examples/
│   └── AvatarShowcase.tsx            # TO DELETE (STAB-04)
├── hooks/
│   ├── useKnock.ts                   # Knock state machine (STAB-03)
│   └── realtime/useKnockSignaling.ts # Knock realtime (STAB-03)
├── contexts/AuthContext.tsx           # Auth provider (STAB-02)
└── lib/auth/error-messages.ts        # Error mapping (STAB-02)
```

### Pattern 1: Floor Plan Grid Sizing (STAB-01)

**What:** The v3 design spec uses CSS Grid with `auto-fill` + `minmax()` for fluid, responsive card sizing. The current implementation uses Tailwind's fixed-breakpoint `grid-cols-*` classes, which produces different sizing behavior.

**Current implementation (ModernFloorPlan.tsx line 47-51):**
```typescript
const perspectiveGridClasses: Record<FloorPlanPerspective, string> = {
  orbit: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6',
  analyst: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4',
  cinema: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8',
};
```

**v3 spec grid (ux-space-grid-v3.html lines 78-80):**
```css
.layout-orbit .grid-canvas { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.layout-analyst .grid-canvas { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.layout-cinema .grid-canvas { grid-template-columns: repeat(auto-fill, minmax(450px, 1fr)); }
```

**Key difference:** The spec's `auto-fill` + `minmax(320px, 1fr)` means cards have a minimum width of 320px and grow fluidly to fill available space. The current `grid-cols-*` approach forces a specific number of columns at each breakpoint, which doesn't match.

**Fix approach:** Use Tailwind's arbitrary grid value syntax: `grid-cols-[repeat(auto-fill,minmax(320px,1fr))]` or apply inline styles. The spec also uses `gap: 1.5rem` (orbit), `gap: 1rem` (analyst), and no explicit gap for cinema (uses the 1.5rem default -- but the spec HTML says none, so we need to verify).

**Additional sizing considerations:**
- The spec container uses `max-width: 1600px` and `padding: 2rem`. The current DashboardShell already has `max-w-[1600px]` (and the diff shows `fullWidth` being added to bypass it). Need to verify the container width matches spec.
- Space card uses `border-radius: 20px`, `padding: 1.5rem` in the spec. Current GlassPanel uses `rounded-2xl` (16px) and `p-6` (24px). The ModernSpaceCard overrides padding per variant.

### Pattern 2: Auth Error Handling (STAB-02)

**What:** Auth pages currently use a mix of inline errors AND toast notifications (via `showError` from `useNotification`). The requirement is inline-only, no toasts.

**Current login page error flow:**
```typescript
// Line 96-98: Uses BOTH inline error AND toast
const friendlyMessage = mapSupabaseAuthError(error);
showError({ description: friendlyMessage }); // Toast
setFormError(friendlyMessage);               // Inline
```

**Fix approach:** Remove all `showError()` and `showSuccess()` calls from login and signup pages. The inline error display already exists via `formError` state and the error div. Success feedback should be via status message or redirect, not toasts.

### Pattern 3: Post-Auth Redirect (STAB-02)

**What:** After login, user should land on floor plan page. Currently:
- Login page (line 69): `router.push('/onboarding')`
- Auth callback (line 85): redirects to `/dashboard` (if has company) or `/onboarding`
- Signup page (line 105): `router.push('/onboarding')` after Google

**Fix approach:** Change redirect targets:
- Login success: `router.push('/floor-plan')` instead of `/onboarding`
- Auth callback: `/floor-plan` instead of `/dashboard` for users with company
- Need to handle the case where user has no company yet (still needs onboarding)

**Note:** The redirect logic must account for users who haven't completed onboarding (no company). For those users, `/onboarding` is still correct. Only users with a company should go to `/floor-plan`.

### Pattern 4: Knock Sound Replacement (STAB-03)

**What:** The current knock cue uses Web Audio API to synthesize a short sine wave tone (280Hz descending to 220Hz over 0.24s). This doesn't sound like a door knock at all -- it's an electronic blip.

**Current implementation (ModernFloorPlan.tsx lines 109-131):**
```typescript
const playKnockCue = useCallback(() => {
  const oscillator = audioContext.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(280, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.2);
  // ... very quiet, very short
}, []);
```

**Why it sometimes doesn't play:** The `audioContextRef.current` can be null if the user hasn't interacted with the page yet (browser autoplay policy). The `warmUpAudioContext` function on `onClickCapture` should handle this, but there's a race condition: if the first interaction IS a knock request arriving (before any click), the AudioContext won't be warmed up yet.

**Fix approach (two options, Claude's discretion on sound file):**

Option A: Use a pre-recorded knock audio file (`/public/sounds/knock.mp3`). Use `new Audio('/sounds/knock.mp3')` which doesn't require AudioContext to be pre-warmed. This is more reliable and sounds realistic.

Option B: Improve the Web Audio API synthesis to sound more like a knock (short burst, wood-like timbre using noise + bandpass filter). Still has the AudioContext warming issue.

**Recommendation:** Option A -- pre-recorded audio file. More reliable, sounds better, simpler code. Source a royalty-free soft knock sound effect.

### Anti-Patterns to Avoid
- **Don't add new CSS frameworks** for the grid fix -- pure Tailwind/CSS change
- **Don't restructure auth flow** -- just fix redirects and error display
- **Don't refactor knock system** -- verify and fix only
- **Don't create new avatar wrapper components** -- only delete deprecated ones

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Knock sound | Web Audio API synthesis of knock | Pre-recorded `.mp3` file | Realistic audio is impossible to synthesize well; `new Audio()` is simpler and more reliable than AudioContext |
| Grid sizing | Custom JavaScript-based grid | CSS `auto-fill` + `minmax()` | Browser handles responsive columns natively; no JS needed |
| Auth error mapping | Custom error message logic | Existing `mapSupabaseAuthError()` | Already handles all known Supabase error codes in `src/lib/auth/error-messages.ts` |

## Common Pitfalls

### Pitfall 1: Tailwind 4 Arbitrary Grid Values
**What goes wrong:** Tailwind 4 has different syntax for arbitrary values compared to Tailwind 3. The bracket notation for `grid-template-columns` may need special handling.
**Why it happens:** Tailwind 4 moved to a JIT-only engine with different parsing rules.
**How to avoid:** Test the arbitrary value syntax `grid-cols-[repeat(auto-fill,minmax(320px,1fr))]` in the dev server. If Tailwind 4 doesn't support this syntax, use inline `style` prop on the grid container instead.
**Warning signs:** Cards not rendering in grid layout, or all appearing in a single column.

### Pitfall 2: Browser Autoplay Policy for Audio
**What goes wrong:** `new Audio().play()` can fail silently if no user gesture has occurred.
**Why it happens:** Chrome, Firefox, Safari all require at least one user interaction before playing audio.
**How to avoid:** The knock sound plays in response to a received knock (while user is using the app), so a user gesture has almost certainly occurred. But to be safe, catch the play() promise rejection and log it -- don't let it break the knock flow.
**Warning signs:** Knock notification appears but no sound plays on first visit.

### Pitfall 3: Auth Redirect Loop
**What goes wrong:** Changing redirect targets can create loops (e.g., floor-plan requires auth, which redirects to login, which redirects to floor-plan).
**Why it happens:** The middleware or auth guards redirect unauthenticated users.
**How to avoid:** Verify the auth middleware allows the floor plan page for authenticated users. Note: the project has no `middleware.ts` file (verified), so auth is handled at the context level, not at the middleware level. The `FloorPlan` component checks `isAuthReady` and `isCompanyLoading` before rendering.
**Warning signs:** Infinite redirect loop in browser, blank page after login.

### Pitfall 4: Deleting Files With Active Imports
**What goes wrong:** Removing a component file that's still imported somewhere causes build failure.
**Why it happens:** Import references exist in unexpected places (barrel exports, type-only imports, comments).
**How to avoid:** Before deleting, grep the entire codebase for the component name AND the file path. Verified findings:
- `UserAvatar` from `user-avatar.tsx`: **No production imports found** -- only self-contained, no other file imports it.
- `AvatarShowcase` from `examples/AvatarShowcase.tsx`: Imported by `src/app/avatar-showcase/page.tsx` only -- which is also being deleted.
**Warning signs:** TypeScript compilation errors, `npm run build` failures.

### Pitfall 5: Portuguese vs English UI Text
**What goes wrong:** Auth pages are currently in Portuguese (e.g., "Bem-vindo de volta", "Entrando..."). Mixing languages or changing to English inconsistently.
**Why it happens:** The codebase has Portuguese auth pages but English everywhere else.
**How to avoid:** This is out of scope for Phase 1. Don't change UI text language -- only fix functionality. If the user wants language changes, that's a separate task.
**Warning signs:** N/A -- leave as-is.

## Code Examples

### STAB-01: Grid Fix (v3 Spec Alignment)
```typescript
// ModernFloorPlan.tsx - Replace perspectiveGridClasses
const perspectiveGridClasses: Record<FloorPlanPerspective, string> = {
  orbit: 'grid gap-6',   // grid-template-columns via style
  analyst: 'grid gap-4',  // grid-template-columns via style
  cinema: 'grid gap-6',   // grid-template-columns via style
};

// Apply minmax via inline style on the grid container:
const perspectiveGridStyles: Record<FloorPlanPerspective, React.CSSProperties> = {
  orbit: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' },
  analyst: { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' },
  cinema: { gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))' },
};

// Usage in JSX:
<div className={gridLayoutClass} style={perspectiveGridStyles[perspective]}>
```

### STAB-02: Auth Redirect Fix
```typescript
// login/page.tsx - Change redirect after successful login
useEffect(() => {
  if (!isAuthReady) return;
  if (!user || companyLoading) return;

  const redirectTimer = setTimeout(() => {
    // Redirect to floor plan if user has a company, onboarding otherwise
    router.push('/floor-plan');  // Changed from '/onboarding'
  }, 400);

  return () => clearTimeout(redirectTimer);
}, [companyLoading, isAuthReady, router, user]);
```

```typescript
// auth/callback/route.ts - Change post-OAuth redirect
const hasCompany = !!userRow?.company_id;
const redirectPath = hasCompany ? '/floor-plan' : '/onboarding';  // Changed from '/dashboard'
```

### STAB-02: Inline Error Only (Remove Toasts)
```typescript
// login/page.tsx - Remove toast calls, keep inline error
try {
  await signIn(email, password);
  // No showSuccess toast -- redirect handles success
  setStatusMessage('Redirecting...');
} catch (error) {
  const friendlyMessage = mapSupabaseAuthError(error);
  // REMOVED: showError({ description: friendlyMessage });
  setFormError(friendlyMessage);  // Inline error only
}
```

### STAB-03: Knock Sound Replacement
```typescript
// ModernFloorPlan.tsx - Replace playKnockCue
const playKnockCue = useCallback(() => {
  try {
    const audio = new Audio('/sounds/knock.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Autoplay policy prevented playback -- not critical
    });
  } catch {
    // Sound cue is best-effort
  }
}, []);
```

### STAB-04: File Deletion List
```
# Files to DELETE:
src/components/floor-plan/user-avatar.tsx
src/components/examples/AvatarShowcase.tsx
src/app/debug/avatars/page.tsx
src/app/debug/avatarShowcase/page.tsx
src/app/avatar-showcase/page.tsx
src/app/(dashboard)/avatar-demo/page.tsx

# Import to UPDATE (only one found):
# src/app/avatar-showcase/page.tsx imports AvatarShowcase -- but this file is also being deleted
# No production code imports either deleted component
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Tailwind 3 `grid-cols-*` breakpoints | CSS `auto-fill` + `minmax()` for fluid grids | Cards resize fluidly instead of jumping at breakpoints |
| Web Audio API oscillator for knock sound | Pre-recorded audio file via `new Audio()` | Realistic sound, no AudioContext warming needed |
| Auth redirect to `/dashboard` or `/onboarding` | Redirect to `/floor-plan` (the core experience) | Users immediately see the spatial office after login |

## Open Questions

1. **Exact knock sound file**
   - What we know: User wants a "soft knock effect (realistic door knocking, not a doorbell)"
   - What's unclear: Where to source the audio file
   - Recommendation: Use a royalty-free knock sound effect. Can generate one via Web Audio API with more sophisticated synthesis if needed, but a real recording is better. Place at `/public/sounds/knock.mp3`. Budget ~5KB for a short knock (< 1 second).

2. **Container width for floor plan**
   - What we know: The v3 spec uses `max-width: 1600px` with `padding: 2rem`. The current branch already added `fullWidth` prop to DashboardShell which removes the `max-w-[1600px]`.
   - What's unclear: Whether the floor plan should use `fullWidth` (no max-width) or match the spec's 1600px constraint.
   - Recommendation: Keep the `max-w-[1600px]` constraint to match the spec. The `fullWidth` change on the current branch may need to be reverted. The floor plan page should use `<DashboardShell>` without `fullWidth`.

3. **Auth flow diagnosis scope**
   - What we know: STATE.md says "Auth login/signup has undiagnosed issues (STAB-02)". The code reads correctly -- standard Supabase auth.
   - What's unclear: What specific errors occur. The code itself looks correct for standard flows.
   - Recommendation: Implementation should start by running the app and attempting login/signup to identify the actual errors. The code paths are all present; the issues may be configuration-related (Supabase project settings, Google OAuth credentials, email confirmation settings).

4. **Knock timeout stale state**
   - What we know: The `useKnock` hook transitions to `'timeout'` after 30s and calls `knock.reset()`. The `useEffect` in `ModernFloorPlan.tsx` (line 286-296) catches the `'timeout'` status, clears the active request ID, shows a warning toast, and resets.
   - What's unclear: Whether this actually causes stale state in practice. The code looks correct.
   - Recommendation: Manual verification during implementation. The existing test suite (`__tests__/hooks/useKnock.test.ts`) covers the state machine. Focus on verifying the integration between `useKnock`, `useKnockSignaling`, and `ModernFloorPlan`.

## Detailed Codebase Findings

### STAB-01: Floor Plan Sizing

**Files to modify:**
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` -- `perspectiveGridClasses` constant (lines 47-51)
- Possibly `src/app/(dashboard)/floor-plan/page.tsx` -- revert `fullWidth` if needed
- Possibly `src/components/shell/dashboard-shell.tsx` -- verify max-width behavior

**V3 spec sizing values:**
- Orbit: `minmax(320px, 1fr)`, gap: 1.5rem
- Analyst: `minmax(240px, 1fr)`, gap: 1rem
- Cinema: `minmax(450px, 1fr)`, gap: implicit (spec doesn't specify, likely 1.5rem)
- Container: `max-width: 1600px`, `padding: 2rem`

**Card styling from spec:**
- `border-radius: 20px` (current: `rounded-2xl` = 16px via GlassPanel)
- `padding: 1.5rem` (current: varies by variant -- orbit: `p-4`, analyst: `p-3`, cinema: `p-6`)
- `backdrop-filter: blur(12px)` (current: `backdrop-blur-xl` = 24px via GlassPanel)

**Note:** The scope says "sizing only -- card dimensions must match the spec. Internal content is not in scope." This means: fix the grid columns (minmax values) and container. Card padding/radius/blur differences are internal content and should NOT be changed in this phase.

### STAB-02: Auth Flows

**Files to modify:**
- `src/app/(auth)/login/page.tsx` -- redirect target, remove toasts
- `src/app/(auth)/signup/page.tsx` -- redirect target, remove toasts
- `src/app/api/auth/callback/route.ts` -- redirect target for OAuth

**Current redirect targets:**
| Flow | Current Target | Required Target |
|------|---------------|-----------------|
| Login success (has user) | `/onboarding` | `/floor-plan` |
| Signup success (Google) | `/onboarding` | `/floor-plan` (if company) or `/onboarding` |
| OAuth callback (has company) | `/dashboard` | `/floor-plan` |
| OAuth callback (no company) | `/onboarding` | `/onboarding` (correct) |

**Error handling changes:**
- Login: Remove `showError()` calls (lines 97, 117-118), remove `showSuccess()` (line 88)
- Signup: Remove `showError()` calls (lines 73, 87, 109), remove `showSuccess()` (lines 84, 104)

**Existing inline error display:** Both pages already have `formError` state + error div with role="alert". These are correct and should be kept.

### STAB-03: Knock to Enter

**Files to modify:**
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` -- replace `playKnockCue` function, possibly remove `audioContextRef` and `warmUpAudioContext` if no longer needed
- Add `/public/sounds/knock.mp3` (new audio file)

**Timeout flow verification:**
1. User clicks on private space -> `handleKnock` called -> `knock.knock(spaceId)` starts 30s timer
2. Timer fires -> `setStatus('timeout')` in useKnock
3. `useEffect` in ModernFloorPlan (line 286) catches status='timeout' -> clears activeKnockRequestIdRef, shows toast, calls `knock.reset()`
4. This flow looks correct. The `reset()` clears status back to 'idle' and nulls targetSpaceId.

**Potential stale state issue:** If the knock channel (`useKnockSignaling`) times out (TIMED_OUT), the polling fallback kicks in every 2 seconds. But if the user's knock times out client-side (30s) while a response is in flight via polling, the response might arrive after reset. The `handleKnockResponse` checks `activeKnockRequestIdRef.current`, which is nulled on timeout, so late responses would be dropped. This is correct behavior.

**Sound reliability issue:** The current `playKnockCue` depends on:
1. `audioContextRef.current` being non-null (requires prior user interaction)
2. AudioContext not being in 'closed' state
3. `warmUpAudioContext` having been called via `onClickCapture` on the container

The AudioContext approach is fragile because receiving a knock (via realtime) can happen before the user has clicked anything on the floor plan. The `onClickCapture` handler on the floor plan container only fires on user clicks inside that container. If the user navigated to the page but hasn't clicked, the AudioContext won't be warmed up.

**Fix:** Replace with `new Audio('/sounds/knock.mp3')` which doesn't require AudioContext pre-warming. The Audio constructor works without user gesture for creating the object; `.play()` may still fail due to autoplay policy but this is handled by catching the rejected promise.

### STAB-04: Avatar Cleanup

**Files to DELETE (verified no production cross-imports):**

| File | Type | Imported By |
|------|------|-------------|
| `src/components/floor-plan/user-avatar.tsx` | Component | Nothing (dead code) |
| `src/components/examples/AvatarShowcase.tsx` | Component | Only `src/app/avatar-showcase/page.tsx` (also deleted) |
| `src/app/debug/avatars/page.tsx` | Page | Nothing (route-only) |
| `src/app/debug/avatarShowcase/page.tsx` | Page | Nothing (route-only) |
| `src/app/avatar-showcase/page.tsx` | Page | Nothing (route-only) |
| `src/app/(dashboard)/avatar-demo/page.tsx` | Page | Nothing (route-only) |

**Additional debug pages found (not avatar-related, NOT deleting):**
- `src/app/debug/messaging-test/page.tsx`
- `src/app/debug/messaging-comparison/page.tsx`

**Canonical avatar components (KEEP):**
- `src/components/ui/enhanced-avatar-v2.tsx` -- EnhancedAvatarV2
- `src/components/profile/UploadableAvatar.tsx` -- UploadableAvatar (assumed path)
- `src/components/floor-plan/UserAvatarPresence.tsx` -- Adds presence indicators
- `src/components/floor-plan/modern/ModernUserAvatar.tsx` -- Floor plan context
- `src/components/floor-plan/modern/AvatarGroup.tsx` -- Grouped display
- `src/components/messaging/InteractiveUserAvatar.tsx` -- Interaction menus

### Branch State

The current branch (`feature/design-improvements`) has uncommitted changes:
1. Floor plan page: added `fullWidth` to DashboardShell, added flex centering
2. globals.css: added VO theme variable mappings for Tailwind 4
3. ModernFloorPlan.tsx: added xl/2xl breakpoint columns (still not matching spec)
4. dashboard-shell.tsx: added `fullWidth` prop
5. glass-panel.tsx: added `group` class

These changes are partially aligned with the spec but incomplete. The grid classes still use fixed breakpoints instead of auto-fill + minmax.

## Sources

### Primary (HIGH confidence)
- `docs/ux-space-grid-v3.html` -- Authoritative v3 design spec (local file, verified)
- `src/components/floor-plan/modern/ModernFloorPlan.tsx` -- Current grid implementation (local file, verified)
- `src/app/(auth)/login/page.tsx` -- Current login flow (local file, verified)
- `src/app/(auth)/signup/page.tsx` -- Current signup flow (local file, verified)
- `src/app/api/auth/callback/route.ts` -- Current OAuth callback (local file, verified)
- `src/hooks/useKnock.ts` -- Knock state machine (local file, verified)
- `src/hooks/realtime/useKnockSignaling.ts` -- Knock realtime signaling (local file, verified)
- Grep results for UserAvatar and AvatarShowcase imports (verified, no production imports)

### Secondary (MEDIUM confidence)
- `src/styles/themes/tokens.css` -- Theme token system (local file, verified)
- `__tests__/hooks/useKnock.test.ts` -- Existing knock tests (local file, verified)
- `__tests__/app/auth/login-page.test.tsx` -- Existing login tests (local file, verified)
- Tailwind CSS 4 arbitrary value syntax -- based on Tailwind docs knowledge

### Tertiary (LOW confidence)
- Auth "undiagnosed issues" -- STATE.md mentions issues but no specific error descriptions found. Actual diagnosis requires running the application.
- Knock sound reliability -- analysis is based on code reading, not runtime testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing code
- Architecture: HIGH -- all patterns are existing patterns in this codebase
- Pitfalls: HIGH -- identified from direct code analysis and CSS spec comparison
- STAB-01 (sizing): HIGH -- clear gap between spec and implementation, clear fix path
- STAB-02 (auth): MEDIUM -- code looks correct; actual errors may be configuration-related, not code-related
- STAB-03 (knock): HIGH -- sound issue clearly identified; timeout flow verified in code
- STAB-04 (avatars): HIGH -- clean deletion path, no cross-dependencies confirmed

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable codebase, no external dependency concerns)
