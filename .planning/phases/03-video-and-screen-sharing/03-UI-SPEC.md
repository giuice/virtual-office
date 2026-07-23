---
phase: 03
slug: video-and-screen-sharing
status: approved
shadcn_initialized: true
preset: new-york / neutral / CSS variables
created: 2026-07-22
reviewed_at: 2026-07-22
---

# Fase 03 — Contrato de design de UI

> Contrato visual e de interação para áudio espacial e compartilhamento de tela no floor plan. O floor plan continua sendo o contexto primário; esta fase não cria uma experiência paralela de Zoom/Meet.

---

## Design System

| Propriedade | Valor |
|-------------|-------|
| Tool | shadcn/ui existente |
| Preset | `new-york`, `neutral`, CSS variables — `components.json` |
| Biblioteca de componentes | Radix via shadcn/ui |
| Biblioteca de ícones | Lucide |
| Fontes | `DM Sans` (interface) e `Manrope` (títulos/display) |

**Contrato de reutilização.** Reutilizar `Button`, `Tooltip`, `Card`, `Skeleton` e os tokens `--vo-*` já instalados. Reutilizar `SpaceAudioControls` sem mudar sua semântica de microfone explícito, `FloorPlanToolbar` como ponto de entrada e `SpaceDetailPanel` como superfície secundária da sala. Não introduzir registry, bloco de dashboard, kit de videoconferência nem novo sistema de tokens.

---

## Escala de espaçamento

Valores declarados (múltiplos de 4):

| Token | Valor | Uso nesta fase |
|-------|-------|----------------|
| xs | 4px | Distância entre ícone e status; separador visual curto |
| sm | 8px | Gaps de controles, metadados e pills |
| md | 16px | Padding padrão do stage, separação entre stage e floor plan |
| lg | 24px | Padding de seção e cabeçalho do stage em desktop |
| xl | 32px | Separação entre blocos maiores dentro do card do floor plan |
| 2xl | 48px | Respiro após um stage expandido antes de conteúdo não relacionado |
| 3xl | 64px | Nunca necessário dentro do stage; reservado ao layout de página existente |

**Exceções:** controles somente por ícone mantêm `36px` no mouse, igual a `SpaceAudioControls`; em `pointer: coarse`, todo controle acionável tem área mínima de `44 × 44px`. O rail colapsado da apresentação tem altura mínima de `48px` (`52px` em viewport menor que `768px`).

---

## Tipografia

Apenas as novas superfícies da fase usam as quatro escalas abaixo; não normalizar retroativamente tipografia existente do floor plan.

| Papel | Tamanho | Peso | Altura de linha |
|------|---------|------|-----------------|
| Corpo / mensagem de estado | 14px | 400 | 1.5 |
| Label, metadata, tooltip | 12px | 700 | 1.33 |
| Heading do stage e nome do apresentador | 16px | 700 | 1.2 |
| Display de estado principal | 20px | 700 | 1.2 |

Usar `DM Sans` para corpo e controles; usar `Manrope` somente para heading/display. Os únicos pesos novos permitidos são 400 e 700. Nomes de sala e apresentador usam uma linha com `min-w-0` e ellipsis; a identidade completa permanece disponível em `title`/nome acessível.

---

## Cor

Aplicar a proporção por superfície usando tokens que se adaptam a todos os temas existentes, nunca hex fixo novo.

| Papel | Valor | Uso |
|------|-------|-----|
| Dominante (60%) | `--vo-bg` / `--vo-surface` | Canvas do floor plan e fundo da área de mídia |
| Secundária (30%) | `--vo-card-solid`, `--vo-bg-2`, `--vo-line` | Card do stage, rail colapsado, cabeçalho e contêineres de controle |
| Accent (10%) | `--vo-cyan` e `--vo-cyan-soft` | CTA disponível de compartilhar, foco, estado selecionado e controle de microfone explicitamente ativo |
| Estado de apresentação | `--vo-mag` e `--vo-mag-soft` | Selo “LIVE”, anel/borda do apresentador e identificação de conteúdo ao vivo; não substitui o accent global |
| Destrutiva / erro | `--vo-err` | Alertas de falha, ícone de erro e bordas de erro; não usar como cor padrão de ação |

Accent reservado para: botão **Share screen** quando disponível, foco visível, estado selecionado de expandir/colapsar e microfone explicitamente ligado. `--vo-mag` é reservado ao sinal de apresentação ao vivo. Não aplicar cyan ou magenta a todos os botões, cards ou textos.

---

## Inventário de superfícies e layout

### Ponto de entrada e estado sem apresentação

1. O usuário que ocupa a sala vê **Share screen** no grupo de controles da sala, ao lado de `SpaceAudioControls` no `FloorPlanToolbar`; o `SpaceDetailPanel` repete o mesmo controle dentro da seção **Audio & presentation** quando aberto. As duas instâncias consomem o mesmo estado; nunca exibem estados contraditórios.
2. Sem apresentação ativa, não renderizar um card vazio persistente nem reduzir a área do floor plan. O floor plan permanece exatamente no layout estável atual. O status acessível do controle informa **No one is sharing a screen**.
3. O controle só é mostrado/habilitado para quem ocupa a sala autoritativa atual. Fora de uma sala, ele não é renderizado. A UI não concede entrada, ocupação ou direito de apresentar: apenas reflete o resultado canônico de lease/ocupação.
4. Camera/video básico não recebe controle, espaço reservado ou critério de aceite nesta fase. Se vier a existir em trabalho posterior, fica em uma faixa secundária e nunca compete com a tela compartilhada.

### Stage integrado

1. Quando há apresentação ativa, renderizar `FloorPlanPresentationStage` **dentro do `Card` principal do floor plan, antes de `ModernFloorPlan`**, separado por `16px`. Não navegar, não abrir modal e não substituir a página.
2. Cabeçalho do stage: selo magenta **LIVE**, heading **Presentation**, avatar existente do apresentador, texto **{Name} is sharing their screen**, e botão local **Collapse presentation**. O apresentador também vê **Stop sharing** com rótulo textual.
3. Em modo expandido, o vídeo ocupa a região principal em `aspect-ratio: 16 / 9`, com fundo `--vo-bg-2`, borda `--vo-line`, raio `14px`, largura de 100% e altura máxima de `540px`. Não adicionar controles nativos, chat, grade de rostos, gravação, PiP ou fullscreen.
4. Ao receber uma apresentação, cada viewer inicia em modo expandido. **Collapse presentation** troca somente a preferência local daquele viewer para um rail de `48px`; não envia Broadcast, não grava no banco e não afeta o apresentador. Enquanto a mesma apresentação estiver ativa, uma escolha manual do viewer é preservada.
5. O rail colapsado mostra selo LIVE, **{Name} is presenting**, botão **Expand presentation** e, para o apresentador, **Stop sharing**. Ao encerrar, falhar, o apresentador sair ou o viewer mudar de sala, desmontar completamente o stage/rail e devolver o card ao layout pré-apresentação, sem espaço reservado ou frame congelado.
6. Enquanto a track remota está conectando, manter o mesmo retângulo 16:9 e exibir `Skeleton`/spinner sem deslocamento de layout e a mensagem **Connecting to {Name}'s screen…**. Se não houver track viva do apresentador canônico, não exibir conteúdo de outro peer.

### Responsividade

| Largura | Contrato |
|---------|----------|
| `>= 1280px` | Stage expandido limitado a `960px` de largura e `540px` de altura; fica acima da grade, que conserva largura total abaixo. Cabeçalho em uma linha. |
| `768–1279px` | Stage usa largura disponível do card, mantém 16:9 e altura máxima de `50vh`; cabeçalho pode quebrar em duas linhas, preservando ações. |
| `< 768px` | Não criar padrão novo de bottom sheet ou gesto. Stage ocupa 100% da largura disponível, mínimo de `180px`, máximo de `44vh`; padding `16px`; rail de `52px`. Ações têm `44px` de alvo; **Share screen** pode ficar só com ícone, mas exige `aria-label="Share screen"` e tooltip. |

Nunca permitir overflow horizontal da página. Nome/texto longo trunca no cabeçalho; mensagens de erro quebram por palavra dentro do card. A área do vídeo não pode criar scroll horizontal.

---

## Contrato de interação e estados

### Iniciar e encerrar

| Situação | Controle e feedback exigidos |
|----------|------------------------------|
| Pronto para iniciar | `Button` outline com ícone `MonitorUp` e texto **Share screen**; tooltip **Share your screen**. Clique chama o picker nativo diretamente no gesto do usuário. |
| Picker aberto | Desabilitar somente a instância local; texto/estado acessível **Opening screen picker…**. Não solicitar microfone, não alterar `isMuted` e usar `getDisplayMedia({ video: true, audio: false })`. |
| Captura obtida / claim em curso | Manter o controle indisponível com **Starting screen share…** até a confirmação canônica. Apenas o vencedor anexa/publica a track. |
| Apresentação própria ativa | Substituir por **Stop sharing** com ícone `MonitorOff`. Clique encerra imediatamente a track e libera o lease de forma idempotente; não abrir confirmação. |
| Outro apresentador ativo | Não iniciar segundo picker por precheck visual. Mostrar estado indisponível com tooltip **{Name} is sharing their screen**; o backend continua sendo a exclusão mútua. |
| Encerramento bem-sucedido | Restaurar layout; anunciar **Screen sharing ended. Floor plan restored.** sem toast persistente. |

**Ações destrutivas.** Não há exclusão de dados nesta fase. **Stop sharing** encerra transmissão efêmera, é explícita e imediatamente reversível por um novo compartilhamento; portanto não requer diálogo de confirmação nem usa `AlertDialog`.

### Falhas, saída e recuperação

| Evento | Apresentação visual e copy |
|--------|----------------------------|
| Browser sem `getDisplayMedia` | Botão desabilitado, ícone `AlertCircle`, tooltip e mensagem inline: **Screen sharing isn’t supported in this browser. Use a current supported browser.** Não oferecer falso fallback. |
| Permissão negada | Alert inline não modal, `role="alert"`: **We couldn’t start screen sharing. Check your browser permission, then try again.** Restaurar **Share screen**. |
| Picker cancelado pelo usuário | Status discreto, `aria-live="polite"`: **Screen sharing was cancelled.** Restaurar **Share screen**; não marcar como erro destrutivo. |
| Nenhuma fonte/display disponível | Alert inline: **No screen is available to share. Connect a display or choose another source, then try again.** |
| Conflito após o picker | Parar a track local antes de renderizar UI; alert inline: **{Name} is already sharing their screen. Wait for them to stop, then try again.** Restaurar o botão. |
| Erro de captura, claim ou negociação | Alert inline: **We couldn’t start screen sharing. Try again. If the problem continues, rejoin the space.** O botão volta ao estado pronto; microfone e áudio remoto preservam o estado anterior. |
| Track encerrada pelo browser | Desmontar stage e liberar lease; status: **Screen sharing ended in your browser. Floor plan restored.** |
| Apresentador sai, desconecta ou lease expira | Viewers desmontam stage e recebem: **{Name} left the space. Screen sharing ended.** Nunca manter último frame. |
| Viewer muda de sala | Teardown imediato do stage e mídia da sala antiga; status: **You left {Old space}. Its presentation is no longer available.** A nova sala entra em listen-only; não reativa mic, camera ou compartilhamento. |
| Apresentador muda de sala | Encerrar compartilhamento antes/durante teardown; a nova sala não herda share, mic ou estado expandido. |
| Track remota indisponível apesar de presenter ativo | Preservar retângulo 16:9 com erro: **Presentation unavailable. Ask {Name} to stop and share again.** Não mostrar vídeo de outro peer. |

Não há retry automático para picker, permissão ou conflito. **Try again** sempre é uma ação explícita que reinicia o fluxo a partir de gesto do usuário. Eventos de signalling são input não confiável: a UI só mostra apresentador/estágio alinhado ao lease canônico e ao escopo da sala atual.

---

## Acessibilidade, foco e teclado

1. Usar elementos nativos: `button` para iniciar, parar, expandir e colapsar; `section` com heading para o stage; `<video autoPlay playsInline>` para a track remota. O vídeo sem controles não entra na ordem de tabulação; o nome acessível do stage é **Screen shared by {Name}**.
2. Todos os controles somente por ícone têm `aria-label` e `Tooltip`. Foco visível é contorno de `2px` em `--ring`, com offset de `2px`, preservando o padrão existente; não remover outline sem substituto.
3. **Tab/Shift+Tab** percorrem os controles em ordem visual: áudio, compartilhar, expandir/colapsar e parar. `Enter` e `Space` acionam cada botão. Não criar atalho global `S`; ele poderia disparar capture acidentalmente ou conflitar com campos. Manter o atalho existente `M` exclusivamente para microfone e ignorá-lo ao digitar.
4. O botão expandir/colapsar expõe `aria-expanded` e `aria-controls` apontando para a região do vídeo. `Escape` apenas colapsa stage expandido; nunca encerra a apresentação. Após `Escape`, foco retorna a **Expand presentation**. Ao parar por botão, o foco retorna a **Share screen**; finais remotos não roubam foco do viewer.
5. Mensagens de progresso, cancelamento e término usam uma única região `aria-live="polite"` próxima ao controle; falhas que exigem ação usam `role="alert"`. Não depender apenas de cor ou animação para LIVE, speaking, erro ou apresentação.
6. Aplicar `prefers-reduced-motion`: expansão/colapso e entrada/saída usam no máximo opacidade/transform em 150–200ms; com redução de movimento, trocar imediatamente. Não piscar o vídeo, não animar continuamente o status LIVE e não mover o foco automaticamente em mobile.
7. Se uma ação ficar dentro de card clicável, marcar com `data-space-action` ou `data-avatar-interactive`, parar propagação de pointer/click/keyboard e garantir que o handler do card ignore descendentes interativos. Conteúdo de tooltip/popover em portal também interrompe propagação.

---

## Contrato de copywriting

A interface do produto permanece em inglês, conforme escopo atual; esta especificação está em português, mas as strings abaixo são copy literal de UI.

| Elemento | Copy |
|----------|------|
| CTA primário | **Share screen** |
| CTA durante início | **Opening screen picker…**; depois **Starting screen share…** |
| CTA de encerramento | **Stop sharing** |
| Estado vazio acessível | **No one is sharing a screen** |
| Estado de carregamento | **Connecting to {Name}'s screen…** |
| Cabeçalho populated | **Presentation**; **{Name} is sharing their screen** |
| Estado de erro | **We couldn’t start screen sharing. Try again. If the problem continues, rejoin the space.** |
| Confirmação destrutiva | Não aplicável — **Stop sharing** termina mídia efêmera sem confirmação |

As mensagens específicas de permissão, cancelamento, conflito, fim pelo browser, saída do apresentador e troca de sala são literais na tabela de falhas acima. Não usar “meeting”, “call”, “host”, “end for everyone” ou copy que sugira uma sessão paralela.

---

## Considerações de UI

> Cobertura gerada pelo UI-consideration probe após a aprovação das seis dimensões. A copy literal continua definida em **Contrato de copywriting** e nas tabelas de interação; estas linhas fixam o comportamento observável que o planner deve elevar a `must_haves.truths`.

Estados aplicáveis resolvidos: 13 cobertos, 0 backstop, 0 não resolvidos.

| Categoria | Elemento(s) | Status | Resolução / razão |
|-----------|-------------|--------|-------------------|
| long-text | E1 — controles de compartilhamento | ✅ coberto | Labels dos controles usam as strings fixas do contrato; abaixo de `768px`, **Share screen** pode virar ícone com `aria-label` e tooltip, sem criar overflow horizontal. |
| empty | E2 — stage de mídia | ✅ coberto | Sem lease canônico ativo, stage e rail não são renderizados; o floor plan mantém toda a área e o controle referencia o empty state documentado. |
| loading | E2 — stage de mídia | ✅ coberto | Enquanto a track remota conecta, o stage preserva o retângulo `16:9`, mostra `Skeleton` e usa o loading state documentado sem layout shift. |
| error | E2 — stage de mídia | ✅ coberto | Falha ou track indisponível mostra o error state documentado, nunca um frame antigo ou mídia de outro peer, preserva o áudio e oferece o caminho de recuperação definido. |
| populated | E2 — stage de mídia | ✅ coberto | O estado normal mostra somente a track viva do apresentador canônico em `16:9`, com identidade, status LIVE e ações permitidas ao viewer/presenter. |
| loading | E3 — rail colapsado | ✅ coberto | Se o viewer colapsar durante a conexão, o rail mantém identidade e LIVE, mostra o status curto de conexão e não reserva uma segunda área de mídia. |
| error | E3 — rail colapsado | ✅ coberto | Se a track ficar indisponível enquanto o lease permanece ativo, o rail mostra **Presentation unavailable** e a ação de expandir revela o error state e sua recuperação. |
| overflow | E3 — rail colapsado | ✅ coberto | O rail usa `min-w-0`, ellipsis no nome e ações com alvo mínimo de `44px`; controles podem envolver linha sem causar scroll horizontal. |
| long-text | E3 — rail colapsado | ✅ coberto | Nome longo trunca visualmente, preserva o nome acessível completo e não comprime os controles de expandir ou parar. |
| overflow | E4 — status e alerts | ✅ coberto | Status e alerts quebram por palavra dentro do card, permanecem na largura disponível e nunca criam overflow horizontal. |
| long-text | E4 — status e alerts | ✅ coberto | Mensagens extensas seguem o line-height de corpo, fazem wrap e mantêm problema mais próximo passo de recuperação legíveis. |
| overflow | E5 — cabeçalho da apresentação | ✅ coberto | O cabeçalho usa `min-w-0`; metadata trunca e ações podem quebrar para uma segunda linha nos breakpoints definidos sem sobrepor o vídeo. |
| long-text | E5 — cabeçalho da apresentação | ✅ coberto | Nome longo usa ellipsis em uma linha, mantém identidade completa no nome acessível e preserva LIVE, avatar e controles locais. |

---

## Segurança de registry

| Registry | Blocos usados nesta fase | Safety Gate |
|----------|--------------------------|-------------|
| shadcn official | Reuso local de `Button`, `Tooltip`, `Card`, `Skeleton` | não exigido — componentes já instalados; `components.json` verificado em 2026-07-22 |
| Terceiros | nenhum | não aplicável — nenhum registry ou bloco declarado em 2026-07-22 |

---

## Limites de implementação que a UI deve preservar

- Entrar em uma sala é listen-only: compartilhar tela nunca solicita microfone, nunca chama `getUserMedia`, nunca altera mute e não substitui áudio remoto.
- O presenter é único por sala, mas não é host de reunião: a UI não oferece encerrar áudio ou apresentação de outra pessoa.
- Troca de sala, perda de identidade/empresa ou teardown remove controles e callbacks da sala anterior antes de refletir a nova sala.
- O browser é dono do picker e das permissões. Não criar modal que simule escolha de janela/aba/tela, não persistir autorização e não prometer suporte onde o feature detection falhar.
- Preferência expandido/colapsado é local por viewer e efêmera; presenter, share, ocupação e acesso não são estados que a UI possa autorizar por Broadcast/Presence.

---

## Checker Sign-Off

- [x] Dimensão 1 Copywriting: PASS
- [x] Dimensão 2 Visuais: PASS
- [x] Dimensão 3 Cor: PASS
- [x] Dimensão 4 Tipografia: PASS
- [x] Dimensão 5 Espaçamento: PASS
- [x] Dimensão 6 Segurança de registry: PASS

**Aprovação:** approved 2026-07-22
