# REPORT: phase-4-messaging-timeline
Date: 2026-10-06
Status: COMPLETED

OUTCOME
COMPLETED — Todos os 37 critérios da SPEC da Fase 4 estão atendidos, e você aprovou o teste final em 2026-10-06. Com duas contas, o chat agora faz isto:
- mostra "Lida por N", com quem leu e a hora;
- envia e mostra até 5 anexos (imagens e arquivos);
- grava e toca notas de voz de até 2 min;
- encontra mensagens favoritas antigas;
- avisa no computador quando chega mensagem nova, se você ativar.

MATERIAL CHANGE
- Leitura: só conta como lida a mensagem que apareceu na tela. Só quem enviou vê quem leu, e o contador de não lidas segue isso.
- Envio: um envio que falha mantém texto, resposta e anexos no campo. "Tentar de novo" grava uma mensagem só.
- Reconexão: depois de cair, o chat alinha leituras, favoritas e anexos com o servidor.
- Falhas de segurança antigas fechadas:
  - visitantes sem login não marcam mais conversa como lida;
  - membros não veem mais as leituras de mensagens dos outros;
  - o navegador não grava mais anexos direto no banco.
- Banco online `vhabpcoyypobgasacsko`: as 6 migrações da fase estão aplicadas. A lista está em `MIGRATIONS-PENDENTES.md`.
- O app novo não foi publicado; o site no ar ainda roda a versão antiga.
- Decisões suas:
  - "Favoritas" fica como botão de estrela no topo de cada conversa;
  - o aviso no computador mostra o texto completo da mensagem.

VERIFICATION
- Testes automáticos: 51 de tela com duas contas e 44 de banco local, todos passando. Checagem de tipos, lint (0 erros), build e os 1289 testes unitários passam.
- A revisão de segurança do banco passou.
- Depois de aplicar as migrações, conferi o banco online e testei nele. Esses testes foram desfeitos no fim.
- O teste final é confirmação sua, não teste automático: você rodou o app novo no seu computador ligado ao banco online.
- Nota de voz tocou no Chrome, no Edge e no Firefox. O Safari do Mac não foi testado.

RESIDUAL STATE
- As mensagens, anexos e notas de voz do seu teste ficaram gravados no banco online.
- Upload real de arquivo no site publicado só pode ser conferido depois da publicação.
- O banco online não tem restauração para um momento exato, só os backups diários.
- Pendências fora desta fase, anotadas no TRACK T21:
  - duas falhas pequenas no banco: falta checar se quem marca a conversa como lida é membro dela, e um visitante sem login consegue chamar a contagem de não lidas. Cada uma precisa de migração;
  - o botão de fixar mensagem não faz nada e está em inglês;
  - o aviso flutuante cobre o campo de digitação;
  - não há limite de uploads pendentes por pessoa;
  - a conversa aberta não volta depois de recarregar a página;
  - o chat fica cortado em telas com menos de 400 px;
  - há arquivos órfãos no armazenamento local;
  - o botão "Favoritas" é difícil de achar.

USER ACTION
- Publicar o app novo. As migrações já estão no online, então a ordem está certa.
- Se precisar voltar atrás: primeiro volte o app, depois desfaça as migrações com o SQL de rollback anotado no TRACK.
