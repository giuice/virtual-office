<!-- generated-by: gsd-doc-writer -->
# Referência de configuração

Esta página descreve a configuração observável no repositório do Virtual Office. A aplicação usa variáveis de ambiente para conectar Next.js e Supabase, enquanto testes e ferramentas têm conjuntos isolados de chaves. O repositório contém `.env.local`, mas não contém `.env.example`; por isso, mantenha valores reais somente em arquivos ignorados pelo Git ou no gerenciador de segredos do ambiente.

> [!CAUTION]
> Toda variável com prefixo `NEXT_PUBLIC_` é destinada ao código cliente. Nunca coloque nela a service role do Supabase, tokens de administração ou outro segredo reutilizável. `SUPABASE_SERVICE_ROLE_KEY` é exclusivamente de servidor.

## Variáveis de ambiente

### Aplicação

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | — | URL do projeto Supabase usada pelo cliente do navegador, SSR, proxy de autenticação e alguns scripts. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | — | Chave pública/anon usada pelos clientes Supabase do navegador e do servidor sem privilégios administrativos. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim para a aplicação completa | — | Segredo de servidor usado pelas rotas administrativas, convites, presença, anexos, empresas e outros fluxos privilegiados. Nunca exponha no cliente. |
| `NEXT_PUBLIC_APP_URL` | Não | origem da requisição; último fallback `http://localhost:3000` | Origem canônica usada para montar links de convite e de criação de empresa. Valores inválidos são ignorados. |
| `NEXT_PUBLIC_STUN_URL` | Não | `stun:stun.l.google.com:19302` | Servidor STUN usado pela configuração ICE do WebRTC. |
| `NEXT_PUBLIC_TURN_URL` | Condicional | sem TURN | URL do servidor TURN. Só é adicionada quando as três variáveis TURN estão presentes. |
| `NEXT_PUBLIC_TURN_USERNAME` | Condicional | sem TURN | Usuário TURN enviado ao navegador. |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | Condicional | sem TURN | Credencial TURN enviada ao navegador. Por ser pública no bundle, use credenciais efêmeras ou adequadas para distribuição ao cliente. |
| `NEXT_PUBLIC_DEBUG_MESSAGING` | Não | ativo em desenvolvimento; inativo nos demais ambientes | Aceita `1`, `true`, `yes` ou `on` para habilitar logs de mensagens. O `localStorage` `vo:debug:messaging` também pode habilitá-los. |
| `ENABLE_CONVERSATION_RESOLVER_LOGS` | Não | `false` | Use `true` para habilitar logs do `ConversationResolverService`. |
| `NEXT_PUBLIC_DISABLE_REACT_QUERY_DEVTOOLS` | Não | `false` | Use `true` para ocultar o React Query Devtools em desenvolvimento. |
| `NEXT_PUBLIC_E2E` | Não | `false` | Use `true` para suprimir o React Query Devtools durante E2E. |
| `NODE_ENV` | Gerenciada pelo runtime | — | Controla logs de desenvolvimento, Devtools, refetch em foco e a indisponibilidade da rota de seed de mensagens em produção. |

<!-- VERIFY: provisionar e validar os valores de STUN/TURN em cada ambiente implantado; o repositório contém apenas o fallback STUN público e nenhuma infraestrutura TURN -->

As chaves abaixo existem no `.env.local` atual, mas não têm consumidor direto encontrado em `src/`, `scripts/` ou nas configurações executáveis:

| Variável | Situação observada |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Sem referência no código; `NEXT_PUBLIC_APP_URL` é a variável usada para origem da aplicação. |
| `SUPABASE_URL` | Sem referência direta; o código usa `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Sem referência direta; o código usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `SUPABASE_ACCESS_TOKEN` | Presente apenas na configuração local; trate como segredo de ferramenta, não como variável da aplicação. |

<!-- VERIFY: confirmar se as quatro chaves sem consumidor direto ainda são necessárias ao fluxo operacional antes de removê-las -->

### Playwright e E2E

`playwright.config.ts` carrega explicitamente `.env.local`. As credenciais são exigidas somente pelas suítes que as consomem.

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `AUTH_E2E_EMAIL` | Para o fluxo de login e papel admin | — | E-mail do usuário principal. O teste de autenticação é ignorado se faltar junto com a senha. |
| `AUTH_E2E_PASSWORD` | Para o fluxo de login e papel admin | — | Senha do usuário principal. |
| `AUTH_E2E_MEMBER_EMAIL` | Para cenários de presença com membro | — | E-mail do membro da mesma empresa. |
| `AUTH_E2E_MEMBER_PASSWORD` | Para cenários de presença com membro | — | Senha do membro. |
| `AUTH_E2E_EXTERNAL_EMAIL` | Para cenários multitenant de presença | — | E-mail de usuário de outra empresa. |
| `AUTH_E2E_EXTERNAL_PASSWORD` | Para cenários multitenant de presença | — | Senha do usuário externo. |
| `PLAYWRIGHT_TEST_SECRET` | Para testes do drawer de mensagens | — | Segredo compartilhado no header `x-test-secret` para autorizar seed e limpeza em ambiente não produtivo. |
| `PLAYWRIGHT_PRIMARY_EMAIL` | Para o seed padrão de mensagens | — | E-mail do usuário admin criado/reutilizado pelo seeder. |
| `PLAYWRIGHT_PRIMARY_PASSWORD` | Para o seed padrão de mensagens | — | Senha do usuário admin e login do fixture. |
| `PLAYWRIGHT_PRIMARY_DISPLAY_NAME` | Não | `Playwright Primary` | Nome exibido do usuário principal. |
| `PLAYWRIGHT_SECONDARY_EMAIL` | Para o seed padrão de mensagens | — | E-mail do usuário membro criado/reutilizado pelo seeder. |
| `PLAYWRIGHT_SECONDARY_PASSWORD` | Para o seed padrão de mensagens | — | Senha do usuário membro e login do fixture. |
| `PLAYWRIGHT_SECONDARY_DISPLAY_NAME` | Não | `Playwright Secondary` | Nome exibido do usuário secundário. |
| `PRESENCE_E2E_PROVISION_LOCAL` | Não | desabilitado | Use `1` para provisionar o fixture descartável de presença no Supabase local. |
| `PRESENCE_E2E_LOCAL_DB_URL` | Quando o fixture local está ativo | — | Conexão Postgres local; a implementação rejeita hosts que não sejam loopback. |
| `VO_AUTH_METRICS` | Não | desabilitado | Use `1` para executar o servidor E2E isolado que captura métricas sanitizadas de autenticação. É ignorado em `NODE_ENV=production` pela instrumentação. |
| `VO_AUTH_METRICS_PORT` | Não | `3100` | Porta do servidor de métricas; deve ser um inteiro de `1` a `65535`. |
| `VO_AUTH_METRICS_FILE` | Não | `test-results/auth-metrics.ndjson` | Arquivo de saída das métricas sanitizadas. |
| `VO_AUTH_METRICS_SHUTDOWN_FILE` | Não | `test-results/auth-metrics.shutdown` | Arquivo-sinal solicitado pelo teardown. |
| `VO_AUTH_METRICS_SHUTDOWN_ACK_FILE` | Não | `test-results/auth-metrics.shutdown.ack` | Confirmação de que a saída foi drenada antes do encerramento. |
| `VO_NEXT_DIST_DIR` | Não | `.next` | Sobrescreve `distDir` do Next.js; o runner de métricas usa `.next-auth-metrics-webpack`. |
| `VO_NEXT_TSCONFIG` | Não | `tsconfig.json` | Sobrescreve o tsconfig do build; o runner de métricas usa `tsconfig.auth-metrics.json`. |

### Testes de banco, concorrência e integração remota

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `PRESENCE_TEST_DB_URL` | Não para testes locais | Postgres local em `127.0.0.1:54322` | Conexão usada pelos testes de banco e pelo runner de concorrência. |
| `PRESENCE_TEST_API_URL` | Não | `http://127.0.0.1:54321` | API do Supabase local usada pelos testes de presença. |
| `PRESENCE_TEST_ANON_KEY` | Não | chave demo do Supabase local embutida no fixture | Sobrescreve a chave anon do stack local. |
| `PRESENCE_TEST_SERVICE_ROLE_KEY` | Não | chave demo de service role local embutida no fixture | Sobrescreve a service role usada somente nos testes locais. |
| `PRESENCE_SOAK_ITERATIONS` | Não | `50` | Iterações do teste de soak; valores fora do intervalo `50`–`500` voltam a `50`. |
| `PRESENCE_CONCURRENCY_SINGLE_ITERATION` | Interna ao harness | desabilitado | `1` reduz casos instrumentados a uma única iteração. |
| `PRESENCE_CONCURRENCY_REPORT_DIR` | Não | `<temp>/virtual-office-presence-concurrency` | Diretório dos relatórios; deve permanecer dentro do diretório temporário do SO. |
| `PRESENCE_CONCURRENCY_TARGET_CLASS` | Para staging | — | Deve ser exatamente `staging` no soak de staging. |
| `PRESENCE_CONCURRENCY_TARGET_REF` | Para staging | — | Identidade do projeto esperada na URL do banco de staging. |
| `PRESENCE_CONCURRENCY_STAGING_DB_HOST` | Para staging | — | Host protegido que deve coincidir com `PRESENCE_TEST_DB_URL`. |
| `PRESENCE_CONCURRENCY_APPROVAL_ACK` | Para staging | — | Deve ser `I_APPROVE_STAGING_SOAK` para autorizar explicitamente o soak. |
| `PRESENCE_CONCURRENCY_PRODUCTION` | Não | `false` | O runner recusa staging quando esta variável é `true`; produção não é um alvo aceito. |
| `RUN_REMOTE_MESSAGING_INTEGRATION` | Para integração remota | desabilitado | Deve ser `1` para habilitar deliberadamente a suíte remota de mensagens. |
| `REMOTE_MESSAGING_SUPABASE_URL` | Para integração remota | — | URL de um Supabase dedicado à integração remota. |
| `REMOTE_MESSAGING_SUPABASE_SERVICE_ROLE_KEY` | Para integração remota | — | Service role do alvo remoto dedicado; nunca use no cliente. |

<!-- VERIFY: identificar e autorizar nominalmente o projeto Supabase dedicado antes de executar `test:messaging-remote` ou o soak de staging -->

### Avaliação da skill de segurança de presença

O script `scripts/evaluate-presence-skill.mjs`, acionado por `npm run presence:skill:eval`, falha imediatamente se qualquer chave abaixo estiver ausente:

| Variável | Finalidade |
| --- | --- |
| `PRESENCE_SKILL_EVAL_ALLOWED_ENV` | Lista explícita de variáveis que o processo filho pode receber; deve incluir `PATH`. |
| `PRESENCE_SKILL_EVAL_RUNNER` | Caminho absoluto do executável do runner. |
| `PRESENCE_SKILL_EVAL_RUNNER_MANIFEST` | Manifesto JSON do bundle do runner. |
| `PRESENCE_SKILL_EVAL_RUNNER_SHA256` | SHA-256 esperado do bundle. |
| `PRESENCE_SKILL_EVAL_RUNNER_VERSION` | Versão que deve coincidir com o manifesto. |
| `PRESENCE_SKILL_EVAL_MODEL_MANIFEST` | Manifesto JSON dos modelos aprovados. |
| `PRESENCE_SKILL_EVAL_MODEL_MANIFEST_SHA256` | SHA-256 esperado do manifesto de modelos. |
| `PRESENCE_SKILL_EVAL_CANDIDATE_MODELS` | IDs de modelos candidatos separados por vírgula. |
| `PRESENCE_SKILL_EVAL_JUDGE_MODEL` | ID do modelo julgador, que não pode também ser candidato. |

### Variáveis fornecidas pelo sistema ou pelo Supabase CLI local

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `CI` | Não | ausente | Em Playwright, proíbe `test.only`, ativa duas tentativas adicionais e impede reutilizar servidor existente. |
| `ComSpec` | Não | `cmd.exe` no Windows | Shell usado pelo wrapper de métricas de autenticação. |
| `RUNNER_TEMP` | Não | diretório temporário do SO | Autoridade de caminho para os relatórios de concorrência. |
| `OPENAI_API_KEY` | Condicional | — | Consumida pelo Studio local em `supabase/config.toml`. |
| `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` | Somente se Twilio for habilitado | — | Token do provedor SMS; a seção está desabilitada no arquivo atual. |
| `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` | Somente se Apple for habilitado | — | Segredo do provedor Apple; a seção está desabilitada no arquivo atual. |
| `S3_HOST` | Condicional | — | Host S3 da seção experimental do Supabase local. |
| `S3_REGION` | Condicional | — | Região S3 da seção experimental. |
| `S3_ACCESS_KEY` | Condicional | — | Chave de acesso S3 da seção experimental. |
| `S3_SECRET_KEY` | Condicional | — | Segredo S3 da seção experimental. |

<!-- VERIFY: confirmar no Supabase CLI 2.109.1 se as quatro variáveis S3 são exigidas com `[experimental.pgdelta]` habilitado no ambiente local -->

## Formato dos arquivos de configuração

| Arquivo | Formato | Responsabilidade |
| --- | --- | --- |
| `.env.local` | pares `CHAVE=valor` | Valores locais da aplicação e do Playwright; é ignorado pelo Git. |
| `next.config.ts` | módulo TypeScript | Diretório de build e tsconfig selecionáveis por `VO_NEXT_DIST_DIR` e `VO_NEXT_TSCONFIG`. |
| `supabase/config.toml` | TOML | Stack Supabase local: API `54321`, Postgres `54322`, Studio `54323`, SMTP local `54324`, Auth, Storage, Realtime e migrações. |
| `playwright.config.ts` | módulo TypeScript | Projetos E2E, servidor local, retries de CI e modo de métricas de autenticação. |
| `vitest.config.mts` e `vitest.*.config.mts` | módulos TypeScript | Ambientes e escopos das suítes unitárias, presença, concorrência e integração remota. |
| `tsconfig.json` e `tsconfig.auth-metrics.json` | JSON | Compilação TypeScript normal e isolada para métricas E2E. |

Exemplo mínimo para executar a aplicação com os fluxos de servidor:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-ou-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<segredo-exclusivo-do-servidor>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

O `supabase/config.toml` configura apenas a stack local. Entre os valores verificados no repositório estão:

```toml
project_id = "virtual-office"

[api]
port = 54321

[db]
port = 54322
major_version = 15

[auth]
site_url = "http://127.0.0.1:3000"

[realtime]
enabled = true
```

## Configurações obrigatórias e opcionais

Não existe um schema central de validação no startup. A aplicação inicializa os clientes Supabase diretamente com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; portanto, configure ambas antes de `npm run dev`, `npm run build` ou `npm start`.

`SUPABASE_SERVICE_ROLE_KEY` é validada quando um cliente privilegiado é solicitado. Sem ela, a aplicação ainda pode iniciar, mas os fluxos que usam rotas administrativas falham com:

```text
SUPABASE_SERVICE_ROLE_KEY is not set in environment variables
```

Outras validações explícitas são contextuais:

- `VO_AUTH_METRICS_PORT` fora de `1`–`65535` interrompe o carregamento do Playwright.
- A rota de seed exige `PLAYWRIGHT_TEST_SECRET` e, no payload padrão, os e-mails e senhas primário/secundário.
- A suíte remota de mensagens exige opt-in e as duas credenciais `REMOTE_MESSAGING_*`.
- O fixture E2E de presença exige a credencial de cada papel no primeiro acesso, ou provisiona todas localmente quando `PRESENCE_E2E_PROVISION_LOCAL=1`.
- O runner de concorrência restringe execuções `ci` e `soak` ao Supabase local em loopback na porta `54322`; staging exige identidade, host e aceite explícitos.

## Valores padrão

Os defaults com maior impacto operacional são definidos no código, não no `.env.local`:

| Configuração | Padrão efetivo | Definida em |
| --- | --- | --- |
| Origem para links | origem da requisição, depois `http://localhost:3000` | `src/app/api/invitations/create/resolve-app-base-url.ts` |
| Servidor STUN | `stun:stun.l.google.com:19302` | `src/lib/webrtc/ice-config.ts` |
| TURN | omitido se qualquer uma das três chaves faltar | `src/lib/webrtc/ice-config.ts` |
| Build Next | `.next` e `tsconfig.json` | `next.config.ts` |
| Playwright | `http://localhost:3000`; porta `3100` no modo de métricas | `playwright.config.ts` |
| Supabase local | API `54321`, banco `54322`, Postgres 15 | `supabase/config.toml` |
| Teste de banco de presença | stack local nas portas `54321`/`54322` | `__tests__/presence-db/setup.ts` |
| Relatório de concorrência | `<temp>/virtual-office-presence-concurrency` | `scripts/run-presence-concurrency.mjs` |

## Sobrescritas por ambiente

O repositório não contém `.env.development`, `.env.test` nem `.env.production`; somente `.env.local` foi detectado. Use a mesma nomenclatura de variáveis em cada ambiente e altere apenas valores e chaves conforme o alvo.

- **Desenvolvimento local:** use `.env.local`. O Playwright também lê esse arquivo explicitamente. Para testes de banco, inicie o stack configurado em `supabase/config.toml` com `npm run db:local:start`.
- **Teste:** `NODE_ENV=test` desativa saídas específicas e as suítes aceitam overrides dedicados `PRESENCE_TEST_*`, `REMOTE_MESSAGING_*` e `AUTH_E2E_*`.
- **Produção:** configure as três chaves Supabase principais no ambiente do processo. `NODE_ENV=production` remove a rota de seed de mensagens, desativa a instrumentação de auth metrics e habilita refetch do TanStack Query ao focar a janela.
- **Staging:** use credenciais próprias. O soak de concorrência requer `PRESENCE_CONCURRENCY_TARGET_CLASS=staging`, correspondência entre URL, host e project ref, além do aceite explícito.

<!-- VERIFY: registrar no runbook de implantação qual plataforma injeta as variáveis de staging e produção e quais nomes de projeto/ambiente estão autorizados -->
