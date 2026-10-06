# Migrações pendentes no online — Fase 4

**Situação em 2026-10-05: todas as 6 aplicadas no online (TRACK T25). O app novo ainda NÃO foi publicado.**

Regra (decisão do Giuliano, 2026-10-04): durante a fase, as migrações ficam só no banco **local**. No fim da fase, todas são aplicadas no Supabase online `vhabpcoyypobgasacsko` de uma vez, com OK explícito (tarefa T25 do PLAN).

Nunca usar `supabase db push`. Cada arquivo é aplicado sozinho, em ordem, e conferido depois (ver TRACK T2).

| # | Arquivo | O que faz | Tarefa | Local | Online | Rollback |
|---|---|---|---|---|---|---|
| 1 | `supabase/migrations/20261004161806_message_read_receipts_per_message.sql` | Recibo só das mensagens vistas; contador de não lidas segue os recibos | T5 | aplicada 2026-10-04 | aplicada 2026-10-05 22:54 UTC (T25) | TRACK T5 |
| 2 | `supabase/migrations/20261004170724_revoke_mark_conversation_read_from_clients.sql` | Tira do `anon`/`authenticated` a permissão de marcar conversa como lida (falha de segurança antiga) | T24 | aplicada 2026-10-04 | aplicada 2026-10-05 22:56 UTC (T25) | TRACK T24 |
| 3 | `supabase/migrations/20261004180918_message_read_receipts_reader_or_sender_only.sql` | Recibos: cada um vê só os próprios e os das mensagens que enviou; cliente não grava recibo direto | T7 | aplicada 2026-10-04 | aplicada 2026-10-05 22:58 UTC (T25) | TRACK T7 (antes de aplicar: listar as políticas da tabela no online) |
| 4 | `supabase/migrations/20261005000414_messages_client_message_id_idempotency.sql` | Chave anti-duplicata no envio: "Tentar de novo" não grava a mesma mensagem duas vezes | T23 | aplicada 2026-10-04 | aplicada 2026-10-05 23:00 UTC (T25) | TRACK T23 (tirar o app novo do ar antes do rollback) |
| 5 | `supabase/migrations/20261005004335_message_attachment_uploads.sql` | Anexos: tabela de uploads ainda não enviados (invisível a todos), função que cria a mensagem com até 5 anexos, mensagem só com anexo permitida; cliente não grava mais anexo direto (fecha falha antiga) | T12 | aplicada 2026-10-04 | aplicada 2026-10-05 23:02 UTC (T25) | TRACK T12 (antes de aplicar: conferir no online o nome da regra de conteúdo vazio de `messages` e as políticas de `messages`/`message_attachments`) |
| 6 | `supabase/migrations/20261005141134_voice_note_attachments.sql` | Mensagens de voz: aceita áudio (webm/mp4) só como mensagem de voz de até 2 min, com duração e forma de onda; áudio como anexo comum continua recusado | T15 | aplicada 2026-10-05 | aplicada 2026-10-05 23:05 UTC (T25) | TRACK T15 (aplicar depois da #5; antes: conferir no online o bucket `attachments`, as políticas de `storage.objects` e se há áudios antigos sem duração) |

Previstas nas próximas tarefas: nenhuma.

Ordem de deploy no fim: primeiro aplicar todas as migrações online, depois publicar o app novo. **Obrigatório** por causa da #4: o app novo envia a chave em toda mensagem e, sem a coluna no banco, todo envio falha.
