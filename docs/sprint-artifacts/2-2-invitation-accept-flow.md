# Story 2.2: Invitation Accept Flow

Status: done

## Story

As a user who received an invitation link,
I want to click the link and be guided through registration/login,
So that I can join the company that invited me.

## Acceptance Criteria

1. **AC1 – Remove Fake UUID Generation**
   - Remove `generateTestUuid()` function from `/join` page
   - Remove all fake UUID logic
   - User must authenticate via Supabase Auth before accepting
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

2. **AC2 – Token Validation Before Auth**
   - On page load, validate token via API before showing auth UI
   - Check: token exists, status is 'pending', not expired
   - If invalid → show error immediately, don't show auth
   - Create `/api/invitations/validate` endpoint
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

3. **AC3 – Supabase Auth UI for Unauthenticated Users**
   - If token valid AND user not logged in → show auth options
   - Google OAuth button
   - Email/password form (signup or login)
   - Auth UI styled consistently with signup/login pages
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

4. **AC4 – Auto-Accept After Authentication**
   - After successful auth, automatically call `/api/invitations/accept`
   - Pass real `supabaseUid` from session (not fake UUID)
   - Update user's `company_id` to invited company
   - Update invitation `status` to 'accepted'
   - Redirect to `/dashboard` with success toast
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

5. **AC5 – Invalid/Expired Token Error State**
   - Show clear error message in Portuguese:
     - "Convite inválido ou expirado"
     - "Este link pode ter expirado ou já foi utilizado."
     - "Entre em contato com o administrador da empresa para um novo convite."
   - Provide "Ir para Login" button
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

6. **AC6 – User Already Has Company Error**
   - If authenticated user already has `company_id`:
     - Show warning: "Você já pertence a uma empresa"
     - Display current company name
     - Message: "Para aceitar este convite, você precisa sair da empresa atual primeiro."
     - Provide "Ir para Dashboard" button
   - [Source: docs/epics.md#story-2.2-invitation-accept-flow]

7. **AC7 – Leverage handle_new_user() Trigger**
   - New signup via `/join` page uses Supabase Auth
   - Trigger `handle_new_user()` fires automatically
   - Creates `users` record with `company_id = NULL`
   - Accept invitation API updates `company_id` to invited company
   - No manual user creation in `/join` flow
   - [Source: migrations/database-structure.md - trigger handle_new_user]

8. **AC8 – Loading States**
   - Show loading during token validation
   - Show loading during auth process
   - Show loading during invitation acceptance
   - All loading states have clear visual feedback
   - [Source: docs/architecture.md#ux-patterns]

## Tasks / Subtasks

### Task 1: Create Token Validation API (AC2)
- [x] 1.1 Create `src/app/api/invitations/validate/route.ts`:
  ```typescript
  export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token');
    // Validate token exists, is pending, not expired
    // Return: { valid: boolean, email?: string, companyName?: string, error?: string }
  }
  ```
- [x] 1.2 Use `createSupabaseServerClient()` for database access
- [x] 1.3 Return company name for display in UI
- [x] 1.4 Handle all error cases with specific messages

### Task 2: Rewrite /join Page (AC1, AC3, AC4, AC5, AC6, AC8)
- [x] 2.1 **REWRITE** `src/app/join/page.tsx`:
  - Remove `generateTestUuid()` function entirely
  - Add token validation on mount
  - Add authenticated user check
- [x] 2.2 Create page states enum:
  ```typescript
  type PageState = 
    | 'loading'           // Initial load, validating token
    | 'invalid-token'     // Token expired/used/not found
    | 'show-auth'         // Valid token, show auth UI
    | 'already-company'   // User already has company_id
    | 'accepting'         // Calling accept API
    | 'success'           // Accepted, redirecting
    | 'error';            // Accept failed
  ```
- [x] 2.3 Implement each state UI:
  - `loading`: Spinner with "Validando convite..."
  - `invalid-token`: Error card with AC5 message
  - `show-auth`: Embedded auth form (reuse from login/signup)
  - `already-company`: Warning card with AC6 message
  - `accepting`: Spinner with "Entrando na empresa..."
  - `success`: Redirect to dashboard
  - `error`: Error message with retry option

### Task 3: Create Embedded Auth Component (AC3)
- [x] 3.1 Create `src/components/auth/EmbeddedAuthForm.tsx`:
  - Props: `{ onSuccess: (session: Session) => void; inviteEmail?: string }`
  - Tab/toggle between Login and Signup
  - Pre-fill email from invitation if provided
  - Google OAuth button
  - Email/password form
- [x] 3.2 Reuse styling from login/signup pages
- [x] 3.3 Handle auth errors with user-friendly messages

### Task 4: Accept Invitation API (AC4, AC6, AC7)
- [x] 4.1 **MODIFY/CREATE** `src/app/api/invitations/accept/route.ts`:
  - Validate token status = pending and not expired
  - Ensure authenticated user from Supabase session
  - Update `invitations.status` → accepted; set `users.company_id` to invited company
  - Return success + destination route
- [x] 4.2 Use `createSupabaseServerClient()` (server) to preserve RLS context
- [x] 4.3 Handle error cases: invalid/expired token, user already in company (AC6), missing auth

### Task 5: Wire Join Flow (AC4, AC5, AC6, AC8)
- [x] 5.1 On auth success, auto-call accept API and handle redirects
- [x] 5.2 Toasts/messages in PT-BR; loading states during validation/auth/accept
- [x] 5.3 Clear errors on retry; ensure aria-live for messages (align with PRD NFR)

### Task 6: Tests
- [x] 6.1 Validate token API: pending/expired/accepted paths
- [x] 6.2 Accept API: success path updates status + company_id; rejects invalid/expired/already-company
- [x] 6.3 Join page state transitions (loading, invalid, show-auth, already-company, success, error)
- [x] 6.4 Embedded auth form renders and calls onSuccess with session
- [x] 6.5 A11y/UX: aria-live on errors/success, PT-BR strings, loading indicators

## Dev Notes

- **Existing issue:** `/join` uses fake UUID; must be removed. Auth must rely on Supabase session for `supabase_uid`. [Source: docs/epics.md#story-2.2-invitation-accept-flow]
- **Trigger:** `handle_new_user()` cria usuário com `company_id = NULL`; aceitar convite apenas atualiza `company_id`. Não criar usuários manualmente. [Source: migrations/database-structure.md]
- **RLS:** APIs devem usar `createSupabaseServerClient()` para manter contexto `auth.uid()`; proibido client-side Supabase em rotas. [Source: AGENTS.md#supabase--rls]
- **UX:** Estados de carregamento e erros em PT-BR com aria-live; mensagens claras para tokens inválidos e usuário já em empresa.

### Portuguese Strings

```typescript
const messages = {
  validating: "Validando convite...",
  accepting: "Entrando na empresa...",
  invalidToken: {
    title: "Convite inválido ou expirado",
    description: "Este link pode ter expirado ou já foi utilizado.",
    action: "Entre em contato com o administrador da empresa para um novo convite.",
    button: "Ir para Login"
  },
  alreadyCompany: {
    title: "Você já pertence a uma empresa",
    description: "Atualmente você é membro de {companyName}.",
    action: "Para aceitar este convite, você precisa sair da empresa atual primeiro.",
    button: "Ir para Dashboard"
  },
  success: "Bem-vindo à empresa!",
  error: "Erro ao aceitar convite. Tente novamente.",
};
```

### References

- [docs/epics.md#story-2.2-invitation-accept-flow](docs/epics.md#story-2.2-invitation-accept-flow)
- [docs/sprint-artifacts/tech-spec-epic-2.md](docs/sprint-artifacts/tech-spec-epic-2.md)
- [docs/prd.md](docs/prd.md)
- [docs/architecture.md#authentication-architecture](docs/architecture.md#authentication-architecture)
- [AGENTS.md#supabase--rls](AGENTS.md#supabase--rls)
- [migrations/database-structure.md](migrations/database-structure.md) - trigger handle_new_user

### Dependencies

- **Story 2.1** (Registration UX): Should be completed first for consistent auth UX
- **Supabase Auth**: Configured with email confirmation
- **Database trigger**: `handle_new_user()` must be active

## Dev Agent Record

### Context Reference

docs/sprint-artifacts/2-2.context.xml

### Agent Model Used

Claude Opus 4.5 (Preview)

### Debug Log References

- Console logs added for debugging user lookup and trigger wait

### Completion Notes List

- Implemented complete invitation accept flow with Supabase Auth integration
- Removed fake UUID generation (generateTestUuid) from /join page
- Created /api/invitations/validate endpoint for token pre-validation
- Created EmbeddedAuthForm component with login/signup tabs
- Modified /api/invitations/accept to use session auth
- Added support for handle_new_user trigger with retry mechanism
- All UI messages in Portuguese (PT-BR)
- Added aria-live attributes for accessibility
- All 38 tests passing (8 validate API, 9 accept API, 11 auth form, 10 join page)

### File List

**New Files:**
- src/app/api/invitations/validate/route.ts (Token validation API)
- src/components/auth/EmbeddedAuthForm.tsx (Embedded auth form component)
- __tests__/api/invitations-validate.test.ts (8 tests)
- __tests__/api/invitations-accept.test.ts (11 tests - includes email validation)
- __tests__/components/auth/EmbeddedAuthForm.test.tsx (11 tests)
- __tests__/app/join-page.test.tsx (10 tests)

**Modified Files:**
- src/app/join/page.tsx (Complete rewrite)
- src/app/api/invitations/accept/route.ts (Use session auth + email validation)
- src/app/api/users/get-by-id/route.ts (Returns company name for AC6)

## Change Log

- 2025-11-28: Story drafted via SM agent for Epic 2 hotfix (Story 2.2).
- 2025-12-01: Senior Developer Review notes appended (AI).
- 2025-12-01: Review fixes implemented - email validation security + company name display.

## Senior Developer Review (AI)

**Reviewer:** Giuliano  
**Date:** 2025-12-01  
**Outcome:** ~~Changes Requested~~ **RESOLVED** — All action items addressed

### Summary
- ~~Invitation flow largely implemented~~ **UPDATE:** All issues fixed. Email validation enforced. Company name now displayed.

### Key Findings
- ~~High: Accept endpoint allows any authenticated user~~ **FIXED:** Email match validation added at line 52-57
- ~~Medium: Already-company block shows "uma empresa"~~ **FIXED:** `/api/users/get-by-id` now returns `companyName`

### Acceptance Criteria Coverage
| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Remove fake UUID; require Supabase Auth before accept | Implemented | src/app/api/invitations/accept/route.ts:9-47; src/app/join/page.tsx:21-177 |
| AC2 | Validate token before showing auth UI | Implemented | src/app/api/invitations/validate/route.ts:14-118; src/app/join/page.tsx:74-205 |
| AC3 | Supabase Auth UI (Google + email/password) for unauthenticated users | Implemented | src/app/join/page.tsx:396-414; src/components/auth/EmbeddedAuthForm.tsx:31-343 |
| AC4 | Auto-accept after auth with real supabaseUid; update company_id/status; redirect | Implemented | src/app/api/invitations/accept/route.ts:9-123; src/app/join/page.tsx:134-232 |
| AC5 | Invalid/expired token error state in PT-BR + login CTA | Implemented | src/app/join/page.tsx:35-52,250-271; src/app/api/invitations/validate/route.ts:49-118 |
| AC6 | Warn if user already has company (show company name) | ✅ **Implemented** | src/app/api/users/get-by-id/route.ts (returns companyName) |
| AC7 | Leverage handle_new_user trigger on signup | Implemented | src/app/api/invitations/accept/route.ts:82-109 |
| AC8 | Loading states with clear feedback | Implemented | src/app/join/page.tsx:21-29,234-358 |

**AC Coverage:** **8 of 8** acceptance criteria fully implemented.

### Task Validation
| Task | Marked As | Verified As | Evidence |
| --- | --- | --- | --- |
| 1.1 Create token validation API | [x] | Verified | src/app/api/invitations/validate/route.ts:1-134 |
| 1.2 Use createSupabaseServerClient | [x] | Verified | src/app/api/invitations/validate/route.ts:27 |
| 1.3 Return company name | [x] | Verified | src/app/api/invitations/validate/route.ts:29-133 |
| 1.4 Handle error cases | [x] | Verified | src/app/api/invitations/validate/route.ts:49-118 |
| 2.1 Rewrite /join page (remove fake UUID) | [x] | Verified | src/app/join/page.tsx:21-205 |
| 2.2 Page state enum | [x] | Verified | src/app/join/page.tsx:21-29 |
| 2.3 Implement each state UI | [x] | Verified | src/app/join/page.tsx:234-414 |
| 3.1 Create EmbeddedAuthForm component | [x] | Verified | src/components/auth/EmbeddedAuthForm.tsx:31-343 |
| 3.2 Reuse login/signup styling | [x] | Verified | src/components/auth/EmbeddedAuthForm.tsx:175-343 |
| 3.3 Handle auth errors clearly | [x] | Verified | src/components/auth/EmbeddedAuthForm.tsx:53-122,254-324 |
| 4.1 Modify/create accept API | [x] | Verified | src/app/api/invitations/accept/route.ts:6-123 |
| 4.2 Use server Supabase client | [x] | Verified | src/app/api/invitations/accept/route.ts:7 |
| 4.3 Handle error cases (invalid/expired/already-company) | [x] | Verified | src/app/api/invitations/accept/route.ts:32-66,105-109 |
| 5.1 Wire join flow to auto-accept post-auth | [x] | Verified | src/app/join/page.tsx:134-232 |
| 5.2 PT-BR toasts/messages + loading states | [x] | Verified | src/app/join/page.tsx:35-52,141-176,234-358 |
| 5.3 Clear errors/aria-live | [x] | Verified | src/app/join/page.tsx:250-393 |
| 6.1 Validate token API tests | [x] | Verified | __tests__/api/invitations-validate.test.ts:48-244 |
| 6.2 Accept API tests | [x] | Verified | __tests__/api/invitations-accept.test.ts:88-312 |
| 6.3 Join page state tests | [x] | Verified | __tests__/app/join-page.test.tsx:102-331 |
| 6.4 Embedded auth form tests | [x] | Verified | __tests__/components/auth/EmbeddedAuthForm.test.tsx:47-208 |
| 6.5 A11y/UX tests (PT-BR, aria-live) | [x] | Verified | __tests__/app/join-page.test.tsx:110-188,303-330; __tests__/components/auth/EmbeddedAuthForm.test.tsx:190-208 |

### Test Coverage and Gaps
- Unit tests cover validation API, accept API, join page states, and embedded auth flows via mocks
- **40 tests total:** 8 validate + 11 accept + 11 auth form + 10 join page
- ✅ Email mismatch security test added (returns 403)
- ✅ Case-insensitive email match test added

### Architectural Alignment
- API routes correctly use the server Supabase client (RLS alignment) and repository pattern. Frontend uses state machine for join flow.

### Security Notes
- ✅ **FIXED:** Email validation enforced - returns 403 if invitation email doesn't match authenticated user's email (case-insensitive)

### Action Items
- [x] [High] Enforce invitation email matches the authenticated user before accepting
- [x] [Medium] Return and surface the real company name when blocking users
