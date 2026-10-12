# REPORT: phase-5-messaging-resilience
Date: 2026-10-12
Status: COMPLETED

OUTCOME
COMPLETED — Os 50 critérios da SPEC da Fase 5 estão atendidos, e você aprovou o teste final em 2026-10-12. O chat agora:
- não perde nem duplica mensagem quando cai a internet ou o Realtime, ao recarregar a página, com várias abas, ao trocar de conta ou com vários dispositivos;
- mostra quem está digitando;
- sincroniza não lidas e leituras entre abas e aparelhos em até 5 s;
- tem @menções com aviso no computador;
- grava métricas de saúde em log do servidor, sem dados pessoais.

MATERIAL CHANGE
- Envio sem internet: a mensagem fica salva no navegador antes de sair e aparece como pendente. Ela sai sozinha, em ordem, quando a conexão volta, mesmo depois de recarregar ou fechar a aba.
  - Com várias abas abertas, só uma envia; cancelar numa aba remove das outras.
  - Se não tiver como salvar no navegador, o envio é bloqueado com aviso.
  - Pendentes com mais de 24 h, ou recusadas pelo servidor, viram falha com "Tentar de novo" / "Apagar".
- Troca de conta: nada é enviado em nome de outra pessoa, e a conta nova nunca vê as pendentes da anterior. O servidor recusa envio cujo remetente não seja quem está logado.
- Sair com pendentes: aparece um aviso. "Sair mesmo" apaga as pendentes.
- Conexão: o painel mostra "Sem conexão" ou "Reconectando…". Depois de 30 s sem Realtime, conversa e lista se atualizam a cada 15 s.
- Digitando: o aviso passou a usar um canal privado, só dos membros da conversa.
- Menções: autocomplete com "@", destaque na mensagem e aviso no computador também em salas e respostas.
  - O aviso só aparece uma vez por navegador.
  - Não aparece se você já está vendo a conversa ou se perdeu o acesso a ela.
- O painel reabre na conversa em que estava depois de recarregar.
- Nova rota de métricas (`POST /api/messages/metrics`): só para usuário logado, com limite de uso e tamanho, sem guardar conteúdo de mensagem.
- Segurança do banco:
  - quem marca conversa como lida precisa ser membro dela;
  - visitante sem login não lê mais a contagem de não lidas;
  - o navegador não consegue mais se colocar sozinho numa conversa (D9).
- Banco online `vhabpcoyypobgasacsko`: as 7 migrações estão aplicadas desde 2026-10-10 e conferidas, com a estrutura igual à local. A lista está em `MIGRATIONS-PENDENTES.md`.
- O app novo ainda não está publicado; ele entra no ar com o seu merge para `staging` e `main`. Até lá, o site no ar pode dar erro em envio e leitura, o que você aceitou na D14.
- Decisões suas que mudaram o contrato:
  - testes de tela só no fim e só no Chrome (D15, D16): Edge e Firefox não foram testados;
  - a checagem da versão antiga do site contra o banco novo foi dispensada (D14).

VERIFICATION
- No fim, uma rodada de testes de tela no Chrome, com várias contas:
  - 111 testes novos e 51 da Fase 4 passaram;
  - 3 falharam e passaram ao rodar de novo sozinhos: 2 por erro do próprio teste (corrigido) e 1 por oscilação de tempo num teste da Fase 4.
- 170 testes de banco local passam. Checagem de tipos, lint (0 erros) e build passam.
- Revisão adversarial do GPT-6.1 Sol em cada bloco e na final. Todos os achados foram corrigidos ou rejeitados com motivo.
  - As correções da última rodada não passaram por nova revisão; os testes de tela as cobrem.
- Nenhum teste unitário foi criado. Os 5 que foram mexidos viraram testes de integração ou de tela e foram apagados.
- No banco online conferi políticas, permissões, funções e a publicação do Realtime, tudo igual ao local.
  - O teste de permissões direto no banco online não rodou, porque o sistema de permissões bloqueou: ele passou no local, e o online tem a mesma estrutura.
- O teste final é confirmação sua, não teste automático: você rodou o app novo no seu computador, ligado ao banco online, seguindo o roteiro (offline, recarregar, duas abas, sair, digitando, menção, leitura).

RESIDUAL STATE
- As mensagens do seu teste ficaram gravadas no banco online.
- Riscos conhecidos, aceitos como baixos:
  - um canal do Realtime pode parecer conectado e mesmo assim perder uma mensagem nova; ela aparece no próximo carregamento ou reconexão;
  - a busca automática a cada 15 s não desiste nem distingue erro permanente;
  - envio de 10 mensagens pendentes levou até 8,9 s no local, perto do limite de 10 s;
  - se o relógio do computador for atrasado no meio de um envio, a mensagem pode demorar mais para sair;
  - duas pessoas com o mesmo nome na conversa podem confundir a menção;
  - com mais de 50 conversas, a conversa salva pode não reabrir depois de recarregar;
  - outras pendências pequenas estão anotadas no TRACK.

USER ACTION
- Fazer commit do código da fase: ele está todo sem commit na branch `feature/phase5-messaging-improvements`. Depois, merge para `staging` e `main` para publicar.
- No painel do Supabase, em Settings → Data API → Exposed schemas, conferir que `private` não aparece.
- Se precisar voltar atrás: primeiro o app, depois as migrações em ordem reversa, com o SQL anotado no TRACK. Desfazer a migração de membros reabre a falha D9.
