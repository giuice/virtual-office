<!-- generated-by: gsd-doc-writer -->
# Testes

O Virtual Office combina Vitest e Testing Library para testes unitários e de integração, Playwright para fluxos de API e navegador e suítes isoladas que exercitam o Supabase local. Todos os testes ficam em `__tests__/`.

## Frameworks e configuração

As versões declaradas em `package.json` são:

| Ferramenta | Versão declarada | Uso principal |
|---|---:|---|
| Vitest | `^4.0.18` | Testes unitários, de componentes, rotas, hooks, repositórios e integrações em Node |
| Testing Library React | `^16.3.2` | Renderização e interação com componentes React |
| Testing Library Jest DOM | `^7.0.0` | Matchers de DOM carregados globalmente |
| Testing Library User Event | `^14.6.1` | Interações de usuário em testes de componentes |
| Playwright Test | `^1.58.2` | Testes de API e fluxos de navegador |
| V8 coverage | `^4.0.18` | Coleta de cobertura do Vitest |

Instale as dependências antes de executar qualquer suíte:

```bash
npm install
```

A configuração padrão está em `vitest.config.mts`. Ela usa `jsdom`, habilita globals do Vitest, resolve o alias `@` para `src/` e carrega `vitest.setup.ts`. O setup registra Testing Library e Jest DOM e fornece mocks globais para APIs do navegador, Next.js e clientes Supabase. Se um teste precisar observar a implementação real de um desses clientes, remova ou substitua explicitamente o mock dentro do próprio arquivo.

As suítes especializadas usam configurações separadas:

| Configuração | Ambiente | Escopo |
|---|---|---|
| `vitest.config.mts` | `jsdom` | Testes padrão em `__tests__/**/*.{test,spec}.*`, exceto Playwright, banco de presença e integração remota de mensagens |
| `vitest.presence.config.mts` | `jsdom` | Testes de aplicação, hooks, rotas e limites relacionados à presença |
| `vitest.presence-db.config.mts` | Node | Integração com Postgres/PostgREST no Supabase local, executada de forma serial |
| `vitest.presence-concurrency.config.mts` | Node | Casos de concorrência de presença, com um worker e execução serial |
| `vitest.remote-messaging.config.mts` | Node | Integração opt-in de mensagens contra um projeto remoto dedicado |
| `playwright.config.ts` | Chromium (`Desktop Chrome`) | Projetos `api`, `messaging-drawer` e `presence` em `__tests__/api/playwright/` |

Para usar Playwright localmente pela primeira vez, instale o navegador necessário:

```bash
npx @playwright/test install chromium
```

O Playwright lê `.env.local` e inicia `npm run dev` automaticamente em `http://localhost:3000`, salvo quando o modo de métricas de autenticação seleciona outra porta. Consulte [a referência de configuração](../configuration/reference.md) para as variáveis exigidas por cada fixture.

## Executando os testes

### Vitest

Execute toda a suíte padrão uma vez:

```bash
npm test
```

Mantenha o Vitest em modo de observação durante o desenvolvimento:

```bash
npm run test:watch
```

Abra a interface interativa do Vitest:

```bash
npm run test:ui
```

Execute um único arquivo ou um subconjunto por padrão de caminho:

```bash
npm test -- __tests__/messaging/emoji-picker.test.tsx
npm test -- __tests__/api
```

A suíte focada em reações de mensagens também possui um atalho:

```bash
npm run test:messaging-reactions
```

### Playwright

Execute todos os projetos definidos em `playwright.config.ts`:

```bash
npm run test:api
```

Execute somente um projeto ou um arquivo:

```bash
npm run test:api -- --project=presence
npm run test:api -- auth-flow.spec.ts
```

Para investigação interativa, use um dos modos disponíveis:

```bash
npm run test:api:debug
npm run test:api:ui
```

`npm run test:api:ci` limita a execução ao projeto `messaging-drawer` e repete cada teste três vezes. O script `npm run test:all` executa primeiro a suíte Vitest e depois aguarda confirmação no terminal antes de iniciar Playwright; por isso, ele é voltado ao uso interativo.

### Presença e banco local

Os testes de banco de presença falham imediatamente se o Postgres local não estiver acessível. Prepare um stack descartável antes de executá-los:

```bash
npm run db:local:start
npm run db:local:reset
npm run test:presence:db
```

Os demais comandos de presença são:

```bash
npm run test:presence
npm run test:presence:concurrency
npm run test:presence:e2e
npm run test:presence:all
```

`test:presence:all` encadeia a suíte de aplicação, a suíte de banco e o E2E. A concorrência é um gate separado. O modo `test:presence:concurrency:soak` aumenta a repetição local; `test:presence:concurrency:staging` exige identificação e autorização explícitas do alvo e recusa produção.

A integração remota de mensagens é deliberadamente opt-in:

```bash
npm run test:messaging-remote
```

Use somente um projeto Supabase dedicado e configure `RUN_REMOTE_MESSAGING_INTEGRATION=1`, `REMOTE_MESSAGING_SUPABASE_URL` e `REMOTE_MESSAGING_SUPABASE_SERVICE_ROLE_KEY`. Ela não faz parte de `npm test`.

## Escrevendo novos testes

- Coloque testes Vitest em `__tests__/` com sufixo `*.test.ts`, `*.test.tsx` ou, quando adequado, `*.spec.ts`. Preserve a organização por área, como `__tests__/api/`, `__tests__/components/`, `__tests__/hooks/`, `__tests__/messaging/` e `__tests__/repositories/`.
- Coloque specs Playwright em `__tests__/api/playwright/` com sufixo `*.spec.ts`. Adicione o arquivo ao `testMatch` do projeto correto em `playwright.config.ts` quando ele não corresponder a um padrão existente.
- Use Testing Library e `userEvent` para validar comportamento observável de componentes. Evite testar detalhes internos quando a mesma garantia pode ser expressa por papel, rótulo, texto ou estado visível.
- Reutilize `__tests__/mocks/supabase.ts` para o mock compartilhado de `createClient`. Os mocks globais e APIs simuladas comuns ficam em `vitest.setup.ts`.
- Para testes reais do banco de presença, reutilize `__tests__/presence-db/setup.ts` e `__tests__/presence-db/fixtures.ts`. Essas suítes compartilham um banco local e são serializadas para manter a limpeza determinística.
- Para Playwright de mensagens, importe o `test` estendido de `__tests__/api/playwright/fixtures/messaging.ts`; ele provisiona dados, cria sessões primária/secundária e limpa o fixture ao terminar. Os fluxos do drawer reutilizam `__tests__/api/playwright/helpers/drawer-helpers.ts`.
- Para E2E de presença, reutilize `__tests__/api/playwright/presence/local-fixture.ts`. Com `PRESENCE_E2E_PROVISION_LOCAL=1`, ele prepara contas descartáveis no Supabase local; sem esse modo, cada papel acessado exige suas credenciais `AUTH_E2E_*`.

Um teste Vitest de componente segue este formato básico:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('MeuComponente', () => {
  it('executa a ação visível para a pessoa usuária', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<MeuComponente onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onAction).toHaveBeenCalledOnce();
  });
});
```

## Cobertura

Gere cobertura com o provider V8:

```bash
npm run test:coverage
```

Os reporters configurados são `text`, `json` e `html`.

| Tipo | Limiar mínimo |
|---|---:|
| Linhas | Não configurado |
| Branches | Não configurado |
| Funções | Não configurado |
| Statements | Não configurado |

Não há limiar de cobertura configurado em `vitest.config.mts`; portanto, o comando produz o relatório, mas não reprova por uma porcentagem mínima global.

## Integração contínua

Dois workflows de GitHub Actions executam testes. Ambos aceitam execução manual com `workflow_dispatch` e também são acionados em pull requests quando caminhos relevantes são alterados.

| Workflow | Job | Preparação e comandos de teste |
|---|---|---|
| `.github/workflows/e2e-playwright.yml` (`Playwright E2E`) | `e2e` | Usa Node.js 20, executa `npm ci`, instala os navegadores Playwright, materializa `.env.local` a partir de secrets e roda `npm run test:api:ci`. O relatório HTML é publicado como artefato. |
| `.github/workflows/presence-remediation.yml` (`presence-remediation`) | `movement-gate` | Executa `node scripts/presence-movement-gate.mjs`. |
| `.github/workflows/presence-remediation.yml` | `presence-unit-and-quality` | Executa `npm run test:presence` e `npm test`, seguidos de type-check, lint e build. |
| `.github/workflows/presence-remediation.yml` | `presence-db` | Inicia e reseta Supabase local, roda `npm run test:presence:db` e `npm run test:presence:concurrency` e publica a evidência de concorrência. |
| `.github/workflows/presence-remediation.yml` | `presence-e2e` | Provisiona um Supabase local descartável, instala Chromium e executa `npm run test:presence:e2e`; o stack é encerrado mesmo após falhas. |

Os workflows são filtrados por caminho: eles não constituem uma execução incondicional em todo push ou em todo pull request. Ao alterar uma área fora desses filtros, execute localmente as suítes afetadas antes de solicitar revisão.
