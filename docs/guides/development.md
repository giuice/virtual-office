<!-- generated-by: gsd-doc-writer -->
# Desenvolvimento

Este guia descreve o fluxo de desenvolvimento local do Virtual Office, um aplicativo Next.js 16 com React 19, TypeScript estrito e Supabase. Os comandos abaixo foram verificados no `package.json` e nas configurações versionadas do repositório.

## Configuração local

O repositório usa npm (`package-lock.json`) e os workflows de CI usam Node.js 20. O projeto não declara `engines` nem mantém `.nvmrc`, portanto Node.js 20 é a referência reproduzível disponível no próprio repositório.

1. Crie um fork de `giuice/virtual-office` no GitHub, se o seu acesso permitir, e clone-o. Para trabalhar diretamente no repositório principal:

   ```bash
   git clone https://github.com/giuice/virtual-office.git
   cd virtual-office
   ```

2. Instale as dependências de desenvolvimento:

   ```bash
   npm install
   ```

3. Inicie o Supabase local e aplique as migrações versionadas:

   ```bash
   npm run db:local:start
   npm run db:local:reset
   ```

   `db:local:reset` recria o banco local e apaga seus dados locais. Não o execute contra um ambiente compartilhado.

4. Crie `.env.local` com as credenciais retornadas pela stack local. Não há `.env.example` versionado; consulte a [referência de configuração](../configuration/reference.md) para a lista completa. O conjunto mínimo para a aplicação é:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-local>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key-local>
   ```

5. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   A aplicação fica disponível em `http://localhost:3000`. O [README](../../README.md) apresenta o primeiro fluxo de uso.

Use `npm install` durante o desenvolvimento, quando o manifesto pode mudar. Os workflows automatizados usam `npm ci` para instalar exatamente o conteúdo de `package-lock.json`.

## Comandos de build e desenvolvimento

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Next.js em modo de desenvolvimento com Turbopack. |
| `npm run build` | Gera o build de produção do Next.js. |
| `npm start` | Serve um build de produção já gerado. |
| `npm run type-check` | Executa `tsc --noEmit` com o `tsconfig.json`. |
| `npm run lint` | Executa o ESLint em todo o repositório. |
| `npm test` | Executa toda a suíte Vitest uma vez. |
| `npm run test:watch` | Executa o Vitest em modo interativo/watch. |
| `npm run test:messaging-reactions` | Executa somente os testes de seletor de emoji e chips de reação. |
| `npm run test:messaging-remote` | Executa a integração remota de mensagens com `vitest.remote-messaging.config.mts`; exige opt-in e credenciais próprias. |
| `npm run test:ui` | Abre a interface do Vitest. |
| `npm run test:coverage` | Executa o Vitest e gera cobertura com V8. |
| `npm run test:api` | Executa os projetos configurados no Playwright. |
| `npm run test:api:debug` | Executa o Playwright no depurador. |
| `npm run test:api:ui` | Abre a interface do Playwright. |
| `npm run test:api:ci` | Executa o projeto Playwright `messaging-drawer` três vezes por teste. |
| `npm run test:all` | Executa Vitest e, após confirmação interativa, Playwright; requer o servidor local em execução. |
| `npm run db:local:start` | Inicia a stack local do Supabase. |
| `npm run db:local:reset` | Recria o banco local e reaplica as migrações. |
| `npm run test:presence` | Executa as suítes isoladas de presença com `vitest.presence.config.mts`. |
| `npm run test:presence:db` | Executa os testes de banco de presença com `vitest.presence-db.config.mts`. |
| `npm run test:presence:concurrency` | Executa o gate local/CI de concorrência de presença. |
| `npm run test:presence:concurrency:soak` | Executa o modo de soak do runner de concorrência. |
| `npm run test:presence:concurrency:staging` | Executa o soak contra staging; exige identificação e autorização explícitas do alvo. |
| `npm run test:presence:e2e` | Executa o projeto Playwright `presence` com um worker. |
| `npm run test:presence:all` | Executa, em sequência, as suítes de presença unitária, de banco e E2E. |
| `npm run test:presence-db` | Alias de `test:presence:db`. |
| `npm run test:presence-e2e` | Alias de `test:presence:e2e`. |
| `npm run presence:gate` | Verifica que movimentação e escrita de presença respeitam o coordenador e os limites de navegador. |
| `npm run presence:skill:validate` | Valida a estrutura, referências e cenários da skill de segurança de presença promovida. |
| `npm run presence:skill:eval` | Executa a avaliação controlada da skill de presença; requer commit limpo e configuração explícita do runner e dos modelos. |

Antes de executar integrações remotas ou testes de staging, leia as variáveis e travas de segurança em [referência de configuração](../configuration/reference.md). Os runners recusam alguns alvos inválidos, mas isso não substitui a autorização do ambiente.

## Estilo de código

- **TypeScript:** `tsconfig.json` usa `strict: true` e não emite artefatos. Execute `npm run type-check` antes de abrir um PR.
- **ESLint:** `eslint.config.mjs` usa a configuração flat, as regras `core-web-vitals` do Next.js, `@typescript-eslint` e `eslint-plugin-react-hooks`. Execute `npm run lint`.
- **Prettier:** `prettier` e `prettier-plugin-tailwindcss` estão instalados, mas não há arquivo de configuração nem script de formatação versionado. Não existe, portanto, um comando oficial de formatação no projeto.
- **Organização:** mantenha lógica de negócio em utilitários ou serviços, acesso a dados em repositórios e apresentação em componentes. Hooks de consulta, mutação e Realtime pertencem, respectivamente, a `src/hooks/queries`, `src/hooks/mutations` e `src/hooks/realtime`.
- **Tipos e componentes canônicos:** reutilize tipos de `src/types`, evite `any` em novas fronteiras públicas e procure implementações existentes antes de criar abstrações paralelas.

O CI executa lint, type-check e build no workflow `presence-remediation` quando um PR altera os caminhos monitorados de presença. Isso não cobre automaticamente toda mudança; rode localmente as verificações proporcionais ao código alterado.

## Convenções de branch

O branch padrão do remoto é `main`. Não há convenção formal de nomes documentada no repositório ou em um template de PR. O histórico de branches remotos usa com frequência `feature/<descrição>`; trate esse formato como prática observada, não como regra imposta.

Exemplos coerentes com o repositório:

```text
feature/message-redesign
feature/invitation-fix
```

Crie o branch a partir de `main`, escolha um nome curto que descreva o resultado e evite misturar alterações sem relação no mesmo PR.

## Processo de pull request

O repositório não contém um template de pull request nem uma política de commits documentada. Ao contribuir:

- Abra o PR contra `main` e descreva o problema, a solução e o impacto visível para usuários.
- Informe separadamente mudanças de aplicação, banco de dados e implantação. Um arquivo de migração versionado não significa que a migração foi aplicada.
- Inclua ou atualize testes para o comportamento alterado e registre os comandos executados e seus resultados.
- Execute ao menos `npm run type-check`, `npm run lint` e os testes focados; use `npm run build` quando alterar limites do Next.js ou a saída de produção.
- Aguarde os checks aplicáveis. `Playwright E2E` roda em PRs que alteram a aplicação ou os testes cobertos; `presence-remediation` adiciona testes, build, banco local e gates de concorrência para mudanças de presença.

Mudanças em presença, Realtime, acesso privado, Knock, migrações ou políticas RLS exigem revisão adicional das invariantes e do contrato de banco descritos nas regras do repositório. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` em código cliente.
