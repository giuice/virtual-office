# Handoff — Floor-Plan Redesign (spaces-visualization-redesign)

_2026-07-18 · Owner: Giuliano (escreve em PT-BR, lê inglês)_

## Estado
- **SPEC completo e aprovado pelo gate**: `spec-interview/spaces-visualization-redesign/SPEC.md` (fonte de verdade — ler primeiro).
- Histórico da entrevista (2 rodadas): `state.md` na mesma pasta. Não reler os round-N.html.

## Próximo passo (único)
Construir os **3 protótipos HTML** (FR-018 do SPEC), **um por vez** para feedback cedo, começando pelo **híbrido** (grid geral + zoom por neighborhood):
1. Híbrido ← começar aqui
2. Grid refinado
3. People-first

Cada protótipo: mesmo dataset simulado (≥16 espaços, ≥40 usuários, ≥3 neighborhoods), knock flow simulado, tema dark (DNA Neon Cyberpunk) + light, densidades comfortable/compact, funcional em 1280×600. Salvar em `spec-interview/spaces-visualization-redesign/prototypes/`.

## Decisões-chave (detalhes no SPEC)
- UI-only: modelo de presença/realtime/knock intocado (BR-001).
- ICs ganham desempates; dashboard admin/CEO é projeto futuro, fora de escopo (BR-002).
- Sem dado falso nos cards — transcript removido até existir fonte real (BR-003).
- 1 layout adaptativo + toggle de densidade; sem modos Orbit/Analyst/Cinema (FR-003).
- Chip "você está aqui" sempre visível + destaque no próprio card (FR-001/002).
- Paradigma e tratamento do "beacon" decididos pelo Giuliano no gate dos protótipos (BR-006, AC-014).
- Preservar: knock, capacidade, neighborhoods + search no NowBoard (lado direito), áudio, iniciais como fallback de avatar.

## Bug conhecido — adiado de propósito
Ao atender knock, label sobrepõe os botões aprovar/reprovar. **Não corrigir isoladamente**: o redesign reconstrói essa UI e o fix é o critério de regressão AC-005.

## Depois dos protótipos
Escolha do Giuliano → implementação React em fases substituindo `src/components/floor-plan/modern/*` (delegação Sol high mínimo, `/presence-safety` em arquivos adjacentes a presença, UAT manual do Giuliano como gate de cada fase — nada é "done" sem isso).
