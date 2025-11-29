# Story: Implement Platform Admin Role & Company Onboarding

**As a** Platform Admin (Virtual Office Staff),
**I want to** create new Companies and invite their initial Admin users,
**So that** I can onboard new paying customers to the SaaS platform.

## Context & Problem Analysis

### Current State (Broken)
The invitation system is **partially implemented but non-functional**:

1. **`/src/app/join/page.tsx`**: Uses randomly generated UUID instead of real Supabase Auth - **BROKEN**
2. **`/src/pages/accept-invite.tsx`**: References "Firebase Auth UI" placeholder - **BROKEN**  
3. **`/src/app/admin/invitations/page.tsx`**: Requires manual companyId input - **Awkward UX**
4. **`/api/invitations/create`**: Creates token but does NOT send email - **Incomplete**
5. **No Platform Admin concept exists** - only `admin` | `member` roles within a company

### Database Reality (from `migrations/database-structure.md`)
- Table is `companies` (NOT `organizations`)
- Enum `user_role` = `admin` | `member` (no `owner` or `platform_admin`)
- Table `invitations` exists with: `token`, `email`, `company_id`, `role`, `expires_at`, `status`
- Table `users` has `company_id` FK to `companies`

### Authentication System
- Uses Supabase Auth with OAuth (Google) + email/password
- Does NOT use Supabase native invite system (`supabase.auth.admin.inviteUserByEmail()`)
- Manual token-based invitations stored in `invitations` table

---

## Acceptance Criteria

### Phase 1: Fix Existing Invitation Flow (Pre-requisite)
- [ ] **1.1** Fix `/src/app/join/page.tsx` to use real Supabase Auth instead of random UUID
- [ ] **1.2** Replace `/src/pages/accept-invite.tsx` Firebase placeholder with Supabase Auth UI
- [ ] **1.3** Implement email sending in `/api/invitations/create` using Supabase Edge Function or Resend/SendGrid
- [ ] **1.4** Update `/src/components/dashboard/invite-user-dialog.tsx` to show invitation link (until email works)
- [ ] **1.5** Test complete flow: Create invitation → Copy link → Open link → Auth → Accept → Redirect to dashboard

### Phase 2: Platform Admin Role
- [ ] **2.1** Create `platform_admins` table: `id`, `user_id` (FK to auth.users), `created_at`
- [ ] **2.2** Platform Admin is NOT bound to any `company_id` (null company_id in `users` table)
- [ ] **2.3** Create RLS policy: Platform Admins can INSERT into `companies` table
- [ ] **2.4** Create RLS policy: Platform Admins can INSERT into `invitations` table for any company

### Phase 3: Company Creation Flow (Platform Admin Backoffice)
- [ ] **3.1** Create `/app/platform-admin/page.tsx` with auth guard (check `platform_admins` table)
- [ ] **3.2** UI Form: Company Name, Admin Email, Plan Type (free/pro/enterprise stored in `companies.settings`)
- [ ] **3.3** On submit:
  - Create `companies` record
  - Create `invitations` record with `role: admin`
  - Trigger invitation email to Admin
- [ ] **3.4** Show success with invitation link (backup if email fails)

### Phase 4: Security Constraints
- [ ] **4.1** Platform Admin CANNOT query `conversations`, `messages`, or `spaces` tables (RLS deny)
- [ ] **4.2** Company Admins CANNOT create new `companies` records (RLS deny)
- [ ] **4.3** Only Platform Admins can access `/platform-admin/*` routes (middleware check)

---

## Technical Notes

### Database Changes Required
```sql
-- New table for platform admins (separate from user_role enum)
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS Policies
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Only existing platform admins can view/manage other platform admins
CREATE POLICY "Platform admins can view platform_admins" ON platform_admins
  FOR SELECT USING (
    auth.uid()::text IN (SELECT user_id::text FROM platform_admins)
  );

-- Platform admins can create companies
CREATE POLICY "Platform admins can create companies" ON companies
  FOR INSERT WITH CHECK (
    auth.uid()::text IN (SELECT user_id::text FROM platform_admins)
  );
```

### Files to Modify
1. `src/app/join/page.tsx` - Replace fake UUID with Supabase Auth flow
2. `src/pages/accept-invite.tsx` - Migrate to App Router, implement real auth
3. `src/app/api/invitations/create/route.ts` - Add email sending
4. `src/repositories/implementations/supabase/SupabaseInvitationRepository.ts` - Uses browser client, should use server client
5. NEW: `src/app/platform-admin/page.tsx` - Platform admin backoffice

### Email Options
1. **Supabase Edge Functions** with Resend/SendGrid
2. **Supabase Auth Magic Link** (simpler but less control)
3. **Next.js API Route** calling external email service

### Invitation Flow (Fixed)
```
Platform Admin → Create Company → Create Invitation → Send Email
                                                         ↓
User receives email → Clicks link → /join?token=xxx
                                         ↓
                     Not logged in? → Show Supabase Auth (Google/Email)
                                         ↓
                     Logged in → POST /api/invitations/accept
                                         ↓
                     User assigned to company → Redirect to /dashboard
```

---

## Out of Scope
- User self-registration (users can only join via invitation)
- Plan billing/payment integration
- Multiple companies per user

## Dependencies
- Epic 2 Authentication system (needs fixes documented above)
- Supabase Auth configured with Google OAuth
- Email service (Resend/SendGrid) for sending invitations
