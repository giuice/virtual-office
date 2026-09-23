---
status: testing
phase: 03-video-and-screen-sharing
source: [03-VERIFICATION.md]
started: 2026-08-01T14:08:59.449Z
updated: 2026-08-25T20:28:07.9062502-03:00
---

## Current Test

number: 4
name: Controles de mídia disponíveis
expected: |
  Na área "Audio & presentation", devem existir somente os controles de microfone e compartilhamento de tela. Não deve existir controle para gravar, salvar, transcrever ou publicar mídia. Também não deve existir controle global para desligar a mídia de outro usuário. Isso corresponde ao que você viu?
awaiting: user response

## Tests

### 1. Áudio e tela P2P reais
expected: Use duas identidades reais na mesma sala. Inicie áudio e uma tela. Remova uma invalidação Realtime e confirme que o áudio continua, somente uma tela aparece e o palco some após stop, saída ou expiração.
result: issue
reported: |
  Obs. eu nao consigo simular o share screen nesse computador mesmo abrindo dois  broswer diferentes com dois ususarios diferentes quando tento compartilhar a tela nada acontece.
  O audio permaneceu, a tela do browser aparece selecionar janela, aba etc..., mas quando eu nao cancelo, e tenta compartilhar vejo alguma coisa aparecendo no meio da tela muito rapido e nada acontece. me pare a barra de parar compartilhamente aparece por decimos de segundo.
severity: major

### 2. Permissões nativas e cancelamento
expected: Entre em uma sala e mantenha o áudio ativo. Clique em "Share screen". Quando o navegador mostrar as opções, clique em "Cancelar". O seletor deve fechar. Nenhum palco ou botão "Stop sharing" deve permanecer. O áudio deve continuar.
result: pass

### 3. Fechamento da aba do presenter
expected: Feche ou recarregue a aba do presenter com um espectador conectado. Confirme que o espectador mantém o áudio e perde o palco após a confirmação autoritativa.
result: pass

### 4. Proibições de mídia
expected: Confirme que o fluxo não grava, persiste, transcreve ou republica a mídia e não oferece controle global de host.
result: [pending]

### 5. Contrato do banco antes do rollout
expected: No alvo explicitamente autorizado, aplique e leia as migrations de screen share antes da aplicação. Confirme RPCs, grants, RLS e políticas privadas compatíveis.
result: [pending]

## Summary

total: 5
passed: 2
issues: 1
pending: 2
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "Duas identidades reais na mesma sala conseguem iniciar áudio e uma tela; o áudio continua, somente uma tela aparece e o palco some após parar, sair ou expirar."
  status: failed
  reason: |
    User reported: Obs. eu nao consigo simular o share screen nesse computador mesmo abrindo dois  broswer diferentes com dois ususarios diferentes quando tento compartilhar a tela nada acontece.
    Additional detail: O audio permaneceu, a tela do browser aparece selecionar janela, aba etc..., mas quando eu nao cancelo, e tenta compartilhar vejo alguma coisa aparecendo no meio da tela muito rapido e nada acontece. me pare a barra de parar compartilhamente aparece por decimos de segundo.
  severity: major
  test: 1
  artifacts: []
  missing: []
