# Phase 3 — Human Handoff

Atualizado em: 2026-07-24

Este documento é para o responsável humano conduzir o restante da Phase 3 sem depender do histórico desta conversa.

## 1. Estado atual

- Branch principal de trabalho: `feature/sharing-screen`
- Progresso: **3 de 13 planos concluídos**
- Próximo plano: `03-01`
- Próxima wave: **Wave 4**
- Compartilhamento de tela visível na aplicação: **ainda não**
- Banco online: **não consultado e não alterado**
- Deploy: **não realizado**

Planos concluídos:

1. `03-08` — lease/RPCs/policies de banco, aplicados e lidos de volta somente no Supabase local descartável.
2. `03-09` — contratos e rotas iniciais de claim, active e release.
3. `03-10` — fundação WebRTC para tracks de display e signaling privado direto pelo browser.

Commits finais relevantes:

- `271dbae` — lifecycle de media signaling.
- `f6fa091` — fences de instância de signaling.
- `e2ccab0` — fechamento do plano `03-10`.
- `1b62649` — unificação do slug de rotas de espaços em `[id]`.

Verificação mais recente:

- Testes completos: 1.147/1.147 passaram antes da correção de slug.
- Testes das rotas após a correção: 80/80 passaram.
- Typecheck: passou.
- Build: passou.
- Servidor dev: iniciou sem conflito de slug.

## 2. Regra principal de execução

Execute **uma wave por vez**. Não use `/gsd-execute-phase 3` sem `--wave`.

Ao iniciar uma nova sessão, use este prompt:

```text
Continue a Phase 3 na branch feature/sharing-screen.
Leia CLAUDE.md, .planning/STATE.md, .planning/ROADMAP.md,
.planning/phases/03-video-and-screen-sharing/03-HUMAN-HANDOFF.md
e 03-TRACKER.md.
Execute somente a wave indicada por mim.
Não amplie escopo, não redesenhe arquitetura e não crie trabalho adicional
por recomendação de revisor sem antes parar e pedir minha decisão.
Não altere banco online, não faça deploy, push ou PR.
Reporte Application, Database e Deployment separadamente.
```

Depois invoque somente a wave desejada, conforme a lista abaixo.

## 3. Ordem obrigatória de execução

### Passo 1 — Wave 4 / Plano 03-01

Comando:

```text
/gsd-execute-phase 3 --wave 4
```

Objetivo:

- conectar e rastrear o caminho entre captura de tela, presenter canônico, WebRTC e futuro palco;
- criar o tracer de produção previsto pelo plano;
- preservar a fundação WebRTC já concluída.

Resultado esperado:

- caminho técnico rastreável e testável;
- ainda pode não existir interface final visível.

Ao terminar:

- conferir o summary do `03-01`;
- exigir testes do plano;
- parar antes da Wave 5.

---

### Passo 2 — Wave 5 / Planos 03-02 e 03-03

Comando:

```text
/gsd-execute-phase 3 --wave 5
```

Objetivo de `03-02`:

- provar concorrência da lease no Postgres local;
- provar policies do canal privado no Supabase local;
- validar as duas migrations existentes.

Objetivo de `03-03`:

- cobrir glare/perfect negotiation;
- cobrir ICE, reconnect e teardown por troca de espaço;
- completar os casos difíceis do signaling.

Limite de escopo:

- não introduzir relay server-side, connection registry, negotiation registry ou terceira migration sem autorização humana explícita;
- revisores podem apontar riscos, mas não podem transformar findings em redesenho automaticamente.

Banco permitido:

- somente Supabase local descartável;
- nenhum SQL, migration push ou consulta em staging/produção.

Ao terminar:

- conferir evidência real do Postgres local;
- conferir que nenhuma migration nova foi criada sem autorização;
- parar antes da Wave 6.

---

### Passo 3 — Wave 6 / Plano 03-04

Comando:

```text
/gsd-execute-phase 3 --wave 6
```

Objetivo:

- completar o lifecycle HTTP autenticado;
- adicionar renew da lease;
- fechar claim, renew, release e active.

Atenção:

- todas as rotas devem permanecer sob `src/app/api/spaces/[id]/screen-share/`;
- não recriar uma pasta `[spaceId]`, pois isso quebra o Next.js com slugs dinâmicos conflitantes.

Resultado esperado:

- API completa para sustentar uma sessão de compartilhamento;
- ainda pode não existir botão ou palco final.

Ao terminar:

- testar claim/renew/release/active;
- parar antes da Wave 7.

---

### Passo 4 — Wave 7 / Plano 03-11

Comando:

```text
/gsd-execute-phase 3 --wave 7
```

Objetivo:

- implementar o provider real de compartilhamento;
- chamar `navigator.mediaDevices.getDisplayMedia()`;
- adquirir e renovar a lease;
- adicionar a track de display ao `WebRTCManager`;
- encerrar track e lease de forma idempotente;
- tratar cancelamento, permissão negada, browser-ended, troca de espaço e presenter departure.

Resultado esperado:

- captura e transmissão devem existir funcionalmente;
- a apresentação visual final ainda pertence à próxima wave.

Ao terminar:

- validar que microfone continua funcionando ao iniciar/parar display;
- validar cleanup em todos os caminhos;
- parar antes da Wave 8.

---

### Passo 5 — Wave 8 / Plano 03-05

Comando:

```text
/gsd-execute-phase 3 --wave 8
```

Objetivo:

- adicionar botão **Compartilhar tela**;
- adicionar palco integrado ao floor plan;
- renderizar o vídeo remoto;
- permitir expandir/recolher;
- mostrar estados vazio, carregando, erro e presenter ativo;
- garantir layout responsivo e acessível.

Resultado esperado:

> **Esta é a wave em que o compartilhamento deve finalmente ficar visível na aplicação.**

Checkpoint humano obrigatório após esta wave:

1. abrir a aplicação;
2. entrar com dois usuários/contextos;
3. iniciar compartilhamento em um deles;
4. confirmar que o outro vê o palco;
5. expandir e recolher;
6. encerrar pelo botão e pelo controle nativo do navegador;
7. confirmar que o áudio permanece funcionando.

Não avançar se a interface não estiver visível e utilizável.

---

### Passo 6 — Wave 9 / Plano 03-06

Comando:

```text
/gsd-execute-phase 3 --wave 9
```

Objetivo:

- automatizar os principais fluxos com dois contextos Chromium;
- verificar lifecycle e UI no navegador.

Resultado esperado:

- testes Playwright para os fluxos críticos;
- falha real não pode ser substituída por mock ou skip.

Ao terminar:

- conferir artefatos e screenshots;
- parar antes da Wave 10.

---

### Passo 7 — Wave 10 / Plano 03-07

Comando:

```text
/gsd-execute-phase 3 --wave 10
```

Objetivo:

- executar os reviewer gates previstos no plano.

Regra de custo e autoridade:

- findings devem ser apresentados ao responsável humano;
- nenhum finding pode gerar migration, arquitetura nova ou pacote extenso automaticamente;
- qualquer correção fora do escopo direto precisa de autorização humana;
- não repetir reviews indefinidamente até ficarem sem findings.

Checkpoint humano:

- decidir quais findings bloqueiam e quais são aceitos/deferidos.

---

### Passo 8 — Wave 11 / Plano 03-12

Comando:

```text
/gsd-execute-phase 3 --wave 11
```

Objetivo:

- executar gates finais com diff estável;
- testes focados;
- suíte completa;
- typecheck;
- build;
- checks locais de banco e navegador previstos no plano.

Resultado esperado:

- evidência final sem alterar o escopo do produto.

Ao terminar:

- parar antes da Wave 12.

---

### Passo 9 — Wave 13 / Plano 03-13

Comando:

```text
/gsd-execute-phase 3 --wave 13
```

Objetivo:

- executar apenas os checks locais focados já disponíveis;
- registrar que TURN, dispositivos extras, redes extras e matriz de browsers não são requisitos;
- registrar a decisão local-only/no-spend sem qualquer operação online.

Não existe checkpoint humano de infraestrutura. Nenhuma compra, credencial, dispositivo, rede, perfil ou instalação de browser pode ser exigida para concluir o plano.

## 4. Smoke manual opcional do produto final

Esta lista é opcional e pode ser usada somente com o equipamento, navegador e contas já disponíveis. Ela não bloqueia a fase.

A Phase 3 só está funcionalmente concluída quando for possível confirmar:

- [ ] Usuário entra no espaço e ouve os ocupantes.
- [ ] Microfone é ativado explicitamente.
- [ ] Existe botão visível para compartilhar tela.
- [ ] Usuário escolhe janela, aba ou tela.
- [ ] Apenas um presenter compartilha por espaço.
- [ ] Outro ocupante vê a tela no palco integrado.
- [ ] Cada viewer pode expandir e recolher o palco.
- [ ] Parar o compartilhamento restaura o layout estável.
- [ ] Encerrar pelo controle nativo do navegador também limpa o estado.
- [ ] Troca de espaço remove mídia anterior.
- [ ] Presenter departure não quebra o áudio da sala.
- [ ] Permissão negada ou cancelamento não deixa estado preso.
- [ ] Se houver duas sessões já disponíveis sem custo, o fluxo básico pode ser observado; caso contrário, registrar “não testado” sem bloquear.

## 5. Banco e rollout

Migrations existentes exigidas:

1. `20260723104902_screen_share_lease_and_media_realtime.sql`
2. `20260723224547_screen_share_atomic_presenter_contract.sql`

Estado atual:

- escritas no repositório;
- aplicadas e lidas de volta somente no Supabase local descartável;
- não aplicadas ou verificadas em nenhum banco online nesta execução.

Antes de qualquer deploy futuro:

1. nomear o target exato;
2. obter autorização humana explícita para esse target;
3. criar backup/rollback apropriado;
4. aplicar as duas migrations;
5. ler de volta migration history, funções, grants e policies no mesmo target;
6. executar smoke check;
7. somente então implantar a aplicação compatível.

Uma migration no repositório não significa migration aplicada online.

## 6. Limites para controlar custo

- Executar apenas uma wave por sessão.
- Não iniciar a próxima wave automaticamente.
- Não usar workflows ou fan-out de agentes sem autorização.
- Não abrir trabalho de segurança/arquitetura fora do plano.
- Não repetir reviews indefinidamente.
- Não rodar suíte completa após cada pequena edição; usar testes focados durante implementação e suíte completa no gate apropriado.
- Se um finding exigir mudança grande, parar e apresentar: impacto, custo aproximado e alternativas.
- Se um agente cair, não reiniciar automaticamente sem informar o humano.
- Reportar imediatamente commits, testes, blockers e processos ainda ativos.

## 7. Worktree antigo

Existe um diretório transitório:

```text
.claude/worktrees/agent-a11fe56b1e0b18130
```

Ele contém trabalho abandonado do desenho de trusted relay, inclusive uma migration incompleta não rastreada naquele worktree.

Regras:

- não adicionar `.claude/worktrees/` ao Git;
- não mesclar o commit `5b87c96` de trusted relay;
- não copiar a migration incompleta para a branch principal;
- remover o worktree somente após o responsável humano decidir que não precisa preservar esse histórico.

## 8. Próxima ação exata

Executar somente:

```text
/gsd-execute-phase 3 --wave 13
```

O plano deve encerrar com evidência local e estado local-only. Não autorizar nem iniciar rollout online.
