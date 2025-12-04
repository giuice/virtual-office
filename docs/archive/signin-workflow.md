# Sign-in/Sign-up Workflows

This document describes the three authentication flows in Virtual Office and the files involved.

---

## 1. Standard Email/Password Sign-up

**Flow:**
```
User → /signup → Enter email + password → Supabase creates user
  → Email confirmation sent → User clicks link
  → /auth/callback → /onboarding → /create-company or /dashboard
```

**Key Files:**
- `src/app/(auth)/signup/page.tsx` - Sign-up form
- `src/app/auth/callback/route.ts` - Handles email confirmation redirect
- `src/contexts/AuthContext.tsx` - `signUp()` method

**Notes:**
- User must confirm email before accessing the app
- After confirmation, user is redirected to onboarding to create/join a company

---

## 2. Google OAuth Sign-in

**Flow:**
```
User → /login or /signup → Click "Google" button
  → Redirects to Google OAuth → Returns with code
  → /api/auth/callback → PKCE code exchange
  → /onboarding → /create-company or /dashboard
```

**Key Files:**
- `src/app/(auth)/login/page.tsx` - Login form with Google button
- `src/contexts/AuthContext.tsx` - `signInWithGoogle()` method
- `src/app/auth/callback/route.ts` - PKCE code exchange

**Notes:**
- No email confirmation needed
- User is authenticated immediately after Google consent
- Avatar is synced from Google profile

---

## 3. Invitation Flow (User Invited by Admin)

**Flow:**
```
Admin → InviteUserDialog → /api/invitations/create
  → Supabase inviteUserByEmail() → Email sent to invitee
  → User clicks email link with hash (#access_token=...&type=invite)
  → /join?token=xxx#... → Detects invite type
  → /set-password → User sets password
  → Returns to /join?token=xxx → Auto-accepts invitation
  → /dashboard
```

**Key Files:**
- `src/components/invitation/InviteUserDialog.tsx` - Admin creates invite
- `src/app/api/invitations/create/route.ts` - Creates invitation + Supabase invite
- `src/app/api/invitations/validate/route.ts` - Validates token
- `src/app/api/invitations/accept/route.ts` - Accepts invitation, sets company_id
- `src/app/join/page.tsx` - Processes invite link, handles hash fragment
- `src/app/(auth)/set-password/page.tsx` - Password setup for invited users
- `src/app/auth/callback/route.ts` - Detects invite/recovery type

**Bug Fixed:**
The issue was that `inviteUserByEmail()` creates a user **without a password**. When the user clicked the email link:

1. **Before:** The `/join` page tried to show a signup form, which failed with "Unauthorized" because the user already existed in Supabase Auth.

2. **After:** The `/join` page now:
   - Detects `type=invite` in the URL hash fragment
   - Redirects to `/set-password` before accepting the invitation
   - After password is set, returns to `/join` to complete acceptance
   - User is then redirected to `/dashboard`

---

## Summary Table

| Flow | Email Confirmation | Password Setup | Company |
|------|-------------------|----------------|---------|
| Standard Sign-up | Required | At sign-up | Creates new |
| Google OAuth | Not needed | Not needed | Creates new |
| Invitation | Via invite email | After clicking link | Joins existing |

---

## File Reference

| File | Purpose |
|------|---------|
| `src/app/(auth)/login/page.tsx` | Login form |
| `src/app/(auth)/signup/page.tsx` | Sign-up form |
| `src/app/(auth)/set-password/page.tsx` | Password setup for invited users |
| `src/app/join/page.tsx` | Invitation acceptance flow |
| `src/app/auth/callback/route.ts` | Auth callback handler |
| `src/contexts/AuthContext.tsx` | Auth context with signIn/signUp/signInWithGoogle |
| `src/components/auth/EmbeddedAuthForm.tsx` | Reusable auth form (used in /join) |
| `src/components/invitation/InviteUserDialog.tsx` | Admin invite dialog |
| `src/app/api/invitations/*.ts` | Invitation API routes |
