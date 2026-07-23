# Phase 3: Video and Screen Sharing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 03-video-and-screen-sharing
**Areas discussed:** Entrada e ciclo da reunião, Palco de vídeo e tela, Estratégia de transporte, Alinhamento de escopo

---

## Entrada e ciclo da reunião

### Relação entre espaço e reunião

| Option | Description | Selected |
|--------|-------------|----------|
| Sessão explícita | Alguém inicia e cada ocupante escolhe entrar | |
| Entrada automática | Entrar no espaço significa participar da conversa | ✓ |
| Modelo híbrido | Áudio ambiente e sessão avançada separados | |
| Você decide | Planejador escolhe conforme a base | |

**User's choice:** O próprio espaço representa a reunião; todos no espaço podem participar se tiverem acesso.
**Notes:** Espaços restritos devem reutilizar o controle de acesso e Knock existentes, sem criar um segundo conceito de reunião fechada.

### Estado inicial da mídia

| Option | Description | Selected |
|--------|-------------|----------|
| Ouvir ao entrar | Conecta para ouvir; microfone mudo e câmera desligada | ✓ |
| Áudio após clique | Não ouve até acionar o áudio | |
| Pré-entrada obrigatória | Exibe seleção de dispositivos antes de conectar | |
| Você decide | Planejador escolhe | |

**User's choice:** Ouvir ao entrar.
**Notes:** Mantém o comportamento espacial e a ativação explícita do microfone já existente.

### Controle e encerramento

| Option | Description | Selected |
|--------|-------------|----------|
| Sala persistente | Ninguém encerra para todos; a conversa acompanha a ocupação | ✓ |
| Primeiro ocupante é host | Primeira pessoa controla e encerra | |
| Controle por função | Admin ou responsável controla | |
| Você decide | Planejador escolhe | |

**User's choice:** Sala persistente.
**Notes:** Não introduzir anfitrião implícito.

### Mudança de espaço

| Option | Description | Selected |
|--------|-------------|----------|
| Redefinir mídia | Encerra a participação anterior e entra ouvindo no novo espaço | ✓ |
| Preservar mídia ativa | Mantém microfone/câmera ao trocar | |
| Confirmar antes de sair | Pede confirmação quando há transmissão ativa | |
| Você decide | Planejador escolhe | |

**User's choice:** Como ocorre hoje com o microfone: ao trocar de espaço, saiu da reunião anterior e precisa ativar novamente para falar.
**Notes:** Câmera e compartilhamento também não atravessam a mudança.

---

## Palco de vídeo e tela

### Layout sem apresentação

| Option | Description | Selected |
|--------|-------------|----------|
| Grade estável + fixar | Fala recebe indicador; pinagem é local e não causa saltos de layout | ✓ |
| Orador automático | Pessoa que fala assume o palco | |
| Palco controlado | Um apresentador escolhe o destaque global | |
| Você decide | Planejador escolhe | |

**User's choice:** Grade estável com fixação local.
**Notes:** Essa decisão só se aplica caso vídeo básico entre sem comprometer o núcleo da fase.

### Tela apresentada

| Option | Description | Selected |
|--------|-------------|----------|
| Tela no palco | Compartilhamento domina; rostos ficam em faixa secundária | ✓ |
| Tela como participante | Compartilhamento ocupa bloco igual na grade | |
| Painel separado | Conteúdo abre em painel ou janela distinta | |
| Você decide | Planejador escolhe | |

**User's choice:** Aprovou a recomendação de tela no palco após discutir infraestrutura pronta versus desenvolvimento próprio.
**Notes:** Cada pessoa pode mudar sua visualização local; ao terminar, a grade anterior retorna. O conteúdo apresentado é mais importante que os rostos.

### Concorrência de compartilhamento

| Option | Description | Selected |
|--------|-------------|----------|
| Uma tela por vez | Somente um apresentador ativo | ✓ |
| Substituição confirmada | Outra pessoa pode assumir após confirmação | |
| Várias telas simultâneas | Cada pessoa escolhe qual tela acompanhar | |
| Você decide | Planejador escolhe | |

**User's choice:** Uma tela por vez.

### Local do palco

| Option | Description | Selected |
|--------|-------------|----------|
| Palco integrado | Abre dentro do floor plan e pode expandir/recolher | ✓ |
| Overlay expansível | Cobre o floor plan enquanto ativo | |
| Janela separada | Abre rota ou janela independente | |
| Você decide | Planejador escolhe | |

**User's choice:** Palco integrado.
**Notes:** A apresentação deve continuar visualmente vinculada ao espaço.

---

## Estratégia de transporte

| Option | Description | Selected |
|--------|-------------|----------|
| Migrar para motor pronto | Substituir transporte por LiveKit/Daily/alternativa | |
| Incorporar reunião pronta | Usar interface prebuilt ou iframe | |
| Preservar WebRTC atual | Estender áudio e sinalização existentes para uma tela ativa | ✓ |

**User's choice:** Preservar o áudio atual; não descartar o trabalho feito nem assumir serviço pago antes da validação.
**Notes:** LiveKit foi reconhecido como possível evolução futura por oferecer SFU, adaptação e gravação. O servidor é open source, mas self-hosting ainda implica infraestrutura e banda. Não usar dois transportes paralelos para áudio e tela.

---

## Alinhamento de escopo

| Option | Description | Selected |
|--------|-------------|----------|
| Reduzir a Fase 3 | Áudio + tela são obrigatórios; vídeo é opcional; recursos avançados migram | ✓ |
| Dois estágios na Fase 3 | Demo primeiro, mas manter todos os requisitos na mesma fase | |
| Manter escopo completo | Nove vídeos, quadro, gravação, fundos, PiP e calendários agora | |

**User's choice:** Reduzir a Fase 3.
**Notes:** O objetivo imediato é demonstrar o produto à empresa. O roadmap e REQUIREMENTS.md ainda precisam ser atualizados para refletir a decisão antes do planejamento.

---

## Claude's Discretion

- Layout exato e responsividade do palco integrado.
- Tratamento técnico de renegociação das tracks.
- Inclusão de câmera básica somente após proteger áudio e compartilhamento.
- Mensagens e tentativas de recuperação para cancelamento, permissão negada e término inesperado.

## Deferred Ideas

- Grade obrigatória de nove câmeras.
- Migração para LiveKit ou outro SFU.
- Quadro branco.
- Gravação.
- Fundos virtuais e desfoque.
- Indicadores avançados de qualidade.
- Picture-in-picture.
- Google Calendar e Outlook.
- Múltiplos compartilhamentos simultâneos.
