# Epic Technical Specification: Epic 2 – Authentication & Company Management (Hotfix)

Date: 2025-11-28T00:00:00.000000+00:00
Author: Giuliano
Epic ID: 2
Status: Draft

---

## Overview

Epic 2 reforça autenticação e gestão de empresas com Supabase Auth e fluxos de convite, corrigindo lacunas críticas identificadas no hotfix: ausência de feedback pós-signup, fluxo de convite quebrado e falta de compartilhamento de links. O escopo combina base já entregue (auth SSR, RLS, criação de empresa) com três histórias de reparo para restaurar onboarding seguro e guiado. [Source: docs/epics.md#epic-2-authentication--company-management-🚨-hotfix-required]

O objetivo imediato é garantir onboarding confiável e acessível: sucesso de cadastro comunica próximos passos, login detecta email não confirmado, convites usam tokens reais e limite freemium de 10 usuários é aplicado, mantendo coerência com arquitetura e RLS existente. [Source: docs/prd.md#epic-2-authentication--company-management-✅-complete]

## Objectives and Scope

**Em escopo (hotfix):**
- Feedback pós-signup com instruções e reenvio de confirmação.
- Detecção de email não confirmado no login, com botão de reenvio.
- Redireciono pós-confirmação para onboarding com escolha criar empresa ou ingressar via convite.
- Aceitação de convite com token Supabase válido, atualização de `company_id` e status da invitation.
- Sucesso de convite mostrando link copiável e limite freemium de 10 usuários (inclui pendentes).

**Fora de escopo:** OAuth novas opções, 2FA (Epic 9), métricas avançadas, UX de billing, redesign de dashboard, E2E resiliente (Epic 4B). Esses itens permanecem em epics futuros. [Source: docs/epics.md#epic-2-authentication--company-management-🚨-hotfix-required]

## System Architecture Alignment

- Usa Supabase Auth com SSR via `@supabase/ssr`; client de servidor obrigatório em APIs para manter `auth.uid()` e RLS. [Source: docs/architecture.md#security--compliance]
- Middleware já protege rotas; novas rotas/handlers devem seguir padrão Repository Pattern. [Source: docs/architecture.md#authentication-security]
- Click-stop e acessibilidade: respeitar `data-avatar-interactive` e WCAG AA em telas de auth; manter UX consistente com shadcn/ui + Tailwind 4.1.3. [Source: docs/prd.md#design-constraints]
- Redirecionos devem passar pelo contexto de empresa (CompanyContext) sem quebrar isolamento multi-tenant. [Source: docs/prd.md#epic-2-authentication--company-management-✅-complete]

## Detailed Design

### Services and Modules

- `AuthContext` (`src/contexts/AuthContext.tsx`): expõe `signUp`, `signIn`, sessão e perfil; manter uso de Supabase SSR. [Source: docs/epics.md#epic-2-authentication--company-management-🚨-hotfix-required]
- Signup page (`src/app/(auth)/signup/page.tsx`): captura email/senha, exibe estado de sucesso com instruções e reenvio; não redireciona antes de confirmar email.
- Login page (`src/app/(auth)/login/page.tsx`): trata erro `email_not_confirmed`, mostra mensagem específica e botão de reenvio com email pré-preenchido.
- Onboarding page (`src/app/onboarding/page.tsx`): decide entre criar empresa (`/create-company`) ou ingressar via convite (`/join`) conforme `company_id`.
- Invitation API (`src/app/api/invitations/accept/route.ts`, `create/route.ts`, `list/route.ts`): valida token, atualiza `invitations.status`, retorna link copiável e aplica limite de 10 usuários.
- UI Components: `UploadableAvatar`/EnhancedAvatarV2 (padrão), novos componentes de confirmação (mensagem + botão de reenvio) usando shadcn/ui e ícones Lucide.

### Data Models and Contracts

- `users` (Supabase): `id` (uuid), `supabase_uid` (text), `company_id` (uuid, nullable), `email` (unique), `role` (`user_role`), `preferences`, `status`. Relaciona com `companies.id`. [Source: migrations/database-structure.md]
- `companies`: `id`, `name`, `admin_ids`, `settings`; FK referenciada por `users.company_id` e `invitations.company_id`. [Source: migrations/database-structure.md]
- `invitations`: `id`, `token` (unique text), `email`, `company_id`, `role` (`user_role`), `expires_at`, `status` (`pending|accepted|expired`), `created_at`. [Source: migrations/database-structure.md]
- `space_members`/`spaces`: usados apenas para redirecionar pós-confirmação; nenhuma mutação nova neste epic.
- Contracts:
  - Resend payload: `{ type: 'signup', email }` → Supabase Auth.
  - Accept invitation request: `POST /api/invitations/accept { token }` → atualiza `invitations.status`, `users.company_id`.
  - Invitation list/create: retorna `token`, `status`, `expires_at`, `role`, `company_id` para UI de cópia/limite.

### APIs and Interfaces

- Supabase Auth: `supabase.auth.resend({ type: 'signup', email })` para reenviar confirmação; tratar rate limit (60s). [Source: docs/epics.md#story-2.1-registration-ux-feedback]
- Signup flow: `signUp({ email, password })` → estado de sucesso com email exibido; sem redireciono imediato.
- Login flow: captura erro `email_not_confirmed`; exibe mensagem “Email não confirmado” e botão de reenvio com email usado.
- `/api/invitations/accept` (server client): valida token real, define `invitations.status = accepted`, preenche `users.company_id`, retorna rota de destino.
- `/api/invitations/create` (server client): gera token, persiste invitation, retorna URL completa para cópia.
- `/api/invitations/list` (server client): lista pendentes para compor limite de 10 (usuários + pendentes).
- Onboarding route `/onboarding`: SSR/Client decide destino: se `company_id` presente → `/dashboard`, senão cards para criar/entrar.

### Workflows and Sequencing

1) Signup → Supabase `signUp` → render mensagem de sucesso + passos + botão de reenvio; link “Já confirmou? Fazer login”.  
2) Email confirmado → callback `/auth/callback` → redireciona para `/onboarding`.  
3) Onboarding → se `company_id` presente → `/dashboard`; senão escolher criar empresa ou usar convite.  
4) Login com email não confirmado → detectar erro → mostrar mensagem específica + botão de reenvio (usa email da tentativa) + limpar erro ao editar campo.  
5) Convite: admin cria convite → recebe link copiável + feedback; pendências listadas com status e criado em; limite freemium 10 (usuários + pendentes) bloqueia criação adicional; token válido → `/join?token=...` → se autenticado aplica `company_id`, senão autentica e então aceita.

## Non-Functional Requirements

### Performance

- Resposta de auth/convite < 500 ms para operações de API internas. [Source: docs/prd.md#non-functional-requirements]
- Redirecionos pós-confirmação devem ser instantâneos (sem full reload), mantendo UX suave.
- Evitar chamadas redundantes de resend (respeitar cooldown de 60s) para não pressionar o serviço de email.

### Security

- RLS: APIs usam `createSupabaseServerClient()`; proibir client-side Supabase em rotas. [Source: docs/architecture.md#security--compliance]
- Validar token de convite e status antes de aceitar; impedir reutilização e tokens expirados.
- Mensagens de erro não devem vazar existência de conta; apenas “Email não confirmado” nos casos de confirmação pendente.
- Seguir middleware de segurança existente; considerar rate limiting em login como reforço. [Source: docs/architecture.md#authentication-security]

### Reliability/Availability

- Reenvio: tratar rate limit com UX clara e retries apenas após cooldown.
- Convites: manter consistência de `invitations.status` e `users.company_id` mesmo em falhas parciais (transação ou rollback lógico).
- Onboarding: fallback seguro para `/login` se contexto de empresa não carregar.

### Observability

- Logar eventos de resend (sucesso/erro) e aceitar convite (token, status) para diagnóstico.
- Medir pendências de convite vs limite freemium; alertar quando >80% do limite.
- Telemetria de fluxo: sucesso/falha em signup, login com email não confirmado, redireciono de onboarding.

## Dependencies and Integrations

- Next.js 15.3.0 + React 19.1.0 + TypeScript 5 (fundação do app). [Source: docs/prd.md#current-development-status-brownfield]
- Supabase JS client + `@supabase/ssr` para auth SSR; Realtime não é usado neste fluxo.
- shadcn/ui + Radix + TailwindCSS 4.1.3 para componentes de formulário, alerts, toasts. [Source: docs/prd.md#design-constraints]
- Lucide icons (`CheckCircle`, `Mail`, `RefreshCw`) para feedback visual.
- Middleware/Auth utilities existentes em `src/lib/auth` e `middleware.ts` (RLS, proteção de rotas). [Source: docs/architecture.md#authentication-security]

## Acceptance Criteria (Authoritative)

1. Após signup bem-sucedido, mostrar mensagem de sucesso com email do usuário, passos claros (verificar email, clicar link, continuar onboarding) e ícones visuais; estado não deve desaparecer até ação do usuário. [Source: docs/epics.md#story-2.1-registration-ux-feedback]
2. Botão “Reenviar email de confirmação” disponível no sucesso; chama `supabase.auth.resend({ type: 'signup', email })`, mostra loading, sucesso “Email reenviado com sucesso!”, e respeita cooldown de 60s. [Source: docs/epics.md#story-2.1-registration-ux-feedback]
3. Login com email não confirmado detecta erro Supabase e exibe mensagem “Email não confirmado” em PT-BR com botão de reenvio preenchido com o email usado; erro limpa ao editar campo. [Source: docs/epics.md#story-2.1-registration-ux-feedback]
4. Pós-confirmação redireciona para `/onboarding`; se `company_id` nulo, mostrar opções “Criar Empresa” → `/create-company` e “Tenho um código de convite” → `/join`; se `company_id` presente, enviar para `/dashboard`. [Source: docs/epics.md#story-2.1-registration-ux-feedback]
5. Aceitar convite usa token real (`/join?token=`): valida antes de mostrar UI, autentica se necessário, chama `/api/invitations/accept` com token, atualiza `users.company_id` e `invitations.status`, e redireciona para `/dashboard` com toast. [Source: docs/epics.md#story-2.2-invitation-accept-flow]
6. Fluxo de convite lida com tokens inválidos/expirados mostrando erro claro; se usuário já pertence a empresa, mostrar aviso e não sobrescrever. [Source: docs/epics.md#story-2.2-invitation-accept-flow]
7. Após criar convite, UI mostra estado de sucesso com link copiável (URL completa) e feedback “Link copiado!”; lista convites pendentes com email, status e data. [Source: docs/epics.md#story-2.3-invitation-link-copy--user-limit]
8. Ações em convites pendentes: copiar link, revogar convite, atualizar lista. [Source: docs/epics.md#story-2.3-invitation-link-copy--user-limit]
9. Enforce limite freemium de 10 usuários por empresa: contar usuários ativos + convites pendentes; bloquear novas criações acima do limite e mostrar mensagem de upgrade. [Source: docs/epics.md#story-2.3-invitation-link-copy--user-limit]
10. Acessibilidade e i18n: mensagens com `role="alert"` ou `aria-live="polite"`, labels claros, strings em PT-BR e preparadas para extração futura. [Source: docs/prd.md#non-functional-requirements]

## Traceability Mapping

| AC | Fonte | Componentes/Serviços | Teste sugerido |
|----|-------|----------------------|----------------|
| 1 | Epics 2.1 | `signup/page.tsx`, `EmailConfirmationMessage` | Render mensagem com email e passos; aria-live presente |
| 2 | Epics 2.1 | `supabase-auth.resendConfirmationEmail`, `EmailConfirmationMessage` | Mock Supabase, checar loading, sucesso, cooldown |
| 3 | Epics 2.1 | `login/page.tsx` | Simular erro `email_not_confirmed`, mostrar botão de reenvio, limpar ao digitar |
| 4 | Epics 2.1 | `/auth/callback`, `/onboarding`, `CompanyContext` | Confirmação → onboarding; ramificações com/sem `company_id` |
| 5 | Epics 2.2 | `/join/page.tsx`, `/api/invitations/accept/route.ts` | Token válido aceita convite, atualiza `users.company_id`, redireciona |
| 6 | Epics 2.2 | `/join/page.tsx` | Token inválido/expirado mostra erro; usuário já em empresa vê aviso |
| 7 | Epics 2.3 | `invite-user-dialog.tsx`, `/api/invitations/create/route.ts`, `/list/route.ts` | UI mostra link copiável e lista pendentes |
| 8 | Epics 2.3 | `invite-user-dialog.tsx`, `/api/invitations/list/route.ts` | Copiar/revogar atualiza lista e status |
| 9 | Epics 2.3 | `invite-user-dialog.tsx`, `/api/invitations/create/route.ts` | Criar convite bloqueia ao atingir 10 (usuários + pendentes) |
| 10 | PRD NFR | `EmailConfirmationMessage`, `login/page.tsx`, `/join/page.tsx` | Verificar `role/aria-live`, PT-BR em todos os textos |

## Risks, Assumptions, Open Questions

- **Risk:** Entrega de email depende do provedor; retries excessivos podem atingir rate limit Supabase. Mitigação: cooldown visual e logs de erro de envio. [Source: docs/epics.md#story-2.1-registration-ux-feedback]
- **Risk:** Convite sem RLS (tabela `invitations` sem RLS) requer validação rígida de token e company_id para evitar escalada. Mitigação: sempre validar token + status + company_id na API server-side. [Source: migrations/database-structure.md]
- **Assumption:** `users.supabase_uid` é preenchido via auth callback atual; fluxo de convite depende disso para atualizar `company_id`.
- **Question:** Precisamos bloquear resend ilimitado via UI além do cooldown Supabase? (definir regra de UX).
- **Question:** Redireciono de onboarding deve lembrar URL anterior (e.g., `/join`)? Decidir se mantém memória de origem.

## Test Strategy Summary

- Unit (Vitest/RTL): `EmailConfirmationMessage` (texto, aria-live, loading), login erro `email_not_confirmed`, resend handler chamado com email correto.
- Integration (Vitest + Supabase mock): `/api/invitations/create|list|accept` garantindo atualização de `invitations.status` e `users.company_id`, bloqueio limite 10.
- E2E (Playwright): signup → mensagem de confirmação → resend; login com email não confirmado → mensagem + resend; fluxo `/join?token=valid` aceita convite e redireciona; convite expirado mostra erro.
- Accessibility checks: roles `alert`/`aria-live`, foco após sucesso/erro; strings em PT-BR.
