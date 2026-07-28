---
phase: 03-video-and-screen-sharing
verified: 2026-07-28T12:30:50Z
status: gaps_found
score: 5/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "Uma falha de perfil do apresentador não pode derrubar o áudio e o canal de sinalização de um espectador autorizado."
    status: failed
    reason: "O reconciliador classifica todo HTTP 409, inclusive PRESENTER_PROFILE_INVALID do apresentador remoto, como falha terminal do espectador e desmonta o WebRTCManager dele."
    artifacts:
      - path: "src/hooks/realtime/useAudioSignaling.ts"
        issue: "isTerminalAuthorizationResponse() trata 409/PRESENTER_PROFILE_INVALID como autorização terminal; retireForAuthorization() chama o teardown total."
      - path: "src/contexts/AudioContext.tsx"
        issue: "onTerminalAuthorizationDenied() encerra manager, áudio, estado de fala e canal do espectador."
    missing:
      - "Distinguir falhas da identidade do viewer de PRESENTER_PROFILE_INVALID e limpar somente o estado de apresentação correspondente."
      - "Adicionar teste de hook que prove que um perfil inválido remoto não chama onTerminalAuthorizationDenied nem manager.cleanup."
  - truth: "Quando a concessão autoritativa local expira, é revogada ou deixa de ser a canônica, a captura local e o sender de display são encerrados imediatamente."
    status: failed
    reason: "O efeito de reconciliação preserva displayStream quando lifecycle.attached é verdadeiro e signalingActiveShare é null; assim a captura local continua após o active route autoritativo devolver null."
    artifacts:
      - path: "src/contexts/AudioContext.tsx"
        issue: "O guarda nas linhas 683-705 só para no mismatch não nulo e preserva o stream local anexado no caminho null."
    missing:
      - "Fazer o ciclo local observar o primeiro estado canônico e chamar stopScreenShare('error-cleanup') em null/mismatch subsequente."
      - "Adicionar teste com lease local expirado/revogado e active:null que confirme track.stop e remoção do sender de display."
behavior_unverified_items:
  - truth: "Dois navegadores autenticados em uma rede real recebem áudio e a tela P2P do apresentador, com falha de Realtime e retorno à reconciliação autoritativa."
    test: "Com dois usuários e duas sessões reais no ambiente local compatível, entrar na mesma sala, iniciar/encerrar compartilhamento, bloquear uma invalidação de Realtime e aguardar a reconciliação."
    expected: "Áudio continua nos dois clientes; somente uma apresentação canônica aparece; o palco some após encerramento/expiração sem derrubar áudio."
    why_human: "Os testes executados usam limites de navegador/rede/peer injetados; eles não demonstram entrega P2P ou isolamento de duas identidades reais."
human_verification:
  - test: "Verificar em navegador real que o fluxo de permissão de captura só ocorre após pressionar Compartilhar tela."
    expected: "Nenhuma captura de microfone, câmera ou display começa sem gesto explícito e permissão nativa."
    why_human: "A origem do gesto e a UI nativa de permissão não podem ser provadas por testes DOM simulados."
  - test: "Encerrar uma apresentação e testar fechamento/reload da aba do apresentador com outro espectador conectado."
    expected: "O espectador perde o palco rapidamente; no fechamento/reload a liberação imediata deve ser tentada sem depender apenas do TTL."
    why_human: "Não há listener pagehide/unload nem fetch keepalive/sendBeacon no código; o comportamento real de cancelamento do navegador requer decisão e validação humana."
  - test: "Revisar o fluxo real para assegurar que áudio e display não são gravados, persistidos, transcritos ou republicados."
    expected: "O transporte permanece efêmero e P2P; não há gravação nem ação de host global."
    why_human: "É uma proibição de julgamento; a inspeção estática não prova toda a superfície de execução do navegador e infraestrutura."
---

# Fase 03: Áudio Espacial e Compartilhamento de Tela — Relatório de Verificação

**Objetivo da fase:** Entregar áudio espacial local, sem custo e limitado à sala, e uma experiência canônica de compartilhamento de tela integrada, preservando limites de evidência e de rollout.

**Verificado:** 2026-07-28T12:30:50Z  
**Status:** `gaps_found`  
**Reverificação:** Não — verificação inicial

## Conclusão

O objetivo **não foi atingido**. A implementação tem uma base substancial: usa o manager P2P existente, canais Realtime privados, contratos de rota validados, uma concessão local com RLS e um palco integrado. Porém, dois caminhos autoritativos de reconciliação quebram garantias essenciais: um erro no perfil do apresentador pode desligar o áudio de espectadores válidos, e uma captura local pode continuar transmitindo depois de a concessão autoritativa expirar ou ser invalidada. Não há item posterior no roadmap que trate desses defeitos; não foram adiados.

## Goal Achievement

### Verdades observáveis

| # | Verdade | Status | Evidência no código |
| --- | --- | --- | --- |
| 1 | Entrar em uma sala mantém o microfone inicialmente desativado; ativação, mute/unmute e indicadores são explícitos. | ✓ VERIFIED | `AudioContext` inicia `isMuted=true`/`isAudioEnabled=false`; somente `initializeAudio()` chama `initializeLocalStream()`. `audio-context.test.tsx` passou no teste focado. |
| 2 | Áudio e display estendem o mesmo mesh P2P/ICE e o canal Realtime privado, sem SFU ou registro paralelo de peers. | ✓ VERIFIED | `WebRTCManager` mantém um `peerConnections` map e papéis distintos de microfone/display; importa `getIceServers`. `useAudioSignaling` abre `company:{company}:space:{space}:media` com `private:true` e reconcilia via active route. |
| 3 | Uma única concessão canônica autoriza o apresentador e a UI mostra um palco integrado que cada viewer pode expandir/colapsar. | ✓ VERIFIED | A migração dá `space_id` como chave primária de `screen_share_leases`; `FloorPlanPresentationStage` conecta apenas stream cujo presenter/share ID corresponde ao estado canônico; o slot fica antes de `ModernFloorPlan`. |
| 4 | Autorização de rota/RLS usa identidade Auth validada mapeada para `users.supabase_uid`, sem permitir identidade de empresa/apresentador escolhida pelo cliente. | ✓ VERIFIED | `requireVerifiedPresenceAuth()` usa `auth.getUser()`, confere claims e busca o usuário por `findBySupabaseUid`; as rotas enviam somente IDs validados ao RPC service-role. A policy de tópico mapeia `u.supabase_uid = v_subject`. |
| 5 | Um erro de perfil do apresentador não interrompe a conversa de áudio de outros ocupantes autorizados. | ✗ FAILED — BLOCKER | `useAudioSignaling.ts:81-85` transforma todo 409 e `PRESENTER_PROFILE_INVALID` em terminal; `:357` chama `retireForAuthorization`; `AudioContext.tsx:179-194` desmonta o manager, áudio e canal do espectador. |
| 6 | A captura local encerra quando `active` autoritativo passa a `null` por expiração, revogação ou perda de escopo. | ✗ FAILED — BLOCKER | Em `AudioContext.tsx:681-705`, `signalingActiveShare === null` não aciona `stopScreenShare`; `lifecycle.attached` conserva `displayStream`. A migration expira a lease em 30 s, mas o sender local permanece até a próxima renovação falhar. |
| 7 | O rollout é apresentado honestamente como somente local e sem custo, sem alegar TURN, deploy ou banco remoto aplicados. | ✓ VERIFIED | A documentação de encerramento registra `local-only`, STUN gratuito e ausência de banco/deploy/TURN online; a inspeção encontrou apenas migrations locais. Isso não é evidência de rollout remoto. |

**Score:** 5/7 verdades verificadas (1 presente mas com comportamento de rede/navegador real não exercitado).

### Requisitos

| Requisito | Planos fonte | Descrição | Status | Evidência |
| --- | --- | --- | --- | --- |
| VID-01 | 01–14 | Preservar/estender P2P WebRTC, Realtime e STUN gratuito para áudio e tela. | ✗ BLOCKED | A arquitetura está preservada, mas CR-01 deixa um erro de perfil remoto derrubar o manager de áudio de espectadores; portanto não é áudio de sala confiável. |
| VID-02 | 01, 03, 05, 06, 10–14 | Entrada listen-only e microfone explícito com mute/unmute e indicação de fala. | ✓ SATISFIED | Estado inicial mudo e `getUserMedia` só pela ação explícita; teste focado de contexto de áudio passou. |
| VID-04 | 01–14 | Um participante por vez compartilha em palco integrado expansível/colapsável. | ✗ BLOCKED | A concessão/estágio são implementados, mas CR-02 pode manter a transmissão do apresentador após a autoridade canônica ter desaparecido. |

Não há requisitos órfãos: todos os três IDs mapeados à Fase 03 aparecem em frontmatter de planos.

## Artefatos exigidos

| Artefato | Níveis 1–3 | Fluxo de dados | Resultado |
| --- | --- | --- | --- |
| `src/lib/webrtc/WebRTCManager.ts` | Existe, é substantivo e é usado por `AudioProvider`. | `getIceServers` → peer connection; áudio/display permanecem no mesmo manager. | ✓ VERIFIED |
| `src/hooks/realtime/useAudioSignaling.ts` | Existe, é substantivo e é chamado por `AudioProvider`. | active route → `activeShare` → provider. | ✗ PARTIAL: erro de perfil remoto provoca teardown do escopo do viewer. |
| `src/contexts/AudioContext.tsx` | Existe, é substantivo e montado por `floor-plan.tsx`. | captura → claim → manager/display → stage. | ✗ PARTIAL: `active:null` não encerra captura local anexada. |
| `src/components/floor-plan/FloorPlanPresentationStage.tsx` | Existe, é substantivo e renderizado antes de `ModernFloorPlan`. | Só atribui `video.srcObject` para presenter/share ID e track ao vivo correspondentes. | ✓ VERIFIED |
| `src/app/api/spaces/[id]/screen-share/{claim,renew,release,active}/route.ts` | Existem, são substantivas e chamadas pelo provider/reconciliador. | JWT validado → app user mapeado → RPC de escopo estrito → resposta pública validada. | ✓ VERIFIED |
| `supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql` | Existe e contém lease, `ENABLE/FORCE RLS`, grants e policies privadas. | Fonte local do contrato de banco; não foi aplicada nem lida em alvo online nesta verificação. | ⚠️ LOCAL-ONLY |

## Verificação de ligações críticas

| De | Para | Via | Status | Detalhes |
| --- | --- | --- | --- | --- |
| `ScreenShareControls` | `AudioContext.startScreenShare` | clique explícito | ✓ WIRED | O controle só aparece para ocupante atual e chama `await startScreenShare()`. |
| `AudioContext` | claim/renew/release | `fetch` com presença e share IDs | ✓ WIRED | Ordem é picker → claim → `manager.startScreenShare`; renovação tem falha fechada. |
| `useAudioSignaling` | active route | reconciliação em subscribe/reconnect e a cada 10 s | ✓ WIRED | Timer é cercado por geração/subscrição e usa `AbortController`. |
| active route canônico | captura local | efeito `signalingActiveShare` | ✗ NOT_WIRED CORRETAMENTE | O caminho `null` conserva a captura local; ver gap 2. |
| active route 409 | áudio do espectador | classificação terminal | ✗ NOT_WIRED CORRETAMENTE | 409 de perfil do apresentador é confundido com falha de autorização do viewer; ver gap 1. |

## Segurança e contrato Supabase

- O limite server-side é adequado no código local: `auth.getUser()` valida o JWT; `getClaims()` fornece `sub` e `session_id`; a identidade da aplicação vem de `users.supabase_uid`, não de `users.id == auth.uid()`.
- As rotas são server-only e usam service role apenas após autenticação/derivação de identidade; o cliente não escolhe empresa, apresentador, prazo ou revisões.
- A migration local restringe RPCs de lease ao `service_role`, nega acesso direto à tabela e cria quatro policies `realtime.messages` que chamam `private.is_media_topic_authorized()`.
- Essas propriedades são evidência de fonte e de testes locais declarados; não provam migração, RLS, Realtime ou rollout de um banco online. Nenhuma operação online foi executada nesta verificação.

## Spot-checks comportamentais

| Comportamento | Comando | Resultado | Status |
| --- | --- | --- | --- |
| Reconciliação, escopo e retirada do palco remoto | `npm.cmd test -- __tests__/audio-signaling.test.tsx __tests__/screen-share-context.test.tsx` | 37 testes passaram | ✓ PASS, mas não cobre o presenter local com `active:null` nem perfil remoto inválido. |
| Entrada listen-only e controles de microfone | `npm.cmd test -- __tests__/audio-context.test.tsx` | 3 testes passaram | ✓ PASS |

## Anti-padrões e findings independentes

| Arquivo | Linha | Padrão | Severidade | Impacto |
| --- | --- | --- | --- | --- |
| `src/hooks/realtime/useAudioSignaling.ts` | 81–85, 357 | 409 genérico tratado como autorização terminal | 🛑 BLOCKER | Perfil inválido do apresentador derruba áudio/Reatime do espectador válido. |
| `src/contexts/AudioContext.tsx` | 681–705 | `active:null` preserva lifecycle/display local anexado | 🛑 BLOCKER | Captura e sender podem sobreviver à expiração/revogação da concessão. |
| `src/contexts/AudioContext.tsx` | 392–400 | release usa `fetch` comum, sem `keepalive`/beacon e sem `pagehide` | ⚠️ WARNING | Fechamento/reload pode depender do TTL de 30 s para limpar o estado visto por outros. |

Não foram encontrados marcadores de dívida `TBD`, `FIXME` ou `XXX` nos arquivos principais da Fase 03. Os `return null` encontrados são guardas intencionais de UI e não stubs.

## Limites de evidência e verificação humana

Os testes locais e determinísticos não comprovam entrega P2P entre navegadores reais, isolamento Realtime/RLS em um alvo compartilhado, TURN em rede restritiva, compatibilidade ampla de browsers ou qualquer rollout. A fase declara corretamente esses limites e não há rollout online autorizado. As três verificações humanas listadas no frontmatter continuam necessárias após a correção dos blockers.

## Resumo de gaps

Os dois blockers não são trabalho futuro: Fases 4–7 tratam de mensagens, notas e anúncios, sem critério que cubra mídia, lease ou sinalização. A Fase 03 não deve avançar como concluída até que ambos sejam corrigidos e recebam testes de regressão específicos.

---

_Verificado: 2026-07-28T12:30:50Z_  
_Verificador: agente gsd-verifier_
