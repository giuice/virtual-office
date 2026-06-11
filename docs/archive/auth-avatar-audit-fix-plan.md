# Auditoria Auth + Avatares — Plano de Correção

## Context

Auditoria completa de autenticação e avatares encontrou: **~10 rotas de API sem nenhuma verificação de auth** (qualquer pessoa pode ler/alterar usuários, espaços e empresas), `getSession()` usado no servidor onde `getUser()` é obrigatório, **vazamento de storage** (avatares antigos nunca deletados do bucket), um `await` faltando que engole falhas no remove de avatar, e inconsistências (seletor click-stop divergente, `getStatusColor` duplicado, repos com browser client default).

Descobertas que moldam o design (verificadas no código):
- `/api/users/update` é usado pelo **admin UI para mudar role de outros usuários** (`CompanyContext.updateUserRole` → `src/lib/api.ts:256`) — fix não pode ser "self-only".
- `CompanyContext.createNewCompany` self-PATCHa `{ companyId, role: 'admin' }` — o servidor (`companies/create`) já seta `companyId` mas não `role`; mover `role: 'admin'` pro servidor e **silenciosamente remover** (não rejeitar) campos não permitidos no self-update.
- `AuthContext.signOut` (linha 143) PATCHa `{ status: 'offline', currentSpaceId: null }` ANTES de `supabase.auth.signOut()` — sessão ainda válida; `status`/`currentSpaceId` ficam na allowlist. Não reordenar.
- `/api/users/create` não tem callers (signup usa `sync-profile`) — **decisão do usuário: deletar a rota**.
- `/api/users/list` — **decisão do usuário: escopo por empresa**.
- Rota de avatar upload: auth já correta (achado de "bypass" do audit era falso); problemas reais são storage leak, cast `as string` mascarando null, HEAD-fetch de teste e console.log spam.

Restrições presence-safety (skill consultada — obrigatórias):
- NÃO tocar `/api/users/location` (auth, error codes, branch offline, grace logic).
- NÃO adicionar novas subscriptions Realtime; o listener `postgres_changes` na tabela `users` já propaga `avatar_url` pro cache `['user-presence']` — NÃO invalidar essa query.
- Preservar o fluxo de signOut (status offline via users/update com sessão válida).

---

## Fase 1 — Auth crítico (um PR, commits atômicos)

### 1.1 `src/lib/auth/session.ts` — `validateUserSession()`
Trocar `auth.getSession()` (linhas 20–31) por `auth.getUser()`; `supabaseUid = data.user.id`. Manter shape `{ supabaseUid, userDbId, error }` — conserta de uma vez os 7 consumidores (messages/upload, messages/attachment/[id], messages/attachments, messages/typing, messages/status, users/avatar/remove, conversations/read).

### 1.2 `src/lib/auth/session.ts` — novo helper `requireAuthUser()`
Reusar o padrão de `getAuthenticatedAppUser()` em `src/app/api/users/location/route.ts:103-137` (sem tocar nessa rota):

```ts
type RequireAuthResult =
  | { supabase: SupabaseClient; dbUser: User; authUser: SupabaseAuthUser }
  | { errorResponse: NextResponse };
export async function requireAuthUser(): Promise<RequireAuthResult>
```

`createSupabaseServerClient()` → `getUser()` → 401 se falhar → `SupabaseUserRepository.findBySupabaseUid(authUser.id)` → 404 se sem perfil. Callers: `if ('errorResponse' in ctx) return ctx.errorResponse;`.

### 1.3 `src/app/api/users/update/route.ts` — rewrite (maior risco)
- `requireAuthUser()`; alvo = `?id=` (manter compat).
- **Self-update** (`id === dbUser.id`): allowlist `{ displayName, statusMessage, status, currentSpaceId, preferences }` + campos que ProfileForm/ThemeContext enviam (verificar payloads dos 6 callers antes de fechar a lista). **Remover silenciosamente** `role`, `companyId`, `avatarUrl`, `supabase_uid`, `email`, `id` (não 403 — mantém `createNewCompany` funcionando).
- **Cross-user** (`id !== dbUser.id`): exigir `dbUser.role === 'admin'` + `target.companyId === dbUser.companyId` (403 senão); allowlist só `{ role }`.
- Preservar shape `{ success, user, message }` e o branch 404.

### 1.4 `src/app/api/companies/create/route.ts`
Linha 63: `update(creatorUser.id, { companyId: newCompany.id, role: 'admin' })` (adiciona role). Ignorar `creatorSupabaseUid` do body — usar o usuário autenticado. **Deve ir no mesmo PR que 1.3.**

### 1.5 Rotas desprotegidas — padrão `requireAuthUser()` + escopo de empresa
Padrão: `const ctx = await requireAuthUser(); if ('errorResponse' in ctx) return ctx.errorResponse;` e depois checagem de escopo:

| Rota | Além do auth |
|---|---|
| `users/list` | `findByCompany(ctx.dbUser.companyId)`; sem empresa → `[ctx.dbUser]` (presence query em `useUserPresence.ts:121` precisa do usuário atual na lista) |
| `users/get` | **Deletar o cache module-level do repo** (linhas 7–16 — prende o client da 1ª request); instanciar por request. Alvo: `id === dbUser.id \|\| companyId === dbUser.companyId` |
| `users/by-company` | `companyId === ctx.dbUser.companyId` senão 403 |
| `users/create` | **DELETAR a rota** (decisão do usuário; zero callers) |
| `users/remove-from-company` | admin + `companyId === ctx.dbUser.companyId` + target na mesma empresa |
| `spaces/route.ts` (GET/POST/PUT/DELETE) | GET/POST: companyId do request === do usuário. PUT/DELETE: carregar space e checar `space.companyId` |
| `spaces/[id]/details` | `space.companyId === ctx.dbUser.companyId` |
| `companies/get` | `id === ctx.dbUser.companyId` senão 403 (join flow usa `invitations/validate`, não esta rota — verificado) |

Não tocar: `invitations/validate` (público intencional), `auth/callback`, `users/location`, `users/get-by-id`, `users/sync-profile` (já corretos).

---

## Fase 2 — Avatares: storage e correção

### 2.1 `src/app/api/users/avatar/route.ts` (upload)
1. Substituir o cast `as string` (linha 23): `const dbUser = await findBySupabaseUid(user.id); if (!dbUser) return 404`.
2. Capturar `oldAvatarUrl` antes do update; após sucesso, se a URL contém `/storage/v1/object/public/user-uploads/`, extrair o path e `storage.from('user-uploads').remove([path])` — **best-effort** (logar falha, nunca falhar a resposta). Criar helper `extractUserUploadsPath(url)` compartilhado (em `src/lib/`).
3. Remover o HEAD-fetch de teste (linhas 159–165) e os `console.log` (24, 121, 125, 156–157).

### 2.2 `src/app/api/users/avatar/remove/route.ts`
1. **Adicionar o `await` faltante** no `userRepository.update(...)` (linha ~35) — hoje `updateOk` é sempre uma Promise truthy.
2. Antes de limpar: `findById(userDbId)`, extrair path do `avatarUrl` (mesmo helper) e deletar do storage com service-role. Best-effort.

### 2.3 Invalidação do cache client-side (mínima)
O `postgres_changes` em `useUserPresence.ts:424-466` já propaga `avatarUrl` — **não invalidar `['user-presence']`**. Única camada stale: `avatarCacheManager` (TTL 5 min) em `src/lib/avatar-utils.ts`:
- `src/components/profile/UploadableAvatar.tsx` `onSuccess` (~linha 83): `avatarCacheManager.invalidateUser(String(user.id))`; idem em `confirmRemoveAvatar`.
- Mesmos one-liners nos handlers de upload de `src/components/profile/EnhancedUserProfile.tsx` e `src/components/shell/enhanced-user-menu.tsx`.

---

## Fase 3 — Consistência / cleanup (commits separados)

1. **Click-stop**: `src/components/floor-plan/modern/ModernSpaceCard.tsx:218` — trocar `closest('[data-avatar-interactive="true"]')` por `closest('[data-avatar-interactive]')` (padrão CLAUDE.md; linha 299 já usa a forma bare). Setters com `="true"` continuam casando — não tocar.
2. **`getStatusColor`**: export canônico `getStatusColorClass(status)` em `src/lib/avatar-utils.ts`; substituir cópias inline em `src/components/dashboard/company-members.tsx:21-31` e `UploadableAvatar.tsx:156-169`. `global-search.tsx:31` usa CSS values (não classes) — não forçar merge.
3. **Repos com browser client**: `SupabaseInvitationRepository` — remover default `= supabase` do construtor (5 sites de instanciação já passam client; verificado). `SupabaseAnnouncementRepository`/`SupabaseMeetingNoteRepository` — injetar client no construtor, remover import de `@/lib/supabase/client` (zero instanciação server existente).
4. **Perf/a11y**: `React.memo` em `src/components/ui/enhanced-avatar-v2.tsx` e `UserInteractionMenu`; `aria-label` no trigger de `src/components/messaging/InteractiveUserAvatar.tsx:97`.

---

## Testes (Vitest 4, seguir estilo de mock de `__tests__/api/users-location-route.test.ts`)

- **Novo** `__tests__/api/users-update-route.test.ts`: 401 sem auth; self-update aplica allowlist e remove `role`/`companyId`; payload do signOut (`status: 'offline', currentSpaceId: null`) passa; cross-user não-admin → 403; admin mesma empresa muda role → 200; admin cross-company → 403.
- **Novo** `__tests__/api/users-list-route.test.ts`: 401; lista escopada por empresa; usuário sem empresa recebe só a si mesmo.
- **Novo** `__tests__/api/users-avatar-route.test.ts`: 404 quando `findBySupabaseUid` falha; arquivo antigo removido após upload; remove aguarda o update e deleta o arquivo.
- Unit test de `validateUserSession` afirmando que chama `getUser` (não `getSession`). `messages-api.test.ts` mocka `validateUserSession` inteiro — não afetado.

## Verificação

1. `npm run type-check` e suite completa (`rtk vitest`).
2. Playbook presence-safety: `npx vitest run __tests__/api/users-location-route.test.ts __tests__/presence-utils.test.ts __tests__/realtime-presence.test.ts`.
3. Manual: login/logout (status vira offline antes da sessão acabar) · criar empresa (criador ganha companyId + role admin do servidor) · admin muda role e remove membro · salvar perfil/tema · upload de avatar → imagem nova sem reload + arquivo antigo sumiu do bucket `user-uploads` · remover avatar · clicar avatar dentro de space card NÃO navega o espaço · 1 só chamada `/api/users/location` por clique de espaço · reload → avatar reaparece no mesmo espaço.

## Riscos

- **Maior**: rewrite de `users/update` — 6 callers com payloads distintos; allowlist strip-don't-reject e item 1.4 devem ir juntos. Verificar payload real de cada caller antes de fechar a allowlist.
- Escopo por empresa em `users/list` muda visibilidade de presença para qualquer setup cross-company hipotético (decisão consciente do usuário).
- Beacon (`sendBeacon`) só usa `/api/users/location` (intocada). Nenhum contexto SSR chama as rotas afetadas.
- Status final: **Pending user confirmation** após implementação (regra do projeto — nunca declarar "done").
