# Phase 3 Evidence — Atomic transition & capacity enforcement (2026-07-11)

Spec: `phase-3-implementation-spec-2026-07-11.md` (D1–D12). Handoff checklist L1543-1563; exit gate L1565-1577.

## Deliverables

| Artifact | Contents |
|---|---|
| `supabase/migrations/20260711120000_phase3_transition_idempotency.sql` | `location_transition_requests` (FORCE RLS, browser zero, service_role DML, pmo SELECT/DELETE + lock-only UPDATE policy `WITH CHECK (false)`), `purge_presence_history` v2 (transition-row retention: 30d, logout rows retained while fence exists, null-result rows never deleted), cron reschedule. Knock schema + `initial_placement_completed_at`: **no-op** (Phase 1 já os criou — D2 revisada). |
| `supabase/migrations/20260711130000_phase3_presence_write_gate.sql` | `private.presence_runtime_control` (singleton, modo inicial `legacy`), `private.presence_legacy_writer_inflight`, `begin/end_legacy_presence_write` (service_role), triggers de gate BEFORE em `users.current_space_id` / `space_presence_log` I-U-D / knock-consume, marker GUC `app.presence_internal_writer` (rejeita role `authenticated` sempre), `enter_presence_maintenance`, `enter_atomic_presence_maintenance`, `repair_presence_logs_for_cutover`, `activate_atomic_presence_writer` (postgres-only via pmo definer boundary). |
| `supabase/migrations/20260711140000_phase3_atomic_transition.sql` | `transition_user_location` (24 passos do handoff; SECURITY INVOKER, service_role-only; D3 mode check via `private.presence_runtime_mode()`), `get_company_presence_snapshot` (1 statement MVCC, bound 5000), `confirm_presence_auth_session_revoked` (estava spec'd no handoff L1174 mas não existia — criada aqui), FKs para `spaces` → RESTRICT (log/sessions/users.current_space_id, verificado em catálogo `confdeltype='r'`), REVOKE DELETE em spaces p/ browser, DROP do no-op `remove_user_from_all_spaces`. |
| `scripts/presence-open-log-repair.sql` | Repair SELECT-first + UPDATE (handoff L774-801) + índice único (L836-839) comentado Phase-10-only. NÃO é migration (D4). |
| `src/lib/presence/legacy-write-gate.ts` + wiring em `users/location`, `users/update`, `users/remove-from-company` | begin/end ledger em todo handler legado inventariado, deadline 60s, 503 `PRESENCE_MAINTENANCE` / 426 `CLIENT_UPGRADE_REQUIRED` fail-closed (D6). Comportamento legacy inalterado em modo `legacy`. |
| `src/app/api/presence/{location,snapshot,logout}/route.ts` + `transition-contract.ts` + `requireVerifiedPresenceLogoutAuth` | Contrato HTTP completo (tabela L1089-1113 1:1), snapshot com verificação de identidade no retorno, logout com exceção de replay atrás da fence (somente linha `logout` armazenada de fingerprint exato), sign-out local-scope, confirm de fence não-fatal. |
| Testes | `transition-idempotency` (5), `write-gate` (9), `atomic-transition` (13), `exit-gate-races` (11 cenários), + suítes Phase 2. API: `presence-location/logout/snapshot-route` + `spaces-get-route` SPACE_IN_USE. |

## Proof (local, `supabase db reset` limpo)

- presence-db: **59/59** (7 files; re-verificado após os fixes do review adversarial). API: **78/78**. — inclui ensaio completo de cutover (legacy → maintenance com drain de lock compartilhado → repair → índice único → atomic → transições) e ensaio de incident maintenance.
- Exit gate L1565-1577: TODOS os bullets cobertos em `exit-gate-races.test.ts` — capacidade-1 concorrente (1 sucesso + 1 SPACE_FULL), 2 moves concorrentes de 1 user (1 placement final + 1 open log), falha injetada de log (REVOKE INSERT) faz rollback do placement e da claim, replay de transition ID (efeitos 1x), fallbacks com IDs distintos, manual supersede auto (LOCATION_SUPERSEDED sem mutação), same-target privado re-autorizado, disconnect durante lock wait ⇒ SESSION_INVALID sem claim, snapshot MVCC consistente sob commits concorrentes, maintenance atômica com transição em voo, **50× register-vs-logout: só os 2 desfechos permitidos, zero sessão ativa pós-fence**.
- API rotas: **76/76**. `rtk tsc`: limpo. eslint (dirs tocados): limpo.
- Unit tests das rotas legadas (gate mockado pass-through): 35/35.
- **Sweep completo unit/API: 725/725 (63 files)**. Dois ajustes de infraestrutura de teste no caminho: (1) `vitest.config.mts` agora exclui `__tests__/presence-db/**` do runner default — essas suítes exigem o stack local e SEMPRE rodaram/rodam sob `vitest.presence-db.config.mts`; antes o sweep as coletava sem env de DB e reportava 24 falhas artificiais (gap pré-existente desde a Phase 2). (2) `__tests__/app/auth/onboarding-page.test.tsx` trava o worker (>120s até isolado) — flaky pré-existente de UI de auth, sem relação com presence; excluído desta execução do sweep e anotado para correção fora da fase.

## Reviews

- **Codex adversarial (effort medium)**: 0 críticos, 5 majors + 1 minor — TODOS corrigidos e re-testados:
  1. Mode check antes do replay de idempotência (violava handoff step 4) → movido para depois da resolução do claim; replay armazenado agora retorna em QUALQUER modo; claim nova em modo ≠ atomic é deletada e retorna `PRESENCE_MAINTENANCE` uncached. Regression test em `atomic-transition.test.ts` (replay em modo legacy).
  2. `/api/presence/location` aceitava `reason: 'logout'` (bypass do fluxo dedicado de fence/sign-out) → `locationRouteReasons` exclui `logout`; regression test na tabela de invalid-body.
  3-5. Rotas legadas (`users/location`, `users/update`, `users/remove-from-company`) serializavam `error.message`/`details` cru → respostas sanitizadas (código estável + correlation id só em log).
  Verificado limpo pelo Codex: RLS/grants das novas tabelas e funções, rejeição de marker spoofing, ledger begin/end em finally.
- **supabase-rls-reviewer**: LIMPO (identidade via supabase_uid ✓, clients server-only ✓, FORCE RLS + revokes ✓, definer search_path ✓, GUC transaction-local ✓, tenant check na deleção de spaces ✓). 2 riscos não-bloqueantes documentados em Residuals: rate-limit ausente nas rotas novas (deferral explícito) e canonizar `getClaims()` no CLAUDE.md. Nota: policy morta `spaces_delete_company_admin` (grant revogado) — drop em follow-up.
- **presence-safety-reviewer**: NO BLOCKERS. Verificado com evidência fresca (re-rodou suítes): comportamento legacy inalterado em modo `legacy` (diffs puramente aditivos nas 3 rotas), gate falha fechado só em maintenance/atomic, `updateLocation` idêntico exceto remoção do RPC no-op (validada contra o catálogo Phase 0), rotas novas inertes (zero callers no cliente — sem risco de dual-writer), `scripts/presence-movement-gate.mjs` passou, marker não spoofável por authenticated. Notas registradas em Residuals. Check manual sugerido pós-deploy staging: mode `legacy` + 1 PUT `/api/users/location` por clique + zero chamadas `/api/presence/*` + avatar sobrevive reload.

## Residuals / follow-ups

- **Rate limiting nas rotas `/api/presence/*`: deferido deliberadamente** (rls-reviewer RISK-1). Racional: endpoints autenticados; lock do user-row serializa transições por usuário; o coordinator da Phase 5 pace os requests; knock rate limits são Phase 4. Adicionar guard de rate-limit genérico na Phase 8 (hardening) se o padrão das rotas de messaging for adotado.
- Canonizar `getClaims()` como caminho de auth de presence no CLAUDE.md (rls-reviewer RISK-2).
- Drop da policy morta `spaces_delete_company_admin` em migration futura (grant DELETE já revogado).
- spaces DELETE bypassa o repository pattern para inspecionar count/23503 (mapeamento SPACE_IN_USE) — follow-up: comentário ou método no repository (presence-safety-reviewer NOTE).
- Re-checar pontualmente o branch de grace-rejoin por `last_active` em `enforceSpaceAuthorization` (fora do diff da Phase 3; coberto pela evidência da Phase 1) antes de marcar a fase `confirmed` (presence-safety-reviewer RISK).
- `begin_legacy_presence_write` roda antes do auth nas rotas legadas — requests não autenticados criam linha de ledger que se auto-abandona em 60s (custo operacional menor, sem violação).

- Staging permanece em modo `legacy`; `/api/presence/location` responde `PRESENCE_MAINTENANCE` até o cutover da Phase 10 (D3). Ghost-capacity window da Phase 2→3 permanece até o cutover (rota legada ainda é a autoridade de movimento).
- Rejoin window = 5 min (D12a) — revisitar na Phase 8 se a UX exigir.
- Cliente (426 reload handler, coordinator) = Phase 5; AuthContext logout wiring = Phase 7; `remove_company_member_and_presence` = Phase 7.
- `migrations/database-structure.md` segue desatualizado (residual da Phase 2) — regenerar antes do próximo `db push`.

**Status: Pending user confirmation.**
