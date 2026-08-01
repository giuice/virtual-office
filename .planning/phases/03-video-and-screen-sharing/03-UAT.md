---
status: testing
phase: 03-video-and-screen-sharing
source: [03-VERIFICATION.md]
started: 2026-08-01T14:08:59.449Z
updated: 2026-08-01T14:08:59.449Z
---

## Current Test

number: 1
name: Áudio e tela P2P reais
expected: |
  O áudio continua. Somente uma tela aparece. O palco some depois de stop, saída ou expiração.
awaiting: user response

## Tests

### 1. Áudio e tela P2P reais
expected: Use duas identidades reais na mesma sala. Inicie áudio e uma tela. Remova uma invalidação Realtime e confirme que o áudio continua, somente uma tela aparece e o palco some após stop, saída ou expiração.
result: [pending]

### 2. Permissões nativas e cancelamento
expected: Ative microfone e tela somente pelos controles. Negue e cancele os prompts. Confirme que não há captura antes do clique e que a UI preserva o áudio existente.
result: [pending]

### 3. Fechamento da aba do presenter
expected: Feche ou recarregue a aba do presenter com um espectador conectado. Confirme que o espectador mantém o áudio e perde o palco após a confirmação autoritativa.
result: [pending]

### 4. Proibições de mídia
expected: Confirme que o fluxo não grava, persiste, transcreve ou republica a mídia e não oferece controle global de host.
result: [pending]

### 5. Contrato do banco antes do rollout
expected: No alvo explicitamente autorizado, aplique e leia as migrations de screen share antes da aplicação. Confirme RPCs, grants, RLS e políticas privadas compatíveis.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
