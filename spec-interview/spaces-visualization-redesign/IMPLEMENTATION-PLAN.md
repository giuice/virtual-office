# Plano de Implementação — Floor-Plan 2B (Grid Refinado × Sol)

_2026-07-21 · Owner: Giuliano · Deriva do SPEC.md (v4) desta pasta. Ler o SPEC primeiro; este plano não o substitui._

## 0. Decisões registradas (gate dos protótipos — fechado)

- **Paradigma escolhido (BR-006/AC-014):** `prototypes/2b-grid-refinado-sol.html` — grid refinado (protótipo 2) com o cabeçalho de neighborhood, acentos de cor e selo de canto do sol-refined-grid. Aprovado pelo Giuliano em 2026-07-21.
- **Sinal de atenção (FR-016/AC-014):** **selo de canto** (candidato A — badge "AO VIVO"/"CHEIA" recortado no canto superior direito do card). O ponto mínimo (candidato B) fica documentado no protótipo como alternativa caso o selo se prove ruidoso em uso real.
- O protótipo 2B é a **referência visual e de interação**. Em conflito entre protótipo e SPEC, o SPEC ganha (ele carrega as regras de negócio).

## 1. Fronteira intocável (BR-001 — leia antes de qualquer fase)

O redesign é **UI-only**. Estes arquivos NÃO são editados em nenhuma fase (re-skin consome, não altera):

- `src/hooks/usePresenceSession.ts`, `usePresenceRealtime.ts`, `useUserPresence.ts`, `useLastSpace.ts`, `useKnock.ts`
- `src/hooks/realtime/*` (inclui `useKnockSignaling.ts`)
- `src/contexts/PresenceContext*`, `AudioContext*`
- `src/components/floor-plan/modern/useModernFloorPlanKnock.ts` — hook de orquestração do knock (522 linhas). A nova UI **consome a mesma interface** (`handleKnock`, `handleBannerApprove/Deny`, `pendingKnockRequests`, `knockStatus`, cooldown). Se parecer necessário mudá-lo, PARE e escale para o Giuliano.
- Testes de presença existentes: não enfraquecer, não reescrever (Seção 15 do SPEC).

Qualquer fase que toque arquivo adjacente a presença/knock exige skill `/presence-safety` + passada do `presence-safety-reviewer`.

**Mudança online no banco: não.** `Neighborhood.color` (CSS var) e `Space.capacity` já existem; nenhuma migração, RLS ou canal novo. Se alguma fase concluir o contrário, é sinal de desvio do plano — parar e reportar.

## 2. Mapa protótipo 2B → código

| Elemento do 2B | Componente atual | Ação |
|---|---|---|
| NowBoard slim (3 infos vivas + filtros + busca à direita) | `modern/NowBoard.tsx` + `NowBoardMetrics` | **Restyle/reduzir** — ≤3 métricas (online / ao vivo / livres); filtros+busca permanecem à direita (FR-008) |
| Fila de beacons no NowBoard | `BeaconQueue.tsx` + `useBeaconAggregator` | **Remover da UI** (legado leader-centric, §2 do SPEC). Hook fica órfão até decisão na Fase 4 |
| Trilho-índice sticky de neighborhoods (âncoras + contagem + "◉ você" + dot colorido) | — | **Novo** componente (ex.: `NeighborhoodIndexRail.tsx`) |
| Cabeçalho de neighborhood (chip 01, eyebrow, contador grande, linha de ocupação) | `NeighborhoodSection.tsx` (já injeta `--neighborhood-color`) | **Restyle** — estrutura nova de header; ocupação = Σusuários/Σcapacity da seção |
| Grid auto-fill + densidade comfortable/compact | `ModernFloorPlanGrid.tsx` + perspectives em `ModernFloorPlan.tsx` | **Substituir perspectives por densidade** (FR-003). Toggle no NowBoard; remover switcher do `FloorPlanToolbar` |
| Card (barra de acento, selo de canto, tintas por estado, activity line, av-stack, capbar, ação única) | `ModernSpaceCard.tsx` + `StatusIndicators`, `FullBadge`, `CapacityIndicator`, `AvatarGroup`, `SpaceActionButtons` | **Restyle** — manter contrato de props do knock intacto |
| Pílula "VOCÊ" + glow no próprio card | estado `highlighted`/`userInSpace` do card | **Restyle** (FR-002) |
| Chip fixo "Você está aqui" (scroll + flash) | — | **Novo** (ex.: `YouAreHereChip.tsx`) — FR-001/AC-001 |
| Banner de knock recebido (topo-centro, z máximo, timer, aprovar/recusar desobstruídos) | `KnockBanner.tsx` (hoje dentro do card) | **Reposicionar globalmente** — é o fix do bug AC-005 |
| Toasts no canto oposto ao banner | `KnockToast.tsx` / sistema de toast | **Restyle** — garantir que nunca sobrepõem o banner (AC-005) |
| Painel de detalhe (roster completo, áudio, eventos reais) | `SpaceDetailPanel.tsx` / `SpaceDetailBottomSheet.tsx` | **Restyle** — eventos só de fonte real (FR-017/BR-003) |
| Popover de pessoa (mensagem / convidar) | `ModernUserAvatar` + entradas de messaging existentes | **Restyle** — click-stop preservado (AC-006) |
| Banner de stale (FR-011) | `realtimeConnectionStatus` já exposto em `floor-plan.tsx` | **Novo** consumidor visual (AC-009) |
| Estado vazio / skeletons | `Skeleton` em `floor-plan.tsx` | **Restyle** (AC-011/012) |
| Transcript/AgendaPhase/ActivityLogPreview/AttentionBeacon nos cards | `TranscriptSnippet`, `AgendaPhaseDisplay`, `ActivityLogPreview`, `AttentionBeacon` | **Remover dos cards** (FR-004/BR-003); limpeza física só na Fase 4 |

### Dados do cabeçalho (sem migração)
- Cor de acento: `neighborhood.color` (CSS var `--vo-neighborhood-N`) — já usado por `NeighborhoodSection`.
- Eyebrow/nota: `neighborhood.description` quando existir; omitir quando vazio.
- Código (ENG/PRD): **derivar** das 3 primeiras letras do nome (uppercase). Sem campo novo.
- Chip numerado 01–04: índice da ordem de exibição, não persiste.
- Busca por **pessoa** (2B acha "carla"): estender o filtro em `floor-plan.tsx` usando `usersInSpaces` (UI-only, ajuda SM-2).

## 3. Fases

Cada fase termina com: `npm run type-check` + `npm run lint` + Vitest focado + smoke Playwright 1280×600 (dark/light) + **UAT manual do Giuliano** (checklist §15 do SPEC). Nenhuma fase é "done" sem o UAT — status fica *Pending user confirmation*. Delegação: Sol high mínimo + revisão adversarial (política do repo).

**Economia de tokens do orquestrador (decisão 2026-07-21, pós-Fase 1):** o orquestrador (Fable) NÃO executa tarefas braçais — smoke Playwright, screenshots e suítes longas são executados pelo **worker** (incluir no prompt do WP: rodar o smoke e salvar screenshots em pasta conhecida) ou verificados pelo próprio Giuliano. O orquestrador só: escreve o WP, revisa o diff/artefatos seletivamente (1 screenshot decisivo, não todos), confirma findings no código com leituras pontuais, e roda no máximo verificações baratas (type-check/vitest) quando o worker não puder.

### Fase 0 — Tokens e fundação visual (risco baixo)
Portar a paleta 2B (dark Neon Cyberpunk + light) para os design tokens (`tokens.css`/`designTokens.ts`): superfícies, linhas, cyan/mag, estados ok/warn/err/busy, glows. Fontes Manrope + DM Sans via `next/font` (não Google Fonts por `@import` — sem dependência de rede em runtime). Nada de comportamento muda; a página atual apenas re-tema.
_Verificação: AC-013 parcial (nenhum elemento ilegível nos dois temas)._

### Fase 1 — Estrutura da página (cabeçalhos, trilho, chip, NowBoard, stale)
`NeighborhoodSection` com o cabeçalho novo (chip numerado, eyebrow, contador grande, occupancy line); `NeighborhoodIndexRail` sticky; `YouAreHereChip`; NowBoard slim (3 métricas, sem BeaconQueue); densidade substitui perspectives (remover switcher do Toolbar); banner de stale via `realtimeConnectionStatus`; busca estendida a pessoas.
_Verificação: AC-001, AC-002, AC-007, AC-009, AC-011 parcial. presence-safety-reviewer (toca composição que recebe dados de presença)._

### Fase 2 — O card
Restyle do `ModernSpaceCard` no visual 2B: barra de acento esquerda, selo de canto (has-signal), tintas live/full/locked, activity line, av-stack com overflow verdadeiro, capbar, ação única (Entrar/Bater/Cheia/Você está aqui). Remover TranscriptSnippet/AgendaPhase/ActivityLog/AttentionBeacon **da renderização** do card. Click-stop de avatar preservado. Contrato de props do knock inalterado.
_Verificação: AC-003, AC-004, AC-006, AC-010; testes de componente para todos os estados do card; presence-safety-reviewer obrigatório._

### Fase 3 — Knock UI + painel de detalhe (a fase sensível)
`KnockBanner` global topo-centro com z-index máximo e timer; toasts no canto oposto; teste automatizado de desobstrução (elementFromPoint sobre aprovar/recusar com toasts ativos — regressão do bug vivo, AC-005). Restyle do `SpaceDetailPanel`/`BottomSheet` (roster 30+, áudio FR-010, eventos reais FR-017). Skeletons/empty states finais.
_Verificação: AC-005 (automatizado + UAT com 2 contas reais), AC-008, AC-010, AC-011, AC-012; presence-safety-reviewer obrigatório._

### Fase 4 — Limpeza e sign-off
Remover código morto: perspectives (`orbit/analyst/cinema`), `BeaconQueue`/`NowBoardMetrics` excedente, `TranscriptSnippet`, `AgendaPhaseDisplay`, `ActivityLogPreview`, `AttentionBeacon` (+ decisão sobre `useBeaconAggregator`/`useAttentionBeacon`: remover ou manter dormentes — recomendação: remover UI e manter hooks até o dashboard admin existir). Side-by-side com a UI antiga; sign-off final; arquivar protótipos.
_Verificação: diff final completo, build de produção, UAT completo._

## 4. Riscos e pontos de atenção

1. **Knock/presença** é o subsistema mais frágil do app (fases 3.5–4 recentes). Mitigação: fronteira §1, fases 2–3 com presence-safety-reviewer, AC-005 automatizado.
2. **Linha de ocupação engana** quando um espaço de capacidade alta domina a seção (Auditório cap 60 faz o Social parecer vazio). Decisão consciente: manter com tooltip "% da capacidade"; se o UAT confirmar leitura errada, trocar por "espaços ocupados/total".
3. **Remoção de beacons** encosta em BR-005 ("não remover features"): o SPEC §2 classifica beacons/metrics/transcript como legado sem dono — a remoção é da UI; hooks só somem na Fase 4 com aprovação explícita.
4. **Tentação de "melhorar" o hook do knock** durante o restyle — proibido pela §1; qualquer necessidade real vira escalada, não edit.
5. Arquivos < ~500 linhas (constraint do SPEC): o restyle do `ModernSpaceCard` (367 hoje) deve extrair subcomponentes se crescer.

## 5. Tracker

Manter nesta pasta (`TRACKER.md`, criar na Fase 0): fase corrente, evidência de verificação, decisões, bloqueios. O relatório final de cada fase segue o formato do CLAUDE.md.
