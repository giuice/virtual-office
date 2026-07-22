# TRACKER — Floor-Plan 2B (Grid Refinado × Sol)

_Criado 2026-07-21 (Fase 0). Formato: entradas datadas por fase; ver IMPLEMENTATION-PLAN.md §5._

## Estado corrente

- **Fase corrente:** Fase 3 — Knock UI + painel de detalhe (WP3: prompt escrito 2026-07-21, aguardando lançamento pelo Giuliano)
- **Fase 0:** ✅ APROVADA no UAT do Giuliano em 2026-07-21 ("aprovado!").
- **Fase 1:** ✅ implementada, revisada e commitada pelo Giuliano ("Completada fase 1...").
- **Fase 2:** ✅ UAT APROVADA e commitada pelo Giuliano em 2026-07-21.
- **Banco/deploy:** nenhuma mudança online no banco em nenhuma fase (confirmado no plano §1); nada deployado.
- **Bloqueio:** nenhum.

## Fase 0 — Tokens e fundação visual

### Decisões

- **D0-1 (mapeamento de temas):** os 4 valores de `data-theme` (`neon|zen|obsidian|paper`) continuam existindo — a preferência é persistida no Supabase (`preferences.theme`) e o switcher não muda de contrato nesta fase. Escuros (`neon`, `obsidian`) recebem a paleta 2B dark; claros (`zen`, `paper`) recebem a 2B light. Visualmente colapsam em 2 paletas (BR-004); a remoção dos nomes extras fica para a Fase 4 com aprovação do Giuliano.
- **D0-2 (`designTokens.ts`):** sem mudança na Fase 0 — o arquivo contém classes Tailwind consumidas pelos componentes atuais; mexer nele é restyle de componente (Fase 2). O plano cita "tokens.css/designTokens.ts"; o alvo real da paleta é `tokens.css`.
- **D0-3 (fontes):** Manrope + DM Sans via `next/font/google` (self-hosted no build; sem `@import` em runtime), expostas como CSS vars e ligadas ao Tailwind 4 (`--font-sans` → DM Sans; `--font-display` → Manrope).
- **D0-4 (escopo do re-tema):** tokens (`--vo-*` + bridge shadcn) são globais — o app inteiro re-tema, não só o floor plan. Consequência aceita do plano ("a página atual apenas re-tema"); nenhuma tela muda de estrutura.

### Delegação

- Executor: Codex `gpt-5.6-sol` effort high (política do repo; sem downgrade silencioso). Revisão adversarial após o diff.

### Decisões adicionais (pós-review)

- **D0-5 (AA vence o protótipo):** cyan claro do 2B (`#0891b2`) falha AA como texto (3.68:1 no branco). Trocado por `#0e7490` (5.36:1 branco / 4.91:1 bg) em `--vo-cyan` light + rgba derivados + `--vo-neighborhood-1` light. Regra do plano: SPEC (§13, AA) ganha do protótipo.
- **D0-6 (AmbientMesh):** com o colapso em 2 paletas, `obsidian` passa a renderizar o mesh dark (antes retornava `null`); `zen` deixa de renderizar (paleta light tem `--vo-mesh-gradient: none`). Edit mínimo em `src/components/ui/AmbientMesh.tsx` (não presence-adjacent).

### Arquivos alterados

- `src/styles/themes/tokens.css` — paleta 2B (dark = neon+obsidian, light = zen+paper), bridge de tokens legados `--vo-*`, bridge shadcn, neighborhoods harmonizados.
- `src/app/layout.tsx` — Manrope (600/700/800) + DM Sans (400–700) via `next/font/google`, vars `--font-manrope`/`--font-dm-sans` no `<html>`.
- `src/app/globals.css` — `--font-sans`/`--font-display` no `@theme inline`; `font-sans` no body.
- `src/components/ui/AmbientMesh.tsx` — D0-6.

### Evidência de verificação

- `npm run type-check`: passou (2×, incl. pós-fixes).
- `npm run lint`: 0 erros; 523 warnings pré-existentes (testes), nenhum em arquivo tocado.
- `npm run build`: passou (Next 16.2.10); fontes self-hosted em `.next/static/media` (woff2) — sem Google Fonts em runtime.
- Vitest focado: `theme-system`, `now-board`, `neighborhoods`, `space-detail-hover-panel` — 102 testes passando (2×, incl. pós-fixes).
- Auditoria de tokens: nenhum token consumido sumiu; órfãos pré-existentes (`--vo-text-secondary`, `--vo-border`, `--vo-bg-elevated` em platform-admin) já eram indefinidos antes — fora de escopo.
- Revisão adversarial Codex (working tree): needs-attention com 2 findings medium — ambos confirmados e corrigidos (D0-5, D0-6). Contraste re-computado numericamente após o fix.
- Smoke visual dark/light 1280×600: **pendente — é o UAT do Giuliano (AC-013 parcial)**.

## Fase 1 — Estrutura da página

### Delegação

- WP1 delegado ao Codex `gpt-5.6-sol` effort high, **modo detached** (`task-mrux7j29-ij63ar`) — lição do WP0: job destacado sobrevive a interrupção da sessão Claude. Prompt: `wp1-prompt.md` (scratchpad da sessão).
- Escopo: NeighborhoodSection (cabeçalho Sol), NeighborhoodIndexRail (novo), YouAreHereChip (novo), NowBoard slim 3 métricas sem BeaconQueue, densidade substitui perspectives (toolbar perde switcher), stale banner (`degraded`), busca por pessoa, hero de escritório vazio. Contrato de props do knock/card intacto; `useBeaconAggregator` fica órfão (arquivo intocado) até Fase 4.
- skill `presence-safety` lida antes do WP; `presence-safety-reviewer` obrigatório após o diff.

### Evidência de verificação (Fase 1)

- Codex WP1 completou (job detached — sem incidente desta vez). Contratos de props mudados: NowBoard (−beacons/onBeaconClick, +density/onDensityToggle), ModernFloorPlan (−layout/compactCards/perspective, +allSpaces/density/collapse/onShowAll/isShowingAll), Toolbar (−perspective), Grid (−perspective/gridLayout*, +usersInSpaces/collapse), Section (−variant, +index/peopleCount/capacity/isCollapsed/onToggleCollapsed).
- Verificação independente (orquestrador): type-check ✓; lint 0 erros (514 warnings pré-existentes, −9 vs antes); vitest 5 suítes / 46 testes ✓ (now-board, neighborhoods, floor-plan-bootstrap-states, neighborhood-index-rail, you-are-here-chip).
- **presence-safety-reviewer: PASSOU sem blockers.** Fronteira intocada; contrato do ModernSpaceCard byte-idêntico (exceto compact/variant por densidade — permitido); derivações usam `isConnected === true` (não status — invariante 3); zero novos timers/listeners/writers/storage; saveLastSpace/updateLocation intactos. Nota: métrica "online" agora conta só conectados — correção de verdade vs. contagem antiga.
- **Smoke browser real** (Playwright/Edge headless, dev server, conta AUTH_E2E, 1280×600): card+rail+chip+nowboard visíveis; 3 pills de métrica; sem stale banner conectado; screenshots dark (neon) e light (paper) — ambos legíveis, layout 2B correto. 1ª rodada: zero erros de console. 2ª rodada: um 409 intermitente de `/api/spaces/knock/pending` — endpoint NÃO tocado pelo diff (comportamento pré-existente do subsistema knock com logins repetidos da conta de teste; anotar para Fase 3 que mexe no knock UI).
- Detalhe do smoke: screenshot "light" via localStorage falhou porque VOThemeProvider recarrega a preferência do Supabase por cima — forçado `data-theme` no DOM para o teste visual. Comportamento correto do app, só pegadinha de automação.
- Revisão adversarial Codex: **needs-attention — 3 findings, todos confirmados no código pelo orquestrador antes do fix**:
  - **F1 [high]** compact→`variant='analyst'` liga modo legado do card: esconde avatares e renderiza sparkline FABRICADO (`(i*37+id.length*11)%100` — viola BR-003/FR-004). Fix: variant sempre 'orbit', densidade só via state.compact+CSS vars.
  - **F2 [medium]** métrica "free" só conta `status==='available'`; contrato do banco (migrations 20260716143115:600, 20260719140658:611-626) aceita `active`+`available` e trata capacity ≤0/null como sem limite. Fix: predicado compartilhado `isSpaceEnterable` + testes table-driven (o teste novo tinha travado o comportamento ERRADO).
  - **F3 [medium]** rail recebe `allSpaces` mas grid recebe filtrados: em busca/filtro de tipo o rail lista âncoras inexistentes (clique silenciosamente morto); vazios listados; seção "Other" sem entrada. Fix: rail e grid derivam do mesmo modelo de navegação.
  - Fix round delegado ao Codex na thread do WP1 (`task-mruyvnty-5pda72`, resume, Sol high, detached).

### Fix round (pós-adversarial) — concluído

- F1: variant sempre `'orbit'`; densidade só via `state.compact` + CSS vars. F2: `isSpaceEnterable(space, occupants)` exportado de NowBoard.tsx (status active/available; capacity ≤0/null = ilimitado); testes table-driven todos os 6 status + capacity 0/null/limite. F3: novo `neighborhoodSections.ts` — modelo compartilhado de seções/âncoras consumido por grid E rail; entrada "Other" no rail; rail lista só seções renderizadas.
- Re-verificação independente: type-check ✓; 5 suítes / 59 testes ✓ (antes 46 — cobertura cresceu, não encolheu); lint 0 erros.
- Re-smoke browser (1280×600): todos os checks anteriores PASS + compact sem sparkline PASS, avatares no compact PASS (5), rail com "Other" visível, free 7→8 (efeito do F2 correto), zero erros de console (409 do knock/pending filtrado como pré-existente conhecido).
- Incidente operacional: registro do plugin Codex ficou com job zumbi "running" (WP0 morto por Esc) bloqueando resume da thread; cancel automático falha no Git Bash (MSYS converte `/PID` em caminho — rodar cancel via PowerShell); patch manual do state.json/jobs/*.json marcando failed. Lição registrada.

**Fase 1: implementada, revisada (presence-safety ✓, adversarial ✓ pós-fix), verificada. UAT: Giuliano viu e vai fazer o check-in (commit) da Fase 1; próxima sessão começa na Fase 2 (card).**

## Fase 2 — O card

### Decisões

- **D2-1 (fonte do selo "LIVE" — BR-003):** não existe flag real de "reunião ao vivo" (`space.live` do protótipo é simulado; a métrica "ao vivo" do NowBoard conta espaços ocupados). O selo LIVE do card deriva de sinal real de áudio: algum ocupante presente em `speakingUserIds` ou igual a `presentingUserId` (vêm do AudioContext via ModernFloorPlan). Sem áudio ativo, o selo não aparece — truthful. FULL usa a regra real de capacidade (capacity ≤0/null = ilimitado, coerente com `isSpaceEnterable`/F2). Prioridade LIVE > FULL.
- **D2-2 (interação do card):** o botão único do rodapé (Enter/Knock/Full/You're here) é a ação primária visível chamando os handlers existentes; o clique no corpo do card mantém o comportamento atual (mobile → bottom sheet; desktop → enter/knock). O padrão do protótipo "clique abre painel de detalhe" fica para a Fase 3, junto com o restyle do painel lateral. Sujeito a veto no UAT.
- **D2-3 (idioma):** textos do card em inglês ("LIVE", "FULL", "YOU", "Enter"...), consistente com a UI existente e a Fase 1; o pt-BR do protótipo é presentacional.

### Delegação

- WP2 delegado ao Codex `gpt-5.6-sol` effort high. Prompt: `wp2-prompt.md` (scratchpad da sessão). Worker executa também o smoke Playwright e salva screenshots em `evidence/phase-2/` (economia de tokens do orquestrador).
- **Incidente de lançamento (1ª tentativa, resolvido):** o 1º job (thread `019f860a-8cb2`) foi lançado via subagent com flag inexistente `--detached` (foi parar no texto do prompt) e sem `--write` (job read-only). O processo morreu ~2m16s depois, junto com o fim do subagent (mesma classe do incidente WP0); o registro ficou zumbi "running" e depois foi saneado sozinho quando o runtime compartilhado caiu. **Lições:** (1) flags corretos do companion: `task --background --write [--fresh|--resume] --model --effort` — `--detached` NÃO existe; (2) lançar o companion direto do Bash do orquestrador, nunca de dentro de um subagent (a árvore de processos morre com ele); (3) `task --help` não existe — vira um job com prompt "--help".
- **Job efetivo:** `task-mrv1fqjo-zayav0` (2026-07-21 19:19Z), `--background --write --fresh`, `write: true` confirmado no registro, worker com processo próprio. Monitor armado no orquestrador para notificar estado terminal.
- Fronteira BR-001 reforçada no prompt; `SpaceDetailPanel`/`BottomSheet`/`KnockBanner`/NowBoard fora de escopo (Fases 3/4); arquivos legados não são deletados (Fase 4).
- skill `presence-safety` lida antes do WP; `presence-safety-reviewer` + revisão adversarial obrigatórios após o diff.
- Nota: worker tropeçou de novo no quirk do sandbox Windows (PowerShell helper exit -1) e se recuperou via node_repl — mesmo padrão da Fase 3.5.

### Evidência de verificação (Fase 2)

- Worker Codex (job `task-mrv1fqjo-zayav0`, 39m) completou: card 2B implementado (ModernSpaceCard reescrito, SpaceCardFooter novo, AvatarGroup/ModernUserAvatar ajustes pontuais, tokens.css, `__tests__/modern-space-card.test.tsx` novo). Worker reportou: type-check ✓, lint 0 erros (513 warnings baseline), vitest 7 arquivos/124 testes ✓, `git diff --check` ✓. **Smoke Playwright bloqueado no sandbox do worker** (sem HTTPS até o Supabase Auth; reproduzido por 3 caminhos) — screenshots não gerados; validação visual fica com o orquestrador/UAT.
- Limpeza pós-worker: dev server órfão (PID 5992) morto; `evidence/phase-2/.smoke-runtime/` removido (confirmado que `repo/` era diretório real, não junction). Processos `next dev` de 16:11 (anteriores ao job → do usuário) preservados.
- **Bug achado pelo Giuliano no dev server (fix aplicado pelo orquestrador):** fotos dos avatares não apareciam no card — seletor CSS largo demais (`tokens.css` `.vo-avatar-item button[data-avatar-interactive] > div > span`) inflava também o dot de status para 32px, cobrindo a foto. Fix: restringido a `span:first-child` (root do Avatar). Aguardando confirmação visual do Giuliano.
- **presence-safety-reviewer: PASSOU, zero blockers.** BR-001 intocada (git diff); props do knock byte-equivalentes; `handleClick` idêntico ao HEAD (verificado contra `git show HEAD:`); zero novos writers/timers/channels/storage; click-stop verificado com run real de Testing Library (20/20 testes); sparkline fabricado removido; LIVE/FULL derivados só de dado real; `data-space-id` etc. preservados (dependência do YouAreHereChip ok).
  - Risco 1 (não-vivo): `spaceBeaconData` continua na interface mas é dropado — remover prop morta ou documentar (fix round).
  - Risco 2 (inerte hoje): `onClickCapture` no ModernUserAvatar dispara no capture antes do stopPropagation do menu — se `onUserClick` for ligado no futuro, menu + ação de pessoa disparam juntos. `onUserClick` é undefined em todos os call sites atuais.
  - Notas: cast desnecessário `capacity as number | null`; SpaceCardFooter agora renderiza em todo card (intencional, D2-2), condição de knock provadamente idêntica à do corpo do card.
- Revisão adversarial Codex: **needs-attention — 4 findings medium, todos verificados pelo orquestrador antes do fix round**:
  - **F1** SpaceCardFooter não considera `space.status`: sala pública locked/maintenance/reserved ganha "Enter" habilitado que falha no servidor (viola AC-004). Confirmado por leitura (footer não recebe status). Fix: derivar de `isSpaceEnterable`.
  - **F2** `presentingUserId` nunca é passado em produção (ModernFloorPlan só passa speaking/muted; AudioContext não expõe presenter) — teste de presenting dá falsa confiança. Confirmado. Resolução: manter prop/derivação como contrato, relabel do teste; LIVE real hoje = só speakingUserIds. Ligar presenter no AudioContext é proibido (BR-001).
  - **F3** A11y do footer: capacidade 11.5px `--vo-text-faint` ≈3.37:1 dark / 2.94:1 light (< 4.5:1 AA); botão min-height 30px sem override touch (< 44px). Fix com re-cômputo numérico (precedente D0-5).
  - **F4** `knock-banner.test.tsx` QUEBRADA — **confirmado empiricamente** (`vitest run`: 1 suite failed no load): mock de lucide-react sem export `Briefcase` (entrou no grafo do card via SpaceTypeIndicator). Mecanismo diferente do alegado pela revisão (nome acessível), mas regressão real. Nome acessível do knock também deve voltar a "Knock" (🚪 decorativo aria-hidden). Nota de processo: o worker não pegou porque a lista de suítes focadas do WP2 não incluía knock-banner (erro do orquestrador ao escrever o WP) — fix round exige `npm test` completo.
- **Bug avatar (achado do Giuliano):** confirmado como F0 informal — fix do orquestrador já aplicado (seletor `:first-child`), aguardando confirmação visual.
- **Fix round delegado:** Codex resume da thread WP2, job `task-mrv5hy1j-2g5v1e` (`--background --write --resume`, write ✓, pid próprio ✓). Prompt: `wp2-fix-round.md` (scratchpad). Escopo: F1–F4 + R1/R2 (presence-safety) + N1 (cast) + suite completa `npm test`. Watcher armado no arquivo de estado do job.

### Fix round — concluído (2026-07-21)

- F1: footer recebe disponibilidade por status (`active|available` → Enter; `maintenance|locked|reserved|in_use` → "Unavailable" desabilitado, coerente com a regra do servidor); Knock preservado; testes table-driven 6 status × público/privado. F2: prop `presentingUserId` mantida como contrato, teste re-rotulado (LIVE em produção = só speakingUserIds). F3: capacidade → `--vo-text-dim` (6.82:1 dark / 5.35:1 light, recomputado numericamente); alvo touch ≥44px via pointer:coarse. F4: mock lucide completado, 🚪 decorativo `aria-hidden`, nome acessível "Knock". R1: `spaceBeaconData` removida. R2: `onClickCapture` removido — com `onClick` o avatar vira ação de pessoa (menu desativado); sem, só menu. N1: cast removido. Extra: overlap do AvatarGroup restaurado para -10px (teste legado); fix do avatar/status-dot (`span:first-child`) preservado.
- Verificação do worker: type-check ✓; lint 0 erros (512 warnings baseline); suite completa **1.055/1.055 testes executados passam** (antes do fix: 3 arquivos falhavam, 1 teste falhava); presence-safety re-review PASS; Supabase/RLS re-review PASS; `presence:gate` (script) ✓.
- Re-verificação independente do orquestrador: knock-banner + modern-space-card = 49/49 ✓; `npm test` exit 1 vem SÓ de `__tests__/guards/presence-movement-gate.test.mjs` que falha no LOAD (parse de shebang no rolldown) — arquivo e script **intocados pelo diff** (git diff vazio), pré-existente neste ambiente. Follow-up opcional fora do escopo da fase (precisa autorização: é o guard de presença — não enfraquecer).
- Pendências para o UAT do Giuliano: validação visual dark/light × comfortable/compact (screenshots nunca gerados — sandbox do worker sem HTTPS ao Supabase); confirmar fotos dos avatares (fix do status-dot); estados do botão único; selo LIVE com áudio ativo; AC-006 clique em avatar.

**Fase 2: implementada, fix round aplicado, revisada (presence-safety ✓ 2×, adversarial ✓ pós-fix, RLS ✓), verificada por testes. Status: Pending user confirmation (UAT).**

## Fase 3 — Knock UI + painel de detalhe

### Decisões (registradas ao escrever o WP3, 2026-07-21)

- **D3-1 (banner global):** `KnockBanner` sai do `ModernSpaceCard` (era renderizado dentro do card — a causa do bug de obstrução AC-005) e passa a renderizar UMA vez em `ModernFloorPlan` via portal para `document.body`, fixed topo-centro, z-index acima de tudo (toaster sonner, bottom sheet). Consome `pendingKnockRequests`/`handleBannerApprove`/`handleBannerDeny`/`respondingKnockRequestIds` do hook SEM mudança (BR-001). Timer de contagem regressiva presentacional derivado de `payload.timestamp + 30_000` (espelha o auto-expiry de 30s que o hook já faz em `useModernFloorPlanKnock.ts:141-153`). Props mortas do card (`pendingKnockRequest`, `knockResponsePending`, `onKnockApprove/Deny`) são removidas; `knockStatus`/cooldown ficam (footer usa).
- **D3-2 (toasts):** `Toaster` do sonner em `src/app/layout.tsx` muda de `top-right` para `bottom-right` — canto oposto ao banner (plano §2). Mudança app-wide aceita.
- **D3-3 (painel só com dado real):** `SpaceDetailPanel`/`BottomSheet` perdem Agenda/ActivityLog/Transcript da renderização (arquivos ficam até a Fase 4); `useSpaceDetails` deixa de ser consumido (endpoint `/api/spaces/{id}/details` não existe — 404 → sempre vazio). Sem seção de eventos: não existe fonte real hoje (FR-017 "where data exists").
- **D3-4 (áudio no painel, AC-008):** reutilizar `SpaceAudioControls` dentro do painel/sheet quando `userInSpace`; instância do toolbar permanece; AudioContext intocado.
- **D3-5 (clique do card, sujeito a VETO no UAT):** padrão do protótipo diferido pela D2-2 — no desktop, clique no corpo do card passa a ABRIR o painel de detalhe; entrar fica no botão do footer + context menu. Mobile inalterado (bottom sheet). Implementação isolada em `handleClick` para revert de uma linha se o Giuliano vetar.
- **Teste AC-005:** spec Playwright novo em `__tests__/api/playwright/presence/` (projeto "presence", fixture local com admin+member+sala privada) — 2 contextos, banner no responder, `elementFromPoint` no centro de aprovar/recusar com toast ativo, feedback de approve/deny chegando ao solicitante. Sandbox do worker pode bloquear o run (sem HTTPS ao Supabase, lição da Fase 2) — nesse caso o spec fica pronto e o comando documentado para execução do orquestrador/Giuliano.

### Delegação

- WP3: prompt em `wp3-prompt.md` (scratchpad da sessão de 2026-07-21); lançamento pelo próprio Giuliano no Codex (Sol effort high mínimo, `task --background --write --fresh`). Nota pré-existente relevante: 409 intermitente em `/api/spaces/knock/pending` (anotado na Fase 1) — não é do WP3; `presence-movement-gate.test.mjs` com falha de load pré-existente segue intocado.
- Pós-diff obrigatório: `presence-safety-reviewer` + revisão adversarial Codex; full `npm test` (lição F4).

### Evidência de verificação (Fase 3)

- Worker Codex completou WP3: banner global (portal body, topo-centro, z-max, countdown 250ms presentacional, stacking cronológico, fence de visibilidade por `isOccupyingCurrentSpace`), Toaster → bottom-right, painel/sheet só dado real + `SpaceAudioControls` quando `userInSpace` + predicado `isSpaceStatusEnterable` compartilhado, D3-5 (clique abre painel, `panelPinnedRef`), sheet `modal={false}` para o banner ficar operável, skeletons/empty finais. Worker: type-check ✓, lint 0 erros, full `npm test` 1.075 ✓ (só o load-failure pré-existente do movement-gate), 138 testes focados ✓, `git diff --check` ✓, 0 paths BR-001. Screenshots: painel dark/light 1280×600 e sheet dark/light 390×600 em `evidence/phase-3/`; banner/skeleton não capturados truthfully (uma sessão controlável só).
- **AC-005 Playwright NÃO RODOU**: spec novo `knock-banner-obstruction.spec.ts` (2 contextos, toast real via deny cruzado, assert atômico toast-visível + elementFromPoint nos 2 botões, approve E deny) falhou no setup — faltam `AUTH_E2E_MEMBER_EMAIL/PASSWORD` (+ `AUTH_E2E_EXTERNAL_*`) no `.env.local` (só admin existe). Orquestrador confirmou que os seletores usados (`data-testid="space-…"`, `data-user-in-space`, "Knock Instead") existem no código.
- **presence-safety-reviewer (orquestrador): PASSOU sem blockers.** BR-001 limpa (name-only + untracked scan); fence correto (ocupação autoritativa, não availability — invariante 3 ok; só filtra display, bookkeeping do hook intacto; regressão testada); roteamento por closure dos banners empilhados testado; higiene de effects ok; click-stop preservado; 1 Toaster único; testes fortalecidos. 2 riscos: (R1) sheet `modal={false}` sem overlay/focus-trap — tap na faixa visível pode fechar o sheet E disparar o card atrás (não provável em jsdom; precisa viewport real); (R2) AC-005 segue não-verificado. 2 notas: flicker cosmético do banner se ocupação piscar false; D3-5 embutido pendente de veto.
- **Revisão adversarial Codex (2ª rodada; a 1ª foi inválida — helper PowerShell exit -1, Codex não leu o diff): needs-attention, 3 findings medium, todos confirmados pelo orquestrador no código:**
  - **F1** Toasts bottom-right cobrem o `MessagingTrigger` (`fixed bottom-6 right-6 z-40 size-14` sob a pilha sonner z≈10⁹) — regressão da D3-2. Fix: offset do toaster ≥88px acima do trigger + assert elementFromPoint no spec.
  - **F2** Painéis pinados múltiplos: cada card tem `showPanel` próprio e renderiza painel `fixed right-0 z-[80]` — clicar A depois B empilha, fechar B revela painel obsoleto de A. Fix: estado `openDetailSpaceId` içado ao ModernFloorPlan (1 painel por vez).
  - **F3** Countdown zera com botões ativos: expiry do banco = `created+30s` (migration 20260719140658:1569), cleanup do hook = entrega+30s → com atraso de entrega o banner sobrevive à expiração real. Payload não tem `expiresAt` e é BR-001 — mitigação UI-only: desabilitar approve/deny em remainingMs ≤ 0 ("Expired"); sync exato exigiria escalação BR-001.
  - Finding do orquestrador (junto ao F2): **D3-6** — remover hover/focus-reveal do painel desktop (300ms hover abrindo dock de altura inteira = flicker; redundante com D3-5). Sujeito a veto no UAT como o D3-5.
### Fix round — concluído (2026-07-21)

- Job `task-mrv9tczh-7101zl` completou em ~15min. **F1:** Toaster segue bottom-right com `offset={{bottom:88,right:24}}` + `mobileOffset` (livra o `MessagingTrigger`); assert de elementFromPoint no trigger adicionado ao spec do AC-005. **F2+D3-6:** `openDetailSpaceId` içado ao `ModernFloorPlan` (props `detailOpen`/`onDetailOpenChange`); um painel/sheet por vez; hover-reveal, focus-reveal e toda a maquinaria `hoverTimeoutRef`/`hideTimeoutRef`/`panelPinnedRef` removidas sem refs órfãos (confirmado por grep). **F3:** `controlsDisabled = responding || expired`; em `remainingMs ≤ 0` o banner mostra "Expired" e ambos os botões ficam `disabled` + `aria-disabled`. **F4:** backdrop explícito dentro do `DialogPortal` (`fixed inset-0`, z-[49], `pointer-events-auto`, stopPropagation, fecha no clique) + `onPointerDownOutside` prevenido no `DialogContent`; sheet segue `modal={false}` para o banner (z-[2147483647]) continuar operável.
- Verificação do worker: type-check ✓, lint 0 erros (508 warnings baseline), full `npm test` 100 arquivos / 1.080 testes ✓ (só o load-failure pré-existente do `presence-movement-gate`), `git diff --check` ✓, 0 paths BR-001.
- **Re-verificação independente do orquestrador:** type-check ✓; 6 suítes / **171 testes ✓** (knock-banner, knock-auto-join, modern-space-card, space-detail-hover-panel, neighborhoods, floor-plan-bootstrap-states). Testes novos de regressão dois-cards em `neighborhoods.test.tsx` (desktop e mobile: abrir B fecha A, fechar B não ressuscita A) — aditivos, nada enfraquecido.
- **Fixture E2E (mudança do orquestrador, não do worker):** `local-fixture.ts` passou a resolver cada perfil por getter preguiçoso — o spec do knock exige só `AUTH_E2E_EMAIL/PASSWORD` + `AUTH_E2E_MEMBER_*`; o `external` (usuário de outra empresa, usado só pelo `operability-smoke` para isolamento multi-tenant) só é exigido quando um spec realmente o acessa. Desbloqueia o AC-005 sem criar conta de terceira empresa.
- Ruído a decidir antes do commit: `playwright-report/index.html` (artefato gerado, rastreado) ficou sujo com 4 linhas de churn de bundle/line-ending vindas das tentativas de Playwright. Não faz parte da mudança.

### Re-review presence-safety pós-fix (2026-07-21)

- **BR-001 limpa** (name-only tracked + untracked): nenhum arquivo protegido no diff. **Sem blockers.**
- **Correção de fato sobre o F3:** `payload.timestamp` É o `createdAt` do servidor (`useKnockSignaling.ts:155`), e o expiry real do banco é `expires_at = v_op + interval '30 seconds'` (`20260716175515_phase4_knock_delivery_and_retention.sql:263`) — a migration citada antes na Fase 3 estava errada. Logo o countdown **espelha fielmente** o TTL autoritativo; não há divergência client/servidor no caso comum.
- **RISCO R3 (F3, decisão do Giuliano):** o disable client-side remove o caminho de retry. Antes, aprovar um knock já expirado falhava no servidor com `KNOCK_EXPIRED`/410 e toast visível (`useModernFloorPlanKnock.ts:201-205`). Agora, com skew de relógio ou entrega perto do limite (poll de 5s, realtime degradado), a UI pode travar um approve que o servidor **ainda aceitaria**, sem nenhum feedback. Troca uma falha rara e visível por um "não consigo responder" silencioso e irreversível. Invariante 1 do skill (o banco é a autoridade) sugere deixar os botões ativos até o 410 do servidor. Bounded aos 30s de borda — não bloqueia, mas precisa de decisão explícita.
- **NOTA (F3):** banner expirado pode ficar visível até ~30s além da expiração real (cleanup do hook conta a partir da entrega, o display a partir da criação). Cosmético; o timeout sempre dispara e é limpo no unmount (`useModernFloorPlanKnock.ts:141-153,469-474`) — sem vazamento.
- **RISCO R4 (F4, residual conhecido):** o backdrop bloqueia só ponteiro; com `modal={false}` o foco de teclado não é trapped — Tab sai do sheet para um card atrás do scrim e Enter dispara `handleClick`. Precisa aceite explícito ou fix (inert nos cards de fundo).
- **Passou:** F2 fonte única (`openDetailSpaceId`, zero refs órfãos, testes de dois cards cobrem exatamente a regressão); teclado do card preservado (Enter/Space/Escape); `KnockBannerHost` montado 1× e roteamento do hook intacto; fence de visibilidade com regressão testada ("hides a pending banner immediately when the responder leaves its space"); z-index banner (2147483647) vs backdrop (49) disjuntos, banner clicável por cima; backdrop faz stopPropagation antes de fechar; F1 aritmética conferida (trigger ocupa 24–80px, offset 88px = folga de 8px); `local-fixture.ts` não enfraquece garantia nenhuma (mesmo erro acionável, só na leitura do perfil); nenhuma asserção enfraquecida, 171/171 ✓, `tsc` ✓.
- **Não verificável no ambiente do reviewer:** o próprio spec do AC-005 (sem Chromium instalado; web-server subiu e desceu limpo). R3 e R4 também só se provam em browser real.

- **Fix round delegado** (orquestrador, direto do shell): job `task-mrv9tczh-7101zl` (`--background --write --fresh`, Sol high, write ✓ pid ✓), prompt `wp3-fix-round.md` (scratchpad). Escopo: F1–F3 + F4 (backdrop explícito no sheet não-modal: engole tap, fecha sem agir; foco de teclado segue não-trapped = residual para UAT) + D3-6. Watcher Monitor armado com detecção de pid zumbi.

### WP3 close-out — concluído (2026-07-22)

- **R3 corrigido:** expiry segue visual (`Expired` + barra em zero), mas apenas `responding` desabilita Approve/Deny. O servidor volta a ser a autoridade final e o 410/`KNOCK_EXPIRED` existente fornece feedback. Teste fake-timer convertido sem perda de cobertura.
- **Correção factual:** o handoff citava `20260716175515_phase4_knock_delivery_and_retention.sql:263`, mas essa migration não contém a linha. A definição autoritativa mais recente está em `20260719140658_presence_concurrency_contract.sql` (`expires_at = v_op + interval '30 seconds'`, `created_at = v_op`). A conclusão de que `payload.timestamp` espelha o TTL continua correta.
- **R4 corrigido:** estado levantado agora guarda `{ spaceId, surface }`; apenas `surface === 'sheet'` deixa o container já existente do floor plan `inert`. Painel desktop permanece navegável e o `KnockBannerHost` fica fora da subárvore. Contrato unitário cobre atributo; Chromium real 390×844 cobriu 20 Tabs, close, Escape e backdrop.
- **AC-005 verificado de verdade:** o primeiro run expôs defeito do fixture (fallback para sala privada vazia, barrado corretamente pelo precheck). Spec corrigido para duas salas públicas direct-entry sem enfraquecer toast real nem os asserts `elementFromPoint`. Resultado isolado: **1 passed (1.3m)**; cenário 55.3s. Prova R4 isolada: **1 passed (47.5s)**; cenário 22.7s. Screenshot: `evidence/phase-3/r4-mobile-sheet-focus-390x844.png`.
- **Verificação final:** type-check ✓; lint 0 erros / 508 warnings; full `npm test` = 100 arquivos e 1.081 testes passando, apenas o load-failure conhecido do `presence-movement-gate.test.mjs`; `git diff --check` ✓; zero paths BR-001. `presence-safety-reviewer` pós-edit: zero blockers, riscos ou notas. Zero mudanças de banco/deploy; `playwright-report/index.html` preservado como estava.
- Relatório: `evidence/phase-3/wp3-closeout-report.md`. **Status: Pending user confirmation** (UAT D3-5/D3-6).

### Decisão de processo (2026-07-21, vale para Fases 2–4)

- **Economia de tokens do orquestrador** (pedido do Giuliano): Fable não roda mais Playwright/smoke/screenshots — o worker Codex executa o smoke dentro do WP e salva os screenshots (ex.: `spec-interview/spaces-visualization-redesign/evidence/` ou scratchpad); Fable revisa artefatos seletivamente ou repassa a verificação visual ao Giuliano. Registrado também no IMPLEMENTATION-PLAN.md §3 e na memória persistente.

### Erros / abordagens falhas (Fase 0)

- Job Codex do WP0 (`task-mruulcxu-9hqe60`) morreu na fase de verificação (Esc do usuário derrubou a árvore de processos do subagent; antes disso já tinha sofrido `spawn EINVAL` — quirk Windows conhecido). O diff já estava aplicado; verificação foi re-executada pelo orquestrador.
- Nota Fase 4: `VO_THEME_METADATA`/ThemeSwitcher ainda anunciam 4 temas com previews da paleta antiga — inconsistência cosmética consciente até o colapso oficial dos temas (D0-1).
