# Phase 3: Spatial Audio and Screen Sharing - Research

**Researched:** 2026-07-22
**Domain:** WebRTC P2P, screen capture, Supabase Realtime authorization, React floor-plan UI
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Product priority and transport
- **D-01:** The acceptance-critical outcome is existing spatial audio plus reliable screen sharing, suitable for demonstrating the product to the user's company.
- **D-02:** Preserve and extend the existing P2P WebRTC audio transport and Supabase Realtime signaling for this phase. Do not migrate to LiveKit or another SFU now. — **Reversibility:** costly — a future migration replaces `WebRTCManager` and signaling internals, although the product UI and space behavior can remain.
- **D-03:** Do not build a general-purpose Zoom/Meet equivalent. Faces are secondary to clearly seeing the content being presented.
- **D-04:** Basic camera video is optional only when it can reuse the chosen implementation safely; it must not delay or weaken audio or screen sharing and is not a completion gate.
- **D-05:** Research and planning must validate the current P2P approach with realistic multi-user screen-sharing tests before claiming support at larger room sizes. LiveKit or another SFU remains the expansion path if observed performance, recording, or advanced video later requires it.

### Meeting model
- **D-06:** The space itself is the meeting. There is no separate call session to create, invite everyone into, or end globally.
- **D-07:** Every occupant belongs to the room conversation. Existing open/restricted space access and Knock to Enter govern who may enter; do not create a second "closed meeting" concept.
- **D-08:** On entering a space, the person connects in listen-only mode: remote audio is available, while their microphone and camera remain off until explicitly enabled.
- **D-09:** The room is persistent while occupied. No implicit host can end the conversation for everyone.
- **D-10:** Moving to another space fully ends media participation in the prior space. In the new space, the person again enters listening and must reactivate microphone, camera, or sharing.

### Screen-sharing experience
- **D-11:** Only one participant may share a screen at a time.
- **D-12:** A shared screen occupies the main stage. Participant faces, when basic video exists, remain in a secondary strip rather than competing with the presented content.
- **D-13:** The stage is integrated into the floor-plan page and can be expanded or collapsed, preserving the relationship between the presentation and its space.
- **D-14:** Each viewer may change their own presentation view; ending screen sharing restores the prior stable layout.
- **D-15:** If basic video is included, use a stable grid with speaking indication and local pinning. Do not automatically replace the spotlight whenever the active speaker changes.

### Claude's Discretion
- Exact stage dimensions, responsive breakpoints, and whether the participant strip sits beside or below the shared screen.
- The low-level renegotiation strategy used to add and remove the display track while preserving existing audio.
- Error wording and retry timing, provided permission denial, user cancellation, presenter departure, and browser share termination are handled visibly.
- Whether optional basic camera support is safe enough to include after audio and screen-sharing acceptance criteria are complete.

### Deferred Ideas (OUT OF SCOPE)
- Mandatory camera grid for up to nine participants (advanced VID-03 scope).
- LiveKit or another SFU transport migration for scale and adaptive media.
- Shared whiteboard and PNG export (VID-05).
- Call recording and Supabase Storage output (VID-06).
- Background blur and virtual backgrounds (VID-07).
- Detailed connection-quality indicators and diagnostics (VID-08).
- Picture-in-picture call window (VID-09).
- Google Calendar/Outlook scheduling and reminders (VID-10).
- Multiple simultaneous screen shares.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VID-01 | Existing peer-to-peer WebRTC media, Supabase Realtime signaling, and STUN/TURN configuration are preserved and extended for room-scoped audio and screen sharing. | Estender o único `WebRTCManager`, substituir a renegociação manual por perfect negotiation e autorizar o tópico Realtime privado por empresa/espaço. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`; CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation; CITED: https://supabase.com/docs/guides/realtime/authorization] |
| VID-02 | User entering a space connects to room audio in listen-only mode and can explicitly enable, mute, or unmute their microphone with speaker indication. | Preservar `AudioProvider`/`SpaceAudioControls`: o manager nasce com mic mudo e só chama `getUserMedia` por ação explícita. [VERIFIED: `src/contexts/AudioContext.tsx`; VERIFIED: `src/components/floor-plan/SpaceAudioControls.tsx`] |
| VID-04 | One participant at a time can share a window, tab, or entire screen on an integrated floor-plan stage that each viewer can expand or collapse. | `getDisplayMedia` deve iniciar no clique; um lease transacional por espaço arbitra o apresentador; a faixa `video` remota alimenta uma stage React localmente expansível. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia; VERIFIED: `src/components/floor-plan/floor-plan.tsx`] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Inspecionar implementação, testes, runtime e esquema antes de planejar/alterar; reutilizar componentes, hooks, tipos, RPCs e migrations existentes; não adivinhar. [VERIFIED: `CLAUDE.md`]
- Manter mudanças estritamente no escopo, TypeScript estrito, sem `any`, sem suprimir erros/testes, sem refactors paralelos e sem auto-commit. [VERIFIED: `CLAUDE.md`]
- Separar sempre estado de aplicação, banco local, banco online nomeado e deploy; mudança online exige alvo e autorização explícitos, readback e smoke test. [VERIFIED: `CLAUDE.md`]
- Para Presence/Realtime, aplicar `presence-safety`: snapshot/RPC do banco permanece autoridade de ocupação, acesso e placement; Broadcast/Presence não se tornam autoridade e não pode surgir outro writer de movimento. [VERIFIED: `CLAUDE.md`; VERIFIED: `.agents/skills/presence-safety/SKILL.md`]
- Rotas e módulos server usam `createSupabaseServerClient`; autenticação server usa `auth.getUser()`; código cliente usa `createSupabaseBrowserClient`; nunca expor `SUPABASE_SERVICE_ROLE_KEY`. [VERIFIED: `CLAUDE.md`]
- IDs de domínio usam `users.id`; identidade Auth entra por `users.supabase_uid`; nunca comparar `users.id` diretamente a `auth.uid()`. [VERIFIED: `CLAUDE.md`]
- Mudança de migration, RLS, repositório ou API de banco passa pelo gate Supabase/RLS; verificar o schema e políticas reais do alvo, não somente documentação do repositório. [VERIFIED: `CLAUDE.md`]
- Manter lógica de negócio em serviços/utilities, acesso a dados em repositories e view em componentes; hooks de Realtime dedicados ficam em `src/hooks/realtime`; controles dentro de cards clicáveis seguem o protocolo `data-avatar-interactive`/`data-space-action`. [VERIFIED: `CLAUDE.md`]
- Evidência mínima proporcional inclui testes focados, type-check/lint, build quando aplicável, checks banco/RLS para alegações de banco e smoke de navegador para fluxos visíveis; mocks não provam Realtime ou multiusuário. [VERIFIED: `CLAUDE.md`]
- Não fazer stage, commit, push ou PR nesta pesquisa; preservar as alterações de planejamento já sujas do usuário. [VERIFIED: `CLAUDE.md`]

## Summary

A base existente já possui uma fronteira reutilizável: `FloorPlan` deriva o espaço atual do snapshot autoritativo e monta um `AudioProvider`; ele cria um `WebRTCManager` por espaço/usuário, assina `room:audio:${spaceId}` e somente pede microfone depois de uma ação do usuário. A limpeza atual encerra conexões, tracks locais, elementos de áudio, VAD e canal ao trocar de espaço. [VERIFIED: `src/components/floor-plan/floor-plan.tsx`; VERIFIED: `src/contexts/AudioContext.tsx`; VERIFIED: `src/lib/webrtc/WebRTCManager.ts`; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`]

A fase não deve criar um subsistema de chamada paralelo. Ela deve evoluir esse manager para possuir tracks locais por papel (`microphone` e `screen`), streams remotos separados por peer/tipo e uma máquina de negociação perfeita. A atual criação manual de offers após `addTrack()` não resolve colisões de offers; uma tela adicionada/removida aumenta justamente essa probabilidade. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`; CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]

A decisão “exatamente um apresentador” não é segura se for apenas Broadcast/Presence: tais mensagens são efêmeras e não fazem exclusão mútua nem reidratação canônica após reconnect. Recomenda-se um lease curto, atômico e por espaço no banco exclusivamente para arbitrar o apresentador; mídia e SDP/ICE continuam P2P, e Supabase Realtime continua apenas signaling/invalidação. Isso requer migration de contrato/RLS, mas não uma migração de transporte para SFU. [CITED: https://supabase.com/docs/guides/realtime/broadcast; CITED: https://supabase.com/docs/guides/realtime/presence; VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-CONTEXT.md`]

**Primary recommendation:** Implementar uma `screen-share lease` por espaço, validar ocupação no servidor, usar canal Realtime privado `company:{companyId}:space:{spaceId}:media`, e adotar perfect negotiation antes de anexar/remover a faixa de display. [CITED: https://supabase.com/docs/guides/realtime/authorization; CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ocupação, acesso ao espaço e elegibilidade para compartilhar | Database / Storage | API / Backend | O snapshot/RPC de Presence é a autoridade; cliente apenas inicia mídia depois de observar ocupação. [VERIFIED: `.agents/skills/presence-safety/references/state-model.md`; VERIFIED: `src/components/floor-plan/floor-plan.tsx`] |
| Exclusão mútua de apresentador | Database / Storage | API / Backend | Claim atômico por `space_id` evita dois vencedores sob cliques concorrentes e permite expiração após saída abrupta. [CITED: https://supabase.com/docs/guides/realtime/broadcast] |
| Autorização do canal e signaling SDP/ICE | API / Backend | Browser / Client | RLS em `realtime.messages` autoriza tópico privado; cliente transmite SDP/ICE para pares alvo, sem conceder acesso/placement. [CITED: https://supabase.com/docs/guides/realtime/authorization; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`] |
| Captura de tela e tracks WebRTC | Browser / Client | — | Somente o navegador pode solicitar o picker de display e controlar `RTCPeerConnection`/tracks. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia] |
| Stage expansível/colapsável e preview | Browser / Client | — | A preferência de expansão é local a cada viewer; não deve ser Broadcast nem banco. [VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-CONTEXT.md`] |
| Troca de espaço e teardown | Browser / Client | Database / Storage | A mudança confirmada no snapshot remonta `AudioProvider`; cliente remove canal, peers e tracks, enquanto o lease expira/libera como proteção contra abandono. [VERIFIED: `src/contexts/AudioContext.tsx`; VERIFIED: `.agents/skills/presence-safety/references/realtime-debugging.md`] |

## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Browser `RTCPeerConnection`, `MediaStream`, `MediaDevices.getDisplayMedia` | Web platform | Mesh P2P existente, captura de janela/aba/tela e tracks de display. | Evita SDK/transport novo; o picker, permissões e fim da captura são responsabilidades nativas do navegador. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia] |
| `@supabase/supabase-js` | 2.110.7 resolvido localmente; não atualizar nesta fase | Canal Realtime para handshake, SDP, ICE e hints de apresentação. | Já é a dependência e cliente usados por `useAudioSignaling`; a fase só torna o tópico privado/autorizado. [VERIFIED: `npm ls @supabase/supabase-js --depth=0`; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; CITED: https://supabase.com/docs/guides/realtime/broadcast] |
| React / Next.js | React 19.2.7, Next 16.2.10 resolvidos localmente | Provider de mídia e stage integrada ao floor plan. | A árvore atual já monta `AudioProvider` em `FloorPlan`; não há necessidade de player ou framework de call adicional. [VERIFIED: `npm ls react react-dom --depth=0`; VERIFIED: `node_modules/.bin/next --version`; VERIFIED: `src/components/floor-plan/floor-plan.tsx`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.3 | Validar bodies das rotas de claim/release e payloads Broadcast não confiáveis antes de invocar o manager. | Declarar como dependência direta de produção antes de novos imports: o código atual já o importa, mas `npm ls zod --depth=0` mostra que ele hoje só chega transitivamente. [VERIFIED: npm registry; VERIFIED: `npm ls zod`; VERIFIED: `src/lib/presence/transition-contract.ts`; CITED: https://zod.dev/] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lease transacional de apresentação | Apenas Broadcast/Presence com `presenterId` | Rejeitado: mensagens efêmeras aceleram a UI, mas não fornecem exclusão mútua, recuperação canônica ou autorização para a regra “um apresentador”. [CITED: https://supabase.com/docs/guides/realtime/broadcast; CITED: https://supabase.com/docs/guides/realtime/presence] |
| P2P existente | LiveKit/SFU | Adiado por D-02/D-05; reduziria custo de uplink do presenter em escala, mas troca o transporte fora do escopo. [VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-CONTEXT.md`] |
| Tela somente | Grid de câmera obrigatório | Adiado: VID-03 não é critério de aceite e multiplicaria tracks, UI e carga do mesh. [VERIFIED: `.planning/REQUIREMENTS.md`; VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-CONTEXT.md`] |

**Installation:**
```bash
npm install zod@4.4.3
```

Não atualizar React, Next ou Supabase nesta fase. As versões mais recentes de `@supabase/supabase-js`, `react` e `react-dom` foram classificadas como `SUS` pelo gate somente por publicação muito recente; nenhuma atualização é necessária para o escopo. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age / publicação | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-----------|-------------|---------|-------------|
| `zod` | npm | 4.4.3 publicado em 2026-05-04 | 234,133,326/semana | `github.com/colinhacks/zod` | OK | Approved — declarar diretamente e fixar `4.4.3`. [VERIFIED: npm registry] |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: npm registry]
**Packages flagged as suspicious [SUS]:** nenhum pacote será instalado com verdict `SUS`; as atualizações recentes observadas de dependências existentes ficam fora do plano. [VERIFIED: npm registry]

O registry confirmou `zod@4.4.3`; o check de legitimidade retornou `OK` e não há `postinstall`. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Snapshot autoritativo de Presence
        │ currentSpaceId + company/app-user/session scope
        ▼
FloorPlan ── monta/remonta ──> AudioProvider (company, user, space, session)
        │                                   │
        │ clique explícito em mic           ├──> WebRTCManager (1 PC por peer)
        │                                   │         │
        │                                   │         ├──> áudio P2P + VAD
        │                                   │         └──> screen track P2P
        │                                   ▼
        │                          Canal privado Realtime
        │                          company:{company}:space:{space}:media
        │                           │ Broadcast SDP/ICE + hints
        │                           ▼
        │                    RLS realtime.messages (empresa/espaço)
        │
        └── clique "Compartilhar" ──> getDisplayMedia() ──> API claim
                                                 │              │
                                           cancel/deny ──> stop  └──> lease atômico por espaço
                                                                      │ conflict? ──> stop local + UI estável
                                                                      ▼
                                              add display track -> negotiationneeded -> peers
                                                                      ▼
                                      remote video stream -> FloorPlanPresentationStage
                                                                      │
                                  expand/collapse local por viewer; ended/leave -> release + restore layout
```

O fluxo mantém autoridade de Presence fora do canal de mídia: Broadcast é transporte de signaling/hint; não move, não autoriza e não altera ocupação. [VERIFIED: `.agents/skills/presence-safety/SKILL.md`; CITED: https://supabase.com/docs/guides/realtime/authorization]

### Recommended Project Structure

```text
src/
├── app/api/spaces/[spaceId]/screen-share/
│   ├── claim/route.ts                 # auth.getUser + contrato Zod + claim atômico
│   ├── release/route.ts               # release idempotente pelo owner/session/shareId
│   └── active/route.ts                # leitura autorizada para reidratar stage
├── components/floor-plan/
│   ├── ScreenShareControls.tsx        # ação explícita e estados de permissão/conflito
│   └── FloorPlanPresentationStage.tsx # video ref, stage, expand/collapse local
├── contexts/AudioContext.tsx          # expõe estado/ações de share do manager atual
├── hooks/realtime/useAudioSignaling.ts # tópico privado + schemas + signaling unificado
├── lib/webrtc/
│   ├── WebRTCManager.ts               # tracks por papel, perfect negotiation, cleanup
│   └── screen-share-contract.ts       # schemas/tipos de claim e payloads de signaling
└── repositories/
    └── screen-share-lease-repository.ts # acesso de dados server, se o padrão de route o usar
```

Os nomes de arquivos são uma recomendação de divisão coesa; o planner deve primeiro localizar o padrão de repository de rotas existente e não criar wrapper vazio. [VERIFIED: `CLAUDE.md`]

### Pattern 1: Captura primeiro, claim depois, publicação por último

**What:** Chamar `getDisplayMedia({ video: true, audio: false })` diretamente no handler de clique. Somente quando o stream retornar, enviar o claim atômico ao servidor; apenas o vencedor anexa a track ao manager e envia signaling. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]

**When to use:** Sempre que iniciar apresentação. O await de uma API de claim antes do picker pode perder a ativação transitória exigida pelo browser. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]

**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
async function startScreenShareFromClick(): Promise<void> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('DISPLAY_TRACK_MISSING');

  track.addEventListener('ended', () => {
    void stopScreenShare('browser-ended');
  }, { once: true });

  const claim = await claimScreenShareOnServer();
  if (!claim.ok) {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    return;
  }

  await webrtcManager.startScreenShare(stream, claim.shareId);
}
```

### Pattern 2: Perfect negotiation por peer determinístico

**What:** Cada `RTCPeerConnection` recebe papel `polite` determinístico (por exemplo, comparação estável de IDs de app-user) e centraliza ofertas em `onnegotiationneeded`; o peer impolite ignora uma offer concorrente e seus ICE candidates. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]

**When to use:** Na conexão inicial, ao ativar microfone após entrar, ao adicionar tela, ao remover tela e ao criar um peer depois de a apresentação já estar ativa. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`; CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]

**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    await sendDescription(peerId, pc.localDescription!);
  } finally {
    makingOffer = false;
  }
};
```

### Pattern 3: Lease de apresentador não é “sessão de reunião”

**What:** A tabela/RPC armazena somente o owner atual, `space_id`, `share_id`, auth/presence session fence e expiração curta. `claim` bloqueia por espaço, revalida empresa, ocupação e sessão ativa; `release` exige owner + `share_id` e é idempotente. [VERIFIED: `.agents/skills/presence-safety/references/transitions.md`; VERIFIED: `src/app/api/presence/location/route.ts`]

**When to use:** Para D-11, reconexão de viewer, abandono do presenter e race de dois cliques. Não usar o lease para iniciar/finalizar a conversa inteira, mudar placement ou conceder acesso a espaço. [VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-CONTEXT.md`; VERIFIED: `.agents/skills/presence-safety/SKILL.md`]

### Pattern 4: Media state separado por tipo, UI local por viewer

**What:** Modelar `localMicrophoneStream`, `localDisplayStream`, `remoteAudioByPeer` e `remoteDisplayByPeer` separadamente. O callback `ontrack` roteia por `event.track.kind`; somente a track `video` do `presenterId/shareId` canônico alimenta o `<video playsInline autoPlay>`. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

**When to use:** Ao estender o manager atual, que hoje sempre cria um `<audio>` e trata o stream remoto como áudio. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

### Anti-Patterns to Avoid

- **Usar Broadcast/Presence como lock de apresentador:** dois clientes podem anunciar compartilhamento sem exclusão mútua; usar lease atômico e tratar eventos como hints. [CITED: https://supabase.com/docs/guides/realtime/broadcast]
- **Fazer `claim` de rede antes de `getDisplayMedia`:** pode causar `InvalidStateError` por falta de ativação transitória; abrir o picker no clique. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
- **Emitir `createOffer()` manualmente em cada `addTrack`:** deixa colisões/glare sem protocolo; usar `onnegotiationneeded` e perfect negotiation. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
- **Passar qualquer `ontrack` a um `<audio>`:** uma track de tela não pode substituir a mídia de áudio; manter stores/elementos separados por tipo. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]
- **Aceitar payload Broadcast tipado apenas por TypeScript:** payload de Realtime é entrada externa; parsear antes de SDP/ICE/ações de stage. [CITED: https://supabase.com/docs/guides/realtime/broadcast; VERIFIED: `src/lib/presence/transition-contract.ts`]
- **Aguardar RLS desconectar alguém que mudou de espaço:** autorização de canal privado é avaliada/armazenada ao conectar; remover imediatamente o canal e invalidar callbacks no teardown de espaço. [CITED: https://supabase.com/docs/guides/realtime/authorization; VERIFIED: `.agents/skills/presence-safety/references/realtime-debugging.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Picker e permissões de tela | Modal próprio ou permissão persistida | `navigator.mediaDevices.getDisplayMedia` | O browser controla fontes, consentimento e regras de ativação; opções não restringem a seleção do usuário. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia] |
| Renegociação e glare | Regras ad hoc de “caller/callee” | Perfect negotiation com `onnegotiationneeded`, `makingOffer`, polite/impolite | Trata colisões que surgem ao adicionar/remover tracks. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation] |
| NAT traversal | Servidor de mídia próprio ou ICE customizado | `RTCPeerConnection` com `getIceServers()` atual e TURN operacional | Preserva STUN/TURN e o transporte P2P existente. [VERIFIED: `src/lib/webrtc/ice-config.ts`; VERIFIED: `src/lib/webrtc/WebRTCManager.ts`] |
| Exclusão mútua | Flag React ou Broadcast “presenterId” | RPC/transaction com lease por espaço | Flags locais e eventos efêmeros não serializam claim concorrente. [CITED: https://supabase.com/docs/guides/realtime/broadcast] |
| Validação de contratos externos | Cast `as` em body/payload | Zod `safeParse` no boundary | Evita que SDP/ICE e IDs malformados atinjam o manager ou a rota. [VERIFIED: npm registry; CITED: https://zod.dev/] |

**Key insight:** A mídia pode permanecer totalmente efêmera e P2P, mas a regra global “somente um” exige uma autoridade serializável; o banco guarda apenas esse lease mínimo, não uma call/session paralela. [CITED: https://supabase.com/docs/guides/realtime/broadcast]

## Common Pitfalls

### Pitfall 1: Picker bloqueado ou cancelado deixa estado “sharing”
**What goes wrong:** O botão entra em loading permanente ou o lease fica ativo após `NotAllowedError`, cancelamento ou `ended`. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
**Why it happens:** `getDisplayMedia` exige gesto transitório, não persiste permissão e a parada feita pelo browser chega pelo evento `ended`. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
**How to avoid:** Iniciar a captura no clique; classificar `NotAllowedError`, `InvalidStateError`, `NotFoundError`, `NotReadableError` e `AbortError`; registrar `ended` uma vez; em qualquer saída, parar tracks locais, release idempotente e restaurar layout. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
**Warning signs:** Stage local fica ativa sem track `live`, ou outro usuário recebe `PRESENTER_BUSY` depois de o browser encerrar a captura. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

### Pitfall 2: Glare durante entrada, microfone ou tela
**What goes wrong:** `setRemoteDescription` falha em estado incorreto ou a track de tela não chega a todos. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
**Why it happens:** O código atual cria offers manualmente em handshake e `addLocalStreamToPeers`, sem flags de offer collision. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]
**How to avoid:** Refatorar a negociação inteira, não apenas a tela, para perfect negotiation antes de acrescentar o primeiro display track. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
**Warning signs:** `signalingState` diferente de `stable`, respostas descartadas, ou um peer recebe áudio mas não vídeo. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

### Pitfall 3: Dois apresentadores por race de Broadcast
**What goes wrong:** Dois usuários clicam compartilhar e cada lado renderiza uma tela. [CITED: https://supabase.com/docs/guides/realtime/broadcast]
**Why it happens:** Broadcast/Presence sincroniza estado no tópico, mas não é uma operação de lock/compare-and-set. [CITED: https://supabase.com/docs/guides/realtime/broadcast; CITED: https://supabase.com/docs/guides/realtime/presence]
**How to avoid:** Claim transacional único por `space_id`; só anexar/publicar track quando o claim retornar `OK`; tratar conflito como estado visível “alguém já está apresentando”. [VERIFIED: `.agents/skills/presence-safety/references/transitions.md`]
**Warning signs:** Duas offers com tracks de `video` de owners distintos ou dois `shareId` ativos na mesma sala. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

### Pitfall 4: Canal público ou callback do espaço antigo vaza mídia
**What goes wrong:** Pessoa de outra empresa/espaço assina signaling, ou um evento atrasado do espaço A altera o stage do espaço B. [CITED: https://supabase.com/docs/guides/realtime/authorization]
**Why it happens:** O canal atual é `room:audio:${spaceId}` sem `private: true`; no repositório só existem políticas `realtime.messages` para tópicos Presence/Knock, não para áudio. [VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; VERIFIED: `supabase/migrations/20260716175515_phase4_knock_delivery_and_retention.sql`; VERIFIED: `supabase/migrations/20260718204506_phase6_private_company_presence.sql`]
**How to avoid:** Migration de política para tópico empresa/espaço + `config.private: true`; cancelar/remover o canal exato e usar generation/ref para ignorar callbacks velhos. [CITED: https://supabase.com/docs/guides/realtime/authorization; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`]
**Warning signs:** `removeChannel` não é chamado na troca, mensagens de `spaceId` velho chegam após remount, ou policy readback não lista as quatro permissões necessárias. [VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; CITED: https://supabase.com/docs/guides/realtime/authorization]

### Pitfall 5: Quebrar listen-only ao compartilhar
**What goes wrong:** Compartilhar pede microfone, habilita `getUserMedia` ou altera mute sem consentimento explícito. [VERIFIED: `src/contexts/AudioContext.tsx`]
**Why it happens:** Misturar `localStream` de áudio com display stream e reaproveitar a inicialização de mic. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]
**How to avoid:** `startScreenShare` recebe apenas display stream; não chama `initializeLocalStream`, não toca `isMuted` e envia `audio: false` para captura de tela. [VERIFIED: `src/contexts/AudioContext.tsx`; CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
**Warning signs:** Ícone de mic muda após compartilhar ou o browser exibe prompt de microfone para usuário que só escolheu uma tela. [VERIFIED: `src/components/floor-plan/SpaceAudioControls.tsx`]

### Pitfall 6: Saída abrupta mantém stage órfã
**What goes wrong:** Presenter fecha aba/muda de espaço e viewers continuam vendo último frame ou lease bloqueia a sala. [VERIFIED: `src/contexts/AudioContext.tsx`; VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]
**Why it happens:** Cleanup client é best-effort e uma requisição não é garantida quando a aba morre. [VERIFIED: `.agents/skills/presence-safety/references/testing.md`]
**How to avoid:** Cleanup imediato no provider e `onPeerDisconnected`, mais TTL/heartbeat do lease e leitura autorizada para recuperar estado após reconnect. [VERIFIED: `.agents/skills/presence-safety/references/transitions.md`]
**Warning signs:** `presenterId` canônico não tem peer/track `live`, ou lease expira sem release. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

## Code Examples

Verified patterns from official sources:

### Canal Supabase Realtime privado
```typescript
// Source: https://supabase.com/docs/guides/realtime/broadcast
const channel = supabase.channel(
  `company:${companyId}:space:${spaceId}:media`,
  {
    config: {
      private: true,
      broadcast: { self: false, ack: true },
      presence: { key: `${appUserId}:${presenceSessionId}` },
    },
  },
);

channel
  .on('broadcast', { event: 'offer' }, ({ payload }) => {
    const parsed = signalingOfferSchema.safeParse(payload);
    if (parsed.success) void manager.handleDescription(parsed.data);
  })
  .subscribe();

// Cleanup: await supabase.removeChannel(channel)
```

### Fim de compartilhamento originado pelo browser
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
const displayTrack = displayStream.getVideoTracks()[0];
displayTrack.addEventListener('ended', () => {
  void stopScreenShare('browser-ended');
}, { once: true });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Criar offer manual após cada `addTrack()` | `onnegotiationneeded` + perfect negotiation com peer polite/impolite | Padrão documentado atual da MDN | Necessário para sobreviver a renegociações simultâneas de mic/tela. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation] |
| Canal Realtime público por nome de sala | Canal privado com RLS em `realtime.messages` e `realtime.topic()` | Recurso documentado atual do Supabase Realtime | Isola empresa/espaço para Broadcast e Presence, mas exige migration e readback. [CITED: https://supabase.com/docs/guides/realtime/authorization] |
| Estado de captura inferido só pelo clique | Evento `MediaStreamTrack.ended` + cleanup idempotente | API atual de Media Capture | Trata parada pelo controle nativo do browser. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia] |

**Deprecated/outdated:**
- “Offer manual sem collision protocol”: não é suficiente para esta fase; substituir pelo padrão de perfect negotiation completo, não por um guard isolado em `handleAnswer`. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`; CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
- “`room:audio:${spaceId}` público”: não atende o isolamento empresa/espaço exigido pela fase; substituir por tópico privado autorizado. [VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; CITED: https://supabase.com/docs/guides/realtime/authorization]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | Nenhuma. As recomendações de design são decisões prescritivas sustentadas por implementação atual, decisões do usuário e documentação citada. | — | — |

## Open Questions (RESOLVED)

1. **Realtime Authorization — resolvido como limite de rollout verificável.**
   - Estado conhecido: o repositório contém políticas privadas para Presence/Knock, mas o canal atual de áudio não é privado; nenhum alvo online foi consultado ou autorizado nesta pesquisa. [VERIFIED: `supabase/migrations/20260716175515_phase4_knock_delivery_and_retention.sql`; VERIFIED: `supabase/migrations/20260718204506_phase6_private_company_presence.sql`; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; VERIFIED: `CLAUDE.md`]
   - Restrição de planejamento: criar a migration de lease/policies, aplicá-la em Supabase/Postgres local descartável e ler de volta histórico, catálogo, grants, FORCE RLS e as quatro policies privadas antes do tracer. Essa prova local não autoriza nem descreve staging/produção.
   - Gate de rollout: antes de qualquer cliente privado depender de um banco online, uma decisão separada deve nomear o alvo e autorizar explicitamente backup/rollback/manutenção; o rollout é database-first, com aplicação e readback no mesmo alvo, smoke de duas identidades e só então deploy compatível. Sem esse gate, a fase permanece local-only. [CITED: https://supabase.com/docs/guides/realtime/authorization]

2. **TURN — resolvido como configuração preservada e gate de confiabilidade em rede real.**
   - Estado conhecido: o código mantém STUN e só inclui TURN quando `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME` e `NEXT_PUBLIC_TURN_CREDENTIAL` existem; esta pesquisa não verificou credenciais, operador nem travessia entre NATs. [VERIFIED: `src/lib/webrtc/ice-config.ts`]
   - Restrição de planejamento: preservar `getIceServers()` e as variáveis atuais sem criar fallback de transporte ou migrar para SFU, per D-02; automação cobre somente configuração/branching.
   - Gate de aceite: UAT real com duas identidades em redes distintas deve registrar apenas estado ICE/tipo de candidato redigido e comprovar relay quando necessário. TURN ausente ou não funcional bloqueia qualquer alegação ampla de confiabilidade fora de redes permissivas; não pode ser aceito silenciosamente. [VERIFIED: `src/lib/webrtc/WebRTCManager.ts`]

3. **Matriz de browsers — resolvida com baseline automatizado e UAT feature-detected.**
   - Baseline automatizado: Chromium é o projeto suportado para Playwright de UI/lifecycle; mídia injetada nessa suíte não prova picker, entrega P2P, TURN ou isolamento multiusuário real. [VERIFIED: `playwright.config.ts`]
   - Matriz manual acordada: UAT executa as versões desktop suportadas pela empresa de Chrome, Firefox e Safari, com aba/janela/tela inteira apenas onde cada browser/plataforma expõe a fonte. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
   - Disposição de incompatibilidade: feature detection deve desabilitar o CTA e exibir `Screen sharing isn’t supported in this browser. Use a current supported browser.` quando captura não existir; ausência de suporte não pode iniciar picker nem oferecer fallback falso. [VERIFIED: `.planning/phases/03-video-and-screen-sharing/03-UI-SPEC.md`]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next/Vitest/build | ✓ | v26.5.0 | — [VERIFIED: `node --version`] |
| npm | dependência direta Zod e comandos de teste | ✓ | 12.0.1 | — [VERIFIED: `npm --version`] |
| Next.js local | floor-plan/stage | ✓ | 16.2.10 | — [VERIFIED: `node_modules/.bin/next --version`] |
| Playwright local | testes UI simulados | ✓ | 1.61.1 | — [VERIFIED: `node_modules/.bin/playwright --version`] |
| Docker daemon | testes locais reais de RLS/lease | ✗ | client 29.6.1, daemon indisponível | iniciar Docker Desktop antes de `test:presence:db`. [VERIFIED: `docker info --format '{{.ServerVersion}}'`] |
| Supabase CLI global | reset/readback local | ✗ | — | usar CLI devDependency via scripts após Docker, ou MCP/CLI autorizada; não há binário global. [VERIFIED: command availability audit] |
| Browser binário no PATH | smoke manual direto | ✗ | — | Playwright local para teste automatizado; navegador corporativo instalado/perfil separado para UAT multiusuário. [VERIFIED: command availability audit] |
| TURN configurado | P2P fora de NAT permissivo | ? | — | não há fallback equivalente para confiabilidade; provisionar/validar TURN. [VERIFIED: `src/lib/webrtc/ice-config.ts`] |

**Missing dependencies with no fallback:** Docker daemon para a prova de RLS/claim concorrente e TURN funcional para alegação de conectividade confiável em redes restritivas. [VERIFIED: `docker info --format '{{.ServerVersion}}'`; VERIFIED: `src/lib/webrtc/ice-config.ts`]

**Missing dependencies with fallback:** Supabase CLI global e browser no PATH não bloqueiam os testes de unidade; Playwright local existe. [VERIFIED: command availability audit; VERIFIED: `node_modules/.bin/playwright --version`]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 executado nesta pesquisa; Testing Library; Playwright 1.61.1 local. [VERIFIED: focused test output; VERIFIED: `vitest.config.mts`; VERIFIED: `playwright.config.ts`] |
| Config file | `vitest.config.mts`, `vitest.presence-db.config.mts`, `playwright.config.ts`. [VERIFIED: repository files] |
| Quick run command | `npm test -- __tests__/audio-context.test.tsx __tests__/audio-signaling.test.tsx` (baseline: 2 files / 5 tests passed). [VERIFIED: focused test output] |
| Full suite command | `npm test`; para contrato real de Presence/banco, `npm run test:presence:db`; para browser, `npm run test:presence:e2e`. [VERIFIED: `package.json`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VID-01 | Perfect negotiation em add/remove screen, isolamento de tracks e cleanup por peer | unit | `npm test -- __tests__/webrtc-manager.test.ts` | ❌ Wave 0 |
| VID-01 | Canal privado só permite empresa/espaço correto para Broadcast e Presence | real DB/RLS | `npm run test:presence:db -- __tests__/presence-db/screen-share-realtime-policy.test.ts` | ❌ Wave 0 |
| VID-02 | Entrar listen-only, microfone só por gesto, mute e speaking continuam | unit/component | `npm test -- __tests__/audio-context.test.tsx __tests__/space-audio-controls.test.tsx` | ⚠️ somente provider existe; controle específico a confirmar/adicionar |
| VID-02 | Dois usuários em sala ouvem áudio sem mic automático | manual multi-user browser | não automatizável como prova suficiente com mocks | ❌ UAT obrigatório |
| VID-04 | `NotAllowedError`, cancelamento, conflito, `ended`, saída e troca de espaço restauram stage/layout | unit/component | `npm test -- __tests__/screen-share-context.test.tsx __tests__/floor-plan-presentation-stage.test.tsx` | ❌ Wave 0 |
| VID-04 | Dois claims concorrentes retornam exatamente um vencedor; TTL libera abandono | real DB/concurrency | `npm run test:presence:db -- __tests__/presence-db/screen-share-lease.test.ts` | ❌ Wave 0 |
| VID-04 | Uma tela real chega ao segundo usuário e desaparece em browser-ended/departure/space change | manual multi-user browser | UAT em duas identidades e duas redes quando possível | ❌ UAT obrigatório |

### Sampling Rate

- **Per task commit:** testes focados da unidade/componente afetada e `npm run type-check`. [VERIFIED: `CLAUDE.md`]
- **Per wave merge:** `npm test`, `npm run lint`, e suite DB/RLS se migration/rotas forem tocadas. [VERIFIED: `CLAUDE.md`; VERIFIED: `package.json`]
- **Phase gate:** build green, readback da migration/policies no alvo autorizado e UAT multiusuário real antes de alegar VID-01/VID-04. [VERIFIED: `CLAUDE.md`; VERIFIED: `.agents/skills/presence-safety/references/testing.md`]

### Wave 0 Gaps

- [ ] `__tests__/webrtc-manager.test.ts` — fake `RTCPeerConnection` para collision, ICE associado a offer ignorada, add/remove display sender e peer criado durante share. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
- [ ] `__tests__/screen-share-context.test.tsx` e `__tests__/floor-plan-presentation-stage.test.tsx` — permission denial, cancelamento, `track.ended`, conflito, restauro de layout e nenhum efeito em mic. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
- [ ] `__tests__/presence-db/screen-share-lease.test.ts` e policy test — Postgres real, RLS, session fence, company/space isolation, corrida repetida e expiração. [VERIFIED: `.agents/skills/presence-safety/references/testing.md`]
- [ ] Projeto/spec Playwright de mídia apenas para UI com media simulado; não usar esse mock como evidência de entrega WebRTC real. [VERIFIED: `playwright.config.ts`; VERIFIED: `CLAUDE.md`]
- [ ] UAT com duas identidades autenticadas em uma sala: listen-only, mic explícito, display real, conflito, cancelamento, browser-ended, presenter departure e troca de espaço. [VERIFIED: `.agents/skills/presence-safety/references/testing.md`]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Rota de claim/release usa identidade JWT verificada no server; não aceita app user ID escolhido pelo cliente. [VERIFIED: `CLAUDE.md`; VERIFIED: `src/app/api/presence/location/route.ts`] |
| V3 Session Management | yes | Fence por auth session e presence session no claim/renew/release; teardown no switch/logout/espaço. [VERIFIED: `.agents/skills/presence-safety/references/transitions.md`; VERIFIED: `src/app/api/presence/location/route.ts`] |
| V4 Access Control | yes | RPC bloqueia/revalida empresa, ocupação e espaço; RLS de `realtime.messages` limita `realtime.topic()` para Broadcast/Presence. [CITED: https://supabase.com/docs/guides/realtime/authorization; VERIFIED: `.agents/skills/presence-safety/references/access-capacity.md`] |
| V5 Input Validation | yes | Zod nos routes e listeners; allowlist de eventos, UUIDs, `targetUserId`, descrição SDP e ICE candidate antes de WebRTC. [VERIFIED: npm registry; CITED: https://zod.dev/] |
| V6 Cryptography | limited | Usar transporte WebRTC e TURN existentes; não criar criptografia, chave, assinatura ou “E2EE” caseira nesta fase. [VERIFIED: `CLAUDE.md`; VERIFIED: `src/lib/webrtc/ice-config.ts`] |

A referência OWASP consultada identifica ASVS 5.0.0 como versão estável; o mapeamento acima aplica seus domínios de autenticação, sessão, acesso e validação ao stack desta fase. [CITED: https://owasp.org/www-project-application-security-verification-standard/]

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Assinatura de tópico por usuário de outra empresa/espaço | Information Disclosure | Canal privado + policies `SELECT`/`INSERT` de Broadcast e Presence por `realtime.topic()`; readback real da policy. [CITED: https://supabase.com/docs/guides/realtime/authorization] |
| Cliente fora do espaço tenta assumir apresentação | Elevation of Privilege | Endpoint deriva identidade, RPC revalida lease/ocupação/empresa sob lock; cliente não é autoridade. [VERIFIED: `.agents/skills/presence-safety/references/access-capacity.md`; VERIFIED: `src/app/api/presence/location/route.ts`] |
| Payload SDP/ICE ou `presenter-start` malformado | Tampering | Zod/allowlist no listener, target ID obrigatório e ignorar mensagens de scope/generation velhos. [VERIFIED: npm registry; CITED: https://zod.dev/; VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`] |
| Dois claims simultâneos | Tampering / Denial of Service | Unique lease por espaço, transaction e resposta de conflito tipada; não usar precheck cliente. [VERIFIED: `.agents/skills/presence-safety/references/access-capacity.md`] |
| Canal anterior ainda processa callbacks após mover | Information Disclosure | `removeChannel`, cancelar callbacks com generation/ref e destruir peers/tracks antes de expor state novo. [VERIFIED: `src/hooks/realtime/useAudioSignaling.ts`; VERIFIED: `src/contexts/AudioContext.tsx`] |
| Campo de tela continua após browser encerrar | Denial of Service / Information Disclosure | `track.ended`, `onPeerDisconnected`, release idempotente e TTL do lease. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia; VERIFIED: `src/lib/webrtc/WebRTCManager.ts`] |

## Sources

### Primary (HIGH confidence)
- Implementação e testes atuais: `src/contexts/AudioContext.tsx`, `src/lib/webrtc/WebRTCManager.ts`, `src/hooks/realtime/useAudioSignaling.ts`, `src/components/floor-plan/floor-plan.tsx`, `__tests__/audio-context.test.tsx`, `__tests__/audio-signaling.test.tsx` — lifecycle existente, escopo, limitações e baseline testado. [VERIFIED: codebase]
- `CLAUDE.md` e `.agents/skills/presence-safety/` — invariantes obrigatórios de Presence, RLS, lifecycle e verificação. [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — canal, Broadcast, ACK e remoção. [CITED: https://supabase.com/docs/guides/realtime/broadcast]
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) — canal privado e políticas em `realtime.messages`. [CITED: https://supabase.com/docs/guides/realtime/authorization]
- [Supabase Realtime Presence](https://supabase.com/docs/guides/realtime/presence) — `track`, `presenceState`, sync e cleanup. [CITED: https://supabase.com/docs/guides/realtime/presence]
- [MDN Perfect negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) — renegociação e glare. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]
- [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) — gesto, erros e evento `ended`. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]
- [Supabase Changelog](https://supabase.com/changelog.md) — revisão de mudanças recentes; Broadcast binário de 2026-06-11 não é necessário para signaling JSON. [CITED: https://supabase.com/changelog.md]
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) — ASVS 5.0.0 e referência de domínios de segurança. [CITED: https://owasp.org/www-project-application-security-verification-standard/]

### Tertiary (LOW confidence)
- [Discussão WebRTC sobre screen share](https://groups.google.com/g/discuss-webrtc/c/Ky3wf_hg1l8) — confirmação externa não autoritativa de que adicionar track requer renegociação; não usada para definir metas de escala. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — APIs nativas e dependências instaladas foram verificadas no projeto/npm; não há SDK de mídia novo. [VERIFIED: codebase; VERIFIED: npm registry]
- Architecture: MEDIUM — extensão do manager e APIs oficiais foram verificadas, mas catálogo Realtime e TURN do alvo real permanecem desconhecidos. [VERIFIED: codebase; CITED: https://supabase.com/docs/guides/realtime/authorization]
- Pitfalls: HIGH — derivados da implementação atual e de comportamentos documentados de negociação/captura. [VERIFIED: codebase; CITED: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia]

**Database/deployment state:** Nenhuma mudança foi aplicada nesta pesquisa. O plano deve conter migration local para lease/policies, readback no alvo nomeado e autorização explícita antes de qualquer banco online; o aplicativo não pode depender do canal privado antes desse contrato existir. [VERIFIED: `CLAUDE.md`; CITED: https://supabase.com/docs/guides/realtime/authorization]

**Research date:** 2026-07-22
**Valid until:** 2026-07-29 — Supabase Realtime e compatibilidade de browser devem ser reconferidos antes da execução. [CITED: https://supabase.com/changelog.md]
