# Story 2.1: Registration UX Feedback

Status: ready-for-dev

## Story

As a new user registering on the platform,
I want clear feedback after signup about what to do next,
So that I understand the email confirmation process and can successfully access the platform.

## Acceptance Criteria

1. **AC1 – Email Confirmation Success Message**
   - After successful signup, show a clear success message with the user's email
   - Display step-by-step instructions: check email, click link, proceed to onboarding
   - Include visual indicators (checkmark icon, email icon)
   - Message should be prominent and not easily dismissed
   - [Source: docs/epics.md#story-2.1-registration-ux-feedback]

2. **AC2 – Resend Confirmation Email Button**
   - Add "Resend confirmation email" button below the success message
   - Button calls `supabase.auth.resend({ type: 'signup', email })`
   - Show loading state while sending
   - Show success toast: "Email reenviado com sucesso!"
   - Implement rate limiting feedback (Supabase has built-in 60s cooldown)
   - [Source: docs/epics.md#story-2.1-registration-ux-feedback]

3. **AC3 – Login Page Unconfirmed Email Detection**
   - On login attempt with unconfirmed email, detect the error
   - Show specific message: "Email não confirmado"
   - Display resend button with the attempted email pre-filled
   - Clear error state when user starts typing again
   - [Source: docs/epics.md#story-2.1-registration-ux-feedback]

4. **AC4 – Post-Confirmation Onboarding Redirect**
   - After email confirmation, user lands on `/onboarding` page
   - If user has no `company_id` → Show options:
     - "Create Company" button → `/create-company`
     - "Join via Invite Code" button → `/join`
   - If user has `company_id` → Redirect to `/dashboard`
   - Handle edge case: user confirmed but page not refreshed
   - [Source: docs/epics.md#story-2.1-registration-ux-feedback]

5. **AC5 – Accessibility (PRD NFR)**
   - All auth success/error messages use `role="alert"` or `aria-live="polite"`
   - Resend button and links têm labels claros para screen readers
   - Focus management após mudanças de estado
   - [Source: docs/prd.md#non-functional-requirements]

6. **AC6 – Português e Preparação para i18n**
   - Todas as strings em PT-BR, seguindo config
   - Estrutura pronta para futura extração de i18n (sem strings hardcoded em inglês)
   - [Source: .bmad/bmm/config.yaml - communication_language: Brazilian Portuguese]

## Tasks / Subtasks

### Task 1: Create Email Confirmation Success Component (AC1, AC5, AC6)
- [ ] 1.1 Create `src/components/auth/EmailConfirmationMessage.tsx`:
  - Props: `{ email: string; onResend: () => Promise<void> }`
  - Success state with checkmark icon
  - Email display with instructions in Portuguese
  - Accessibility attributes
- [ ] 1.2 Add Lucide icons: `CheckCircle`, `Mail`, `RefreshCw`
- [ ] 1.3 Style with theme tokens (glass-morphism optional)

### Task 2: Implement Resend Confirmation API (AC2)
- [ ] 2.1 Add `resendConfirmationEmail` function to `src/lib/auth/supabase-auth.ts`:
  ```typescript
  export async function resendConfirmationEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (error) throw error;
  }
  ```
- [ ] 2.2 Export from auth utilities
- [ ] 2.3 Handle rate limit error (60s cooldown)

### Task 3: Update Signup Page with Success State (AC1, AC2)
- [ ] 3.1 **MODIFY** `src/app/(auth)/signup/page.tsx`:
  - Add `signupSuccess` state: `{ success: boolean; email: string }`
  - After successful `signUp()`, set success state instead of redirecting
  - Render `EmailConfirmationMessage` when success
  - Pass resend handler
- [ ] 3.2 Remove immediate redirect to `/create-company` after signup
- [ ] 3.3 Add "Já confirmou? Fazer login" link in success state

### Task 4: Update Login Page with Unconfirmed Email Detection (AC3)
- [ ] 4.1 **MODIFY** `src/app/(auth)/login/page.tsx`:
  - Detect Supabase error code for unconfirmed email
  - Store attempted email in state
  - Show specific error message in Portuguese
- [ ] 4.2 Add resend button component below error message
- [ ] 4.3 Clear error when user modifies email field

### Task 5: Create Onboarding Page (AC4)
- [ ] 5.1 Create `src/app/onboarding/page.tsx`:
  - Check if user has `company_id` via CompanyContext
  - If has company → redirect to `/dashboard`
  - If no company → show options card
- [ ] 5.2 Options UI:
  - "Criar nova empresa" → `/create-company`
  - "Tenho um código de convite" → `/join`
- [ ] 5.3 Handle auth callback redirect from email confirmation

### Task 6: Update Auth Callback Handler (AC4)
- [ ] 6.1 Verify `src/app/auth/callback/route.ts` exists and handles email confirmation
- [ ] 6.2 Ensure redirect goes to `/onboarding` not `/dashboard`
- [ ] 6.3 Handle error states (invalid token, expired link)

### Task 7: Unit Tests
- [ ] 7.1 Test `EmailConfirmationMessage` renders correctly (AC1, AC2, AC5, AC6)
- [ ] 7.2 Test resend button loading states e cooldown (AC2)
- [ ] 7.3 Test login page unconfirmed email detection + botão de reenvio (AC3)
- [ ] 7.4 Test onboarding page routing logic e branches company/no-company (AC4)
- [ ] 7.5 Test acessibilidade: aria-live/role e foco após mudanças (AC5)
- [ ] 7.6 Test i18n/PT-BR: nenhuma string hardcoded em EN nos componentes adicionados (AC6)

## Dev Notes

### Current State Analysis

**Signup Page (`src/app/(auth)/signup/page.tsx`):**
- Currently redirects immediately to `/create-company` after `signUp()`
- No indication that email confirmation is needed
- User confusion: lands on create-company but may not have confirmed email

**Login Page (`src/app/(auth)/login/page.tsx`):**
- Uses `mapSupabaseAuthError()` for error messages
- Does not specifically handle unconfirmed email case
- Redirects to `/create-company` if no company, `/dashboard` if has company

**Auth Context (`src/contexts/AuthContext.tsx`):**
- `signUp` function exists, calls `supabase.auth.signUp`
- No `resendConfirmationEmail` function yet
- Google OAuth flow syncs user profile separately

**Supabase Trigger:** `handle_new_user()` cria registro em `public.users` com `company_id = NULL` após signup; fluxo de convite/aceitação atualiza `company_id`. Não criar usuários manualmente em rotas de convite. [Source: migrations/database-structure.md]

### Supabase Email Confirmation

Supabase Auth requires email confirmation by default. The relevant error codes:
- `email_not_confirmed`: User exists but hasn't confirmed email
- Rate limit on resend: 60 seconds between attempts

**API for resend:**
```typescript
const { error } = await supabase.auth.resend({
  type: 'signup',
  email: 'user@example.com',
});
```

### Project Structure Notes

- Auth pages in `src/app/(auth)/` route group
- Auth utilities in `src/lib/auth/`
- Contexts in `src/contexts/`
- UI components in `src/components/ui/` (shadcn)
- Middleware `src/middleware.ts` já protege rotas; APIs devem usar `createSupabaseServerClient()` para manter RLS ativa.

### File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `src/components/auth/EmailConfirmationMessage.tsx` | NEW | Success message component |
| `src/lib/auth/supabase-auth.ts` | MODIFY | Add `resendConfirmationEmail()` |
| `src/app/(auth)/signup/page.tsx` | MODIFY | Add success state, remove redirect |
| `src/app/(auth)/login/page.tsx` | MODIFY | Detect unconfirmed email |
| `src/app/onboarding/page.tsx` | NEW | Post-confirmation landing |
| `src/app/auth/callback/route.ts` | VERIFY/MODIFY | Redirect to onboarding |

### Portuguese Strings

```typescript
const messages = {
  successTitle: "Conta criada com sucesso!",
  emailSent: "Enviamos um email de confirmação para",
  steps: {
    step1: "Abra seu email (verifique spam também)",
    step2: "Clique no link de confirmação",
    step3: "Você será redirecionado para continuar o cadastro",
  },
  resendButton: "Não recebeu? Reenviar email",
  resendSuccess: "Email reenviado com sucesso!",
  resendCooldown: "Aguarde 60 segundos para reenviar",
  unconfirmedEmail: "Email não confirmado",
  unconfirmedHint: "Verifique sua caixa de entrada ou clique abaixo para reenviar.",
  alreadyConfirmed: "Já confirmou? Fazer login",
};
```

### References

- [docs/epics.md#story-2.1-registration-ux-feedback](docs/epics.md#story-2.1-registration-ux-feedback)
- [docs/sprint-artifacts/tech-spec-epic-2.md](docs/sprint-artifacts/tech-spec-epic-2.md)
- [docs/architecture.md#security--compliance](docs/architecture.md#security--compliance)
- [docs/prd.md#non-functional-requirements](docs/prd.md#non-functional-requirements)
- [AGENTS.md#supabase--rls](AGENTS.md#supabase--rls)
- [Supabase Auth Resend API](https://supabase.com/docs/reference/javascript/auth-resend)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (Preview)

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-28: Story drafted via SM agent for Epic 2 hotfix (Story 2.1).
