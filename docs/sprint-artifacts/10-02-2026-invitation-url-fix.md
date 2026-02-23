# Invitation System - Full Hardening Revision (2026-02-10)

## Scope

This document revises the original URL mismatch artifact with a complete invitation-system audit and hardening pass across:

- API routes (`create`, `resend`, `list`, `pending`, `validate`)
- Auth flow integration (`set-password`)
- user lookup endpoint used by join flow (`/api/users/get-by-id`)
- Supabase database policies/indexes/data consistency

## Verified Findings

### Critical

1. **Cross-company admin bypass in invite creation/resend**
   - In `create` and `resend`, `currentUser.role === 'admin'` could pass without confirming the admin belongs to the target company.
   - Impact: Admin from company A could operate on company B invitations if they knew IDs.

2. **Over-permissive RLS policy on invitations**
   - Policy `Anyone can validate invitation by token` had `USING (true)` for `SELECT`.
   - Impact: Public/anon read surface on `public.invitations` wider than intended.

3. **Expired invitations kept as pending**
   - Confirmed in DB before migration: `total_pending = 5`, `expired_still_pending = 3`.
   - Impact: wrong limit calculation, stale pending lists, invalid resend attempts.

### High

4. **set-password auto-accept could pick wrong company**
   - Flow accepted the latest pending invitation by email, not the original invite token.
   - Impact: user with multiple pending invites could be linked to unintended company.

5. **Unprotected `/api/users/get-by-id`**
   - No auth guard and no self-check for `supabase_uid`.
   - Impact: user/profile metadata could be enumerated by UID probing.

### Medium

6. **Invitation URL base derivation duplicated and Host-header dependent**
   - Multiple routes manually rebuilt `baseUrl` from `host` with local fallbacks.
   - Impact: inconsistency risk and maintenance overhead.

## Changes Applied

### API Route Hardening

- `src/app/api/invitations/create/route.ts`
  - Enforced company-scoped admin check:
    - `role=admin` now requires `users.company_id === target company`
    - still supports explicit `companies.admin_ids`
  - Added email format validation.
  - Added stale invitation expiry update before limit checks.
  - Limit now counts only `pending` + `expires_at > now`.
  - Standardized base URL resolution via `NEXT_PUBLIC_APP_URL` (validated) with safe fallback.
  - Added concurrent duplicate handling (`23505`) to reuse existing pending invite link.
  - Removed redundant `status` from repository create payload.

- `src/app/api/invitations/resend/route.ts`
  - Enforced company-scoped admin check.
  - Added expiration guard: pending-but-expired is marked `expired` and returns `410`.
  - Normalized invitation email before resend.
  - Standardized base URL resolution.

- `src/app/api/invitations/list/route.ts`
  - Added status input validation (`pending|accepted|expired`).
  - Expires stale invitations before listing.
  - Limit metrics now use DB counts for active pending invites, independent of list filter.
  - Standardized base URL resolution.

- `src/app/api/invitations/pending/route.ts`
  - Expires stale pending invitations for current user email before lookup.
  - Uses deterministic `email` equality after normalization strategy.

- `src/app/api/invitations/validate/route.ts`
  - Switched to server `service_role` client, enabling strict RLS policy cleanup on `invitations`.

- `src/app/api/users/get-by-id/route.ts`
  - Added authentication requirement.
  - Added self-access rule: requested `supabase_uid` must match authenticated user.

### Auth Flow Correction

- `src/app/(auth)/set-password/page.tsx`
  - Auto-accept now prioritizes the exact invitation token from `passwordSetReturnUrl`.
  - Email-based pending lookup is now fallback only.
  - Cleans `passwordSetReturnUrl` consistently before redirect decision.

### Database Hardening (Applied)

- New migration file:
  - `migrations/20260210_invitation_system_hardening.sql`
- Applied to Supabase as migration:
  - `invitation_system_hardening` (version `20260210123736`)

Migration actions:

1. Normalize invitation emails to lowercase.
2. Expire stale pending invitations.
3. Deduplicate active pending invitations (keep newest per `company_id + email`).
4. Remove over-permissive policy:
   - dropped `Anyone can validate invitation by token`.
5. Recreate invitation policies scoped to `authenticated` with initplan-friendly auth checks.
6. Add invitation performance/safety indexes:
   - `idx_invitations_pending_company_expires_at`
   - `idx_invitations_pending_company_email_created_at`
   - `idx_invitations_pending_email_expires_created_at`
   - `ux_invitations_pending_company_email` (unique partial)

## Post-Change Verification

### Database checks

- Pending consistency:
  - before: `total_pending=5`, `expired_still_pending=3`
  - after: `total_pending=2`, `expired_still_pending=0`
- Invitation policies now restricted to `authenticated` role only.
- New invitation indexes confirmed present.

### Test execution

Executed:

```bash
npm run test -- __tests__/api/invitations-create-limit.test.ts __tests__/api/invitations-list-revoke.test.ts __tests__/api/invitations-accept.test.ts __tests__/api/invitations-validate.test.ts __tests__/app/join-page.test.tsx
npm run type-check
```

Result:

- Invitation-focused tests passed (`49 passed` across selected suites).
- TypeScript check passed.
- `npm run lint` script is currently misconfigured in this repository (`next lint` interpreted with invalid directory argument).

## Notes

- `migrations/database-structure.md` does not reflect latest RLS flags/policies from the live project (example: `invitations` is RLS-enabled in live DB). Consider refreshing this artifact.

## Status

**Status: Pending user confirmation**
