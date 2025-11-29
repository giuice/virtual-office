# Hotfix Epic 2: Invitation & Registration Flow

**Sprint Change Type:** Hotfix (Critical Blocker)
**Priority:** 🔴 P0 - System Unusable Without This
**Business Model:** Cenário C - Freemium (até 10 usuários grátis)

---

## Problem Statement

O sistema de convites e cadastro está quebrado, impedindo qualquer novo usuário de acessar a plataforma. Sem isso, não há produto para demonstrar a investidores.

### Sintomas Reportados:
1. Página `/join` usa UUID fake em vez de Supabase Auth real
2. Após cadastro, usuário não recebe feedback claro sobre próximos passos
3. Convites não enviam email e não há como copiar link
4. Fluxo de aceitar convite está incompleto

---

## Story 2.X: Fix Registration UX Feedback

**As a** new user registering on the platform,  
**I want** clear feedback after signup about what to do next,  
**So that** I understand the email confirmation process and can successfully access the platform.

### Current Problem
- Usuário faz signup → redirecionado para login → não sabe que precisa confirmar email
- Nenhuma mensagem explica o processo
- Usuário fica perdido

### Acceptance Criteria

- [ ] **2.X.1** After successful signup, show a clear message:
  ```
  ✅ Conta criada com sucesso!
  
  📧 Enviamos um email de confirmação para [email@example.com]
  
  Próximos passos:
  1. Abra seu email (verifique spam também)
  2. Clique no link de confirmação
  3. Você será redirecionado para criar sua empresa ou entrar em uma existente
  
  [Não recebeu? Reenviar email]
  ```

- [ ] **2.X.2** Add "Resend confirmation email" button that calls Supabase resend API

- [ ] **2.X.3** On login page, if user exists but email not confirmed, show:
  ```
  ⚠️ Email não confirmado
  
  Verifique sua caixa de entrada ou clique abaixo para reenviar.
  [Reenviar email de confirmação]
  ```

- [ ] **2.X.4** After email confirmation, user lands on `/onboarding` page:
  - If user has no `company_id` → Show "Create Company" or "Join via Invite Code"
  - If user has `company_id` → Redirect to `/dashboard`

### Technical Implementation

**Files to modify:**
- `src/app/(auth)/signup/page.tsx` - Add success state with email confirmation message
- `src/app/(auth)/login/page.tsx` - Add unconfirmed email detection and resend button
- `src/app/onboarding/page.tsx` - Post-confirmation landing page (may exist, verify)
- `src/lib/auth/supabase-auth.ts` - Add `resendConfirmationEmail()` function

**API calls:**
```typescript
// Resend confirmation
await supabase.auth.resend({
  type: 'signup',
  email: userEmail,
});
```

### Definition of Done
- [ ] Signup shows confirmation message with email
- [ ] Resend button works
- [ ] Login detects unconfirmed email
- [ ] Post-confirmation redirects correctly
- [ ] Manual test: Full signup → email → confirm → onboarding flow works

---

## Story 2.Y: Fix Invitation Acceptance Flow

**As a** user who received an invitation link,  
**I want** to click the link and be guided through registration/login,  
**So that** I can join the company that invited me.

### Current Problem
- `/join` page uses `generateTestUuid()` creating fake user
- Real Supabase Auth is bypassed, so `handle_new_user()` trigger never fires
- User is never properly created in `users` table

### Acceptance Criteria

- [ ] **2.Y.1** Remove `generateTestUuid()` function and all fake UUID logic

- [ ] **2.Y.2** `/join?token=xxx` flow:
  ```
  User visits /join?token=xxx
         ↓
  Validate token (not expired, status=pending)
         ↓
  If NOT logged in → Show Supabase Auth UI (Google + Email/Password)
         ↓
  After auth success → Auto-call /api/invitations/accept with token
         ↓
  Update user's company_id, update invitation status=accepted
         ↓
  Redirect to /dashboard with success toast
  ```

- [ ] **2.Y.3** If token invalid/expired, show clear error:
  ```
  ❌ Convite inválido ou expirado
  
  Este link pode ter expirado ou já foi utilizado.
  Entre em contato com o administrador da empresa para um novo convite.
  
  [Ir para Login]
  ```

- [ ] **2.Y.4** If user already belongs to a company, show:
  ```
  ⚠️ Você já pertence a uma empresa
  
  Atualmente você é membro de [Company Name].
  Para aceitar este convite, você precisa sair da empresa atual primeiro.
  
  [Ir para Dashboard]
  ```

- [ ] **2.Y.5** Leverage `handle_new_user()` trigger:
  - New user signs up → trigger creates `users` record with `company_id = NULL`
  - Accept invitation → API updates `users.company_id` to invited company

### Technical Implementation

**Files to modify:**
- `src/app/join/page.tsx` - Complete rewrite (remove fake UUID)
- `src/app/api/invitations/accept/route.ts` - Ensure uses server client
- `src/app/api/invitations/validate/route.ts` - NEW: Validate token before showing auth

**Key code change in `/join/page.tsx`:**
```typescript
// REMOVE THIS:
const generateTestUuid = () => { ... }

// ADD THIS:
const handleAuthSuccess = async (session: Session) => {
  const response = await fetch('/api/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token, userId: session.user.id }),
  });
  
  if (response.ok) {
    router.push('/dashboard');
  } else {
    setError('Failed to accept invitation');
  }
};
```

### Definition of Done
- [ ] No fake UUID generation anywhere in codebase
- [ ] Token validation endpoint works
- [ ] Auth UI appears for unauthenticated users
- [ ] Invitation acceptance updates `users.company_id`
- [ ] Invitation status changes to `accepted`
- [ ] User redirected to dashboard after success
- [ ] Error states show clear messages

---

## Story 2.Z: Add Invitation Link Copy & Display

**As a** company admin inviting a new member,  
**I want** to see and copy the invitation link,  
**So that** I can manually share it while email sending is not implemented.

### Current Problem
- `invite-user-dialog.tsx` creates invitation but shows no link
- No email sending implemented (comment in code confirms this)
- Admin has no way to share the invitation

### Acceptance Criteria

- [ ] **2.Z.1** After creating invitation, show success state:
  ```
  ✅ Convite criado para [email@example.com]
  
  📋 Link do convite (válido por 7 dias):
  [https://app.virtualoffice.com/join?token=abc123...]  [Copiar]
  
  💡 Envie este link para o convidado por email ou mensagem.
  
  [Criar outro convite] [Fechar]
  ```

- [ ] **2.Z.2** Copy button copies full URL to clipboard with feedback:
  ```
  ✓ Link copiado!
  ```

- [ ] **2.Z.3** Show pending invitations list with:
  - Email
  - Status (pending/accepted/expired)
  - Created date
  - "Copy link" action for pending ones
  - "Revoke" action for pending ones

- [ ] **2.Z.4** Enforce 10-user limit (Freemium model):
  - Count current `users` where `company_id = current_company`
  - Count pending `invitations` where `company_id = current_company` and `status = 'pending'`
  - If total >= 10, show:
    ```
    ⚠️ Limite atingido (10 usuários)
    
    O plano gratuito permite até 10 usuários.
    Para convidar mais pessoas, entre em contato para upgrade.
    
    [Entrar em contato]
    ```

### Technical Implementation

**Files to modify:**
- `src/components/dashboard/invite-user-dialog.tsx` - Add success state with link
- `src/app/api/invitations/create/route.ts` - Return full invitation URL in response
- `src/app/api/invitations/list/route.ts` - NEW: List pending invitations for company
- `src/app/admin/invitations/page.tsx` - Use company from context (remove manual input)

**API response change:**
```typescript
// /api/invitations/create response
{
  success: true,
  invitation: {
    id: "uuid",
    token: "abc123",
    email: "user@example.com",
    expiresAt: "2025-12-05T00:00:00Z",
    inviteUrl: "https://app.virtualoffice.com/join?token=abc123"
  }
}
```

**User limit check:**
```typescript
const checkUserLimit = async (companyId: string) => {
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
    
  const { count: pendingCount } = await supabase
    .from('invitations')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending');
    
  return (userCount || 0) + (pendingCount || 0) < 10;
};
```

### Definition of Done
- [ ] Invitation dialog shows link after creation
- [ ] Copy button works with feedback
- [ ] Pending invitations are visible
- [ ] 10-user limit is enforced
- [ ] Clear messaging for limit reached
- [ ] Manual test: Create invite → Copy link → Share → User accepts

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  Priority 1: Story 2.X (Registration UX)                    │
│  - Fixes the confusing post-signup experience               │
│  - Independent of invitation system                         │
│  - Estimated: 2-3 hours                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Priority 2: Story 2.Y (Invitation Accept Flow)             │
│  - Core fix for invitation system                           │
│  - Removes fake UUID, uses real auth                        │
│  - Estimated: 4-6 hours                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Priority 3: Story 2.Z (Link Copy & Limit)                  │
│  - UX improvement for admins                                │
│  - Implements Freemium 10-user limit                        │
│  - Estimated: 3-4 hours                                     │
└─────────────────────────────────────────────────────────────┘
```

**Total Estimate:** 9-13 hours

---

## Success Metrics

After hotfix completion:
1. ✅ New user can signup and understand email confirmation process
2. ✅ User with invitation link can register and join company
3. ✅ Admin can create invitation and copy link to share
4. ✅ Companies limited to 10 users (Freemium model active)
5. ✅ Zero fake UUIDs in codebase

---

## Related Documents
- [story-platform-admin.md](./story-platform-admin.md) - Platform Admin role (Fase 2)
- [epics.md](../epics.md) - Epic 2 status needs update
- [sprint-status.yaml](./sprint-status.yaml) - Sprint tracking
