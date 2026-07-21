# TRACKER — Floor-Plan 2B (Grid Refinado × Sol)

_Criado 2026-07-21 (Fase 0). Formato: entradas datadas por fase; ver IMPLEMENTATION-PLAN.md §5._

## Estado corrente

- **Fase corrente:** Fase 2 — O card (em andamento, WP2 delegado 2026-07-21)
- **Fase 0:** ✅ APROVADA no UAT do Giuliano em 2026-07-21 ("aprovado!").
- **Fase 1:** ✅ implementada, revisada e commitada pelo Giuliano ("Completada fase 1...").
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

### Decisão de processo (2026-07-21, vale para Fases 2–4)

- **Economia de tokens do orquestrador** (pedido do Giuliano): Fable não roda mais Playwright/smoke/screenshots — o worker Codex executa o smoke dentro do WP e salva os screenshots (ex.: `spec-interview/spaces-visualization-redesign/evidence/` ou scratchpad); Fable revisa artefatos seletivamente ou repassa a verificação visual ao Giuliano. Registrado também no IMPLEMENTATION-PLAN.md §3 e na memória persistente.

### Erros / abordagens falhas (Fase 0)

- Job Codex do WP0 (`task-mruulcxu-9hqe60`) morreu na fase de verificação (Esc do usuário derrubou a árvore de processos do subagent; antes disso já tinha sofrido `spawn EINVAL` — quirk Windows conhecido). O diff já estava aplicado; verificação foi re-executada pelo orquestrador.
- Nota Fase 4: `VO_THEME_METADATA`/ThemeSwitcher ainda anunciam 4 temas com previews da paleta antiga — inconsistência cosmética consciente até o colapso oficial dos temas (D0-1).
