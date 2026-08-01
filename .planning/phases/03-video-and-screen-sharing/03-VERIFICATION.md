---
phase: 03-video-and-screen-sharing
verified: 2026-08-01T14:06:27Z
status: human_needed
score: 7/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "PRESENTER_PROFILE_INVALID remoto remove somente o display e preserva o áudio e a sinalização do viewer."
    - "Uma observação autoritativa posterior null ou incompatível encerra a captura local; uma leitura anterior ao claim não a encerra."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Dois navegadores autenticados recebem áudio P2P e a tela do apresentador; uma falha de Realtime converge para o estado autoritativo sem derrubar o áudio."
    test: "Em duas identidades reais na mesma sala, iniciar e encerrar compartilhamento. Bloquear ou perder uma invalidação de Realtime e aguardar a reconciliação."
    expected: "Cada cliente mantém o áudio. Há somente um palco canônico. O palco desaparece após a retirada da lease."
    why_human: "Os testes usam peers, mídia e canal simulados. Eles não demonstram entrega WebRTC entre navegadores reais."
human_verification:
  - test: "Em navegador real, entrar em uma sala e pressionar Ativar microfone e Compartilhar tela. Negar e cancelar cada permissão uma vez."
    expected: "Nenhuma captura inicia antes do gesto. A negação ou o cancelamento deixa a sala estável, sem palco, e sem alterar o áudio existente."
    why_human: "A origem do gesto e a interface nativa de permissão não são observáveis em testes DOM."
  - test: "Com dois navegadores autenticados, iniciar áudio e uma tela. Simular perda de uma invalidação de Realtime e encerrar a tela, inclusive por encerramento da aba do apresentador."
    expected: "O espectador mantém o áudio. O palco some após a rota autoritativa confirmar a retirada ou a expiração da lease."
    why_human: "A entrega P2P, o ciclo real da aba e a Realtime do navegador exigem duas sessões reais."
  - test: "Confirmar em revisão operacional que áudio e tela não são gravados, persistidos, transcritos ou republicados."
    expected: "O transporte permanece efêmero e P2P. Nenhuma gravação, upload ou controle global de host existe."
    why_human: "Esta é uma proibição de julgamento. A busca estática não cobre toda a execução do navegador e da infraestrutura."
  - test: "Antes de implantar, aplicar e ler as duas migrations de screen share no alvo autorizado e executar um smoke com duas identidades."
    expected: "As RPCs, grants, RLS e políticas Realtime existem no alvo antes da aplicação."
    why_human: "Esta verificação não acessou banco local ou online, nem executou implantação."
---

# Fase 03: Áudio Espacial e Compartilhamento de Tela — Relatório de Verificação

**Objetivo da fase:** Usuários usam áudio espacial existente e veem uma tela compartilhada por participante em um palco integrado e expansível, preservando WebRTC P2P e sinalização Supabase Realtime.

**Verificado:** 2026-08-01T14:06:27Z
**Status:** `human_needed`
**Reverificação:** Sim — após fechamento dos gaps.

## Alcance da decisão

Os dois blockers da verificação anterior foram fechados no código e por testes determinísticos. Não há gap automático restante. A fase não pode receber `passed` até a validação humana de navegador e do alvo de implantação.

## Goal Achievement

### Verdades observáveis

| # | Verdade | Status | Evidência no código e nos testes |
| --- | --- | --- | --- |
| 1 | A entrada permanece listen-only. O microfone exige ação explícita e oferece mute/unmute e indicação de fala. | ✓ VERIFIED | `AudioContext.tsx` inicia mudo e chama `initializeLocalStream()` somente em `initializeAudio()`. O teste nomeado `enters a space listen-only...` passou. |
| 2 | Áudio e display usam o mesmo mesh P2P/STUN e o mesmo canal privado Realtime. Uma troca de escopo desmonta a mídia anterior. | ✓ VERIFIED | `WebRTCManager.ts` usa `getIceServers()` e um único `peerConnections`; `useAudioSignaling.ts` abre `company:{company}:space:{space}:media` com `private: true` e cerca escopo, token, sessão, manager, conexão e geração. |
| 3 | Somente um presenter canônico pode alimentar o palco integrado, que cada viewer expande ou recolhe localmente. | ✓ VERIFIED | A migration usa `screen_share_leases.space_id` como chave primária. A rota `active` retorna zero ou uma share. `FloorPlanPresentationStage.tsx` exige correspondência exata de presenter, share e track live. |
| 4 | Negação, cancelamento, track encerrada, saída do presenter e troca de espaço removem o display sem encerrar o áudio da sala. | ✓ VERIFIED | O lifecycle chama somente `stopScreenShare()`. O teste nomeado de sender confirma que `removeTrack(displaySender)` preserva sender, track e conexão de áudio. |
| 5 | `PRESENTER_PROFILE_INVALID` remoto remove somente o display canônico e preserva o manager, canal, áudio, microfone, mute e speaking do viewer. | ✓ VERIFIED | `classifyActiveReadError()` separa `presenter-invalid` de falhas terminais do viewer. O teste nomeado `removes only an invalid remote presenter...` passou e verifica canal e manager ativos. |
| 6 | Uma leitura autoritativa posterior `null` ou incompatível encerra somente o display local uma vez. Uma leitura iniciada antes do claim não encerra uma share recém-confirmada. | ✓ VERIFIED | A versão é atribuída ao início da leitura em `useAudioSignaling.ts`; o claim captura `getActiveShareReadVersion()`. O teste nomeado `ignores the claim baseline...` passou. |
| 7 | Uma falha de `navigator.permissions.query()` não bloqueia microfone. Uma leitura de permissão atrasada de manager aposentado não altera o novo escopo. | ✓ VERIFIED | `initializeAudio()` trata Permissions API como informativa e usa cercas de manager/identidade. Os dois testes nomeados de compatibilidade e manager obsoleto passaram. |

**Score:** 7/7 verdades verificadas.
**Presente, comportamento não verificado:** 1 fluxo P2P/Realtime em navegadores reais.

### Artefatos exigidos

| Artefato | Níveis 1–3 | Fluxo de dados | Resultado |
| --- | --- | --- | --- |
| `src/hooks/realtime/useAudioSignaling.ts` | Existe, é substantivo e é consumido por `AudioProvider`. | Canal privado e sinais somente invalidam; `active` alimenta `activeShare` e a versão observada. | ✓ VERIFIED |
| `src/contexts/AudioContext.tsx` | Existe, é substantivo e monta o lifecycle único de áudio/display. | Click → display capture → claim → manager/display → stage; null/mismatch posterior chama o mesmo stop display-only. | ✓ VERIFIED |
| `src/lib/webrtc/WebRTCManager.ts` | Existe, é substantivo e é criado pelo provider. | Microfone e display usam o mesmo peer; `stopScreenShare()` remove somente o sender/track de display. | ✓ VERIFIED |
| `src/components/floor-plan/FloorPlanPresentationStage.tsx` | Existe, é substantivo e está renderizado antes de `ModernFloorPlan`. | O vídeo recebe `srcObject` somente para a share canônica com track live e o limpa na retirada. | ✓ VERIFIED |
| `src/components/floor-plan/ScreenShareControls.tsx` | Existe, é substantivo e é usado nos controles da sala. | A ação explícita chama `startScreenShare()` e a ação do owner chama `stopScreenShare()`. | ✓ VERIFIED |
| Rotas `claim`, `renew`, `release` e `active` | Existem, são substantivas e validam entradas. | `getUser()` + claims + `users.supabase_uid` → RPC observada → resposta pública validada. | ✓ VERIFIED |
| `supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql` | Existe e contém lease, RLS forçada, grants, RPCs e políticas privadas. | É a fonte do contrato de banco. Nenhum alvo foi lido nesta reverificação. | ⚠️ LOCAL/ALVO NÃO EXERCITADO |

O verificador de artefatos marcou uma ausência textual em `AudioContext.tsx`: o plano pede `activeShareObservationVersionAtClaim`, mas o código implementa a mesma baseline como `activeShareReadVersionAtClaim`. A ligação e os testes confirmam o comportamento. Isto não é um gap funcional.

### Ligações críticas

| De | Para | Via | Status | Detalhes |
| --- | --- | --- | --- | --- |
| `ScreenShareControls` | `AudioContext.startScreenShare` | Clique explícito | ✓ WIRED | O controle chama `await startScreenShare()` somente para ocupante atual. |
| `AudioContext` | rota `claim` | `fetch` após `getDisplayMedia({ video: true, audio: false })` | ✓ WIRED | O display é anexado ao manager somente após resposta `CLAIMED` validada. |
| `useAudioSignaling` | rota `active` | Reconciliação em subscribe, eventos e 10 segundos | ✓ WIRED | Realtime permanece invalidação; a rota é a autoridade. |
| `activeShareObservationVersion` | baseline do lifecycle local | `getActiveShareReadVersion()` no claim | ✓ WIRED | A cerca usa a ordem de início da leitura e evita o race pré-claim. |
| `AudioContext` | `WebRTCManager.stopScreenShare` | `error-cleanup` para null/mismatch posterior | ✓ WIRED | Stop é idempotente e não chama `manager.cleanup()`. |
| `WebRTCManager.stopScreenShare` | sender/track de display | `removeTrack(displaySender)` | ✓ WIRED | O teste focado prova a preservação de microfone, peer e registry. |
| `floor-plan.tsx` | `FloorPlanPresentationStage` | Slot dentro do Card, antes de `ModernFloorPlan` | ✓ WIRED | O palco é integrado, sem rota ou página de chamada paralela. |

### Spot-checks comportamentais

| Comportamento | Comando | Resultado | Status |
| --- | --- | --- | --- |
| Invalidação de presenter remoto preserva áudio/sinalização | `npm.cmd test -- ... -t "removes only an invalid remote presenter"` | Passou | ✓ PASS |
| Null posterior encerra display; baseline pré-claim não encerra | `npm.cmd test -- ... -t "ignores the claim baseline"` | Passou | ✓ PASS |
| Permission query rejeitada ainda inicializa o microfone | `npm.cmd test -- ... -t "initializes microphone audio when the informational permission query rejects"` | Passou | ✓ PASS |
| Permission atrasada não continua em manager aposentado | `npm.cmd test -- ... -t "does not resume a deferred permission read"` | Passou | ✓ PASS |
| Cleanup remove somente display sender | `npm.cmd test -- ... -t "removes only the display sender"` | Passou | ✓ PASS |
| Stage limpa `srcObject` na retirada | `npm.cmd test -- ... -t "binds only the exact canonical live stream"` | Passou | ✓ PASS |
| Entrada listen-only e captura explícita | `npm.cmd test -- ... -t "enters a space listen-only|captures video-only from the direct click"` | 2 arquivos, 2 testes passaram | ✓ PASS |
| Tipos e diff | `npm.cmd run type-check`; `git diff --check` | Passaram | ✓ PASS |

As seis regressões relevantes existem nos commits `9c4fb2e`, `d6264c1`, `d6e1bf2`, `a5383ed` e `97594a1`. Todos existem no histórico atual.

### Probe execution

Nenhum probe de fase foi declarado ou encontrado em `scripts/**/tests/probe-*.sh`.

### Cobertura de requisitos

| Requisito | Descrição | Status | Evidência |
| --- | --- | --- | --- |
| VID-01 | Preservar WebRTC P2P, sinalização Supabase Realtime e STUN gratuito para áudio/tela. | ✓ SATISFEITO EM CÓDIGO/TESTES LOCAIS | Mesh único, `getIceServers()`, tópico privado, rotas canônicas e regressões de invalidação/reconciliação. A entrega entre dois browsers reais aguarda UAT. |
| VID-02 | Entrada listen-only, microfone explícito, mute/unmute e speaking. | ✓ SATISFEITO EM CÓDIGO/TESTES LOCAIS | Estado inicial, controles, initialization fence e testes nomeados de listen-only, permission query e manager obsoleto. |
| VID-04 | Um participante por vez compartilha em palco integrado expansível/recolhível. | ✓ SATISFEITO EM CÓDIGO/TESTES LOCAIS | Lease por espaço, active singleton, stage canônico e regressões de null/mismatch, sender e `srcObject`. |

Não há requisito órfão. Todos os três IDs constam em planos da Fase 03 e no roadmap.

### Anti-padrões

| Arquivo | Achado | Severidade | Impacto |
| --- | --- | --- | --- |
| Arquivos centrais da Fase 03 | Nenhum `TBD`, `FIXME` ou `XXX`; não há testes críticos `skip`/`todo`. | ✓ | Nenhum blocker de dívida encontrado. |
| `src/hooks/realtime/useAudioSignaling.ts` | Handler `presenter-hint` não possui produtor. | ℹ️ INFO | Achado prévio do code review. Não afeta o fluxo canônico `active` nem cria segunda autoridade. |

## Verificação humana necessária

### 1. Áudio e tela P2P reais

**Teste:** Use duas identidades reais na mesma sala. Inicie áudio e uma tela. Remova uma invalidação Realtime e aguarde a reconciliação.
**Esperado:** O áudio continua. Somente uma tela aparece. O palco some depois de stop, saída ou expiração.
**Por que humano:** As suites usam mídia, peer e canais injetados.

### 2. Permissões nativas e cancelamento

**Teste:** Tente microfone e tela somente pelos controles. Negue e cancele os prompts.
**Esperado:** Sem captura antes do clique. A UI retorna ao layout sem compartilhamento e preserva o áudio existente.
**Por que humano:** O prompt e a política de gesto pertencem ao navegador.

### 3. Fechamento da aba do presenter

**Teste:** Feche ou recarregue a aba do presenter com um espectador conectado.
**Esperado:** O espectador mantém áudio e perde o palco após a confirmação autoritativa da retirada/expiração.
**Por que humano:** O ciclo real de aba não é reproduzido pelos doubles.

### 4. Proibições de mídia

**Teste:** Revise a execução e a infraestrutura do fluxo de mídia.
**Esperado:** Não há gravação, persistência, transcrição, republicação ou controle global de host.
**Por que humano:** A proibição é de julgamento e exige inspeção além do código local.

### 5. Contrato do banco antes de rollout

**Teste:** No alvo explicitamente autorizado, aplique e leia as migrations de screen share antes de implantar a aplicação.
**Esperado:** RPCs, grants, RLS e políticas privadas coincidem com o código.
**Por que humano:** Esta reverificação não fez operação de banco nem deployment.

## Gaps Summary

Não há gaps de implementação. Os dois blockers anteriores estão fechados. O status é `human_needed` porque a evidência local não prova P2P/Realtime em dois navegadores reais, permissões nativas, ciclo de aba e compatibilidade do banco no alvo.

---

_Verificado: 2026-08-01T14:06:27Z_
_Verificador: the agent (gsd-verifier)_
