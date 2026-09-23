<!-- generated-by: gsd-doc-writer -->

# Primeiros passos

Este guia prepara um ambiente local completo do Virtual Office: aplicação Next.js, banco Postgres, Auth, Realtime e Storage fornecidos pela stack local do Supabase.

## Pré-requisitos

- **Git** para clonar o repositório.
- **Node.js >= 20.9.0** e npm. Essa é a versão mínima exigida pelo Next.js registrado no `package-lock.json`; a Supabase CLI instalada pelo projeto também requer Node.js 20 ou superior.
- **Docker Desktop** ou outro runtime com API compatível com Docker, em execução. A Supabase CLI usa contêineres para iniciar os serviços locais. Consulte a [documentação oficial da Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started) para as alternativas suportadas.
- Portas locais livres para a aplicação (`3000`) e para os serviços configurados em `supabase/config.toml` (`54320` a `54324` e `54327`).

O Supabase CLI já é uma dependência de desenvolvimento do projeto; não é necessário instalá-lo globalmente.

## Instalação

1. Clone o repositório:

   ```bash
   git clone https://github.com/giuice/virtual-office.git
   ```

2. Entre no diretório do projeto:

   ```bash
   cd virtual-office
   ```

3. Instale exatamente as dependências registradas no lockfile:

   ```bash
   npm ci
   ```

## Primeira execução

1. Com o runtime de contêineres ativo, inicie o Supabase local e aplique novamente as migrações versionadas:

   ```bash
   npm run db:local:start
   npm run db:local:reset
   npx supabase status
   ```

   > `npm run db:local:reset` recria o banco local e apaga dados locais existentes. Use-o na preparação inicial ou quando quiser deliberadamente reconstruir o schema.

2. Crie `.env.local` na raiz. O repositório não versiona um arquivo de exemplo; copie a URL e as chaves locais mostradas por `npm run db:local:start` ou `npx supabase status`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave-publica-local>
   SUPABASE_SERVICE_ROLE_KEY=<chave-secreta-local>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   A chave pública pode ser enviada ao navegador. A chave secreta/service role deve permanecer somente no servidor e nunca deve ser versionada.

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Abra [http://localhost:3000](http://localhost:3000). A rota inicial direciona para `/login`; use `/signup` para criar a primeira conta e seguir o onboarding de criação da empresa.

O servidor usa Turbopack e recarrega a aplicação enquanto os arquivos são alterados. Para encerrar os serviços locais do Supabase sem apagar o banco, execute `npx supabase stop`.

## Problemas comuns de configuração

### A stack do Supabase não inicia

Confirme que o Docker Desktop, Podman ou outro runtime compatível está instalado e em execução. Na primeira inicialização, a CLI também precisa baixar as imagens dos serviços, portanto o processo pode demorar mais e exige acesso à internet.

### A aplicação informa erro de URL ou chave do Supabase

Execute `npx supabase status`, atualize as três variáveis Supabase em `.env.local` e reinicie `npm run dev`. O Next.js lê essas variáveis ao iniciar o processo. Não substitua `SUPABASE_SERVICE_ROLE_KEY` por uma chave pública.

### O login redireciona para a porta errada

O projeto local está configurado para `http://127.0.0.1:3000` no Supabase e para `http://localhost:3000` na aplicação. Se a porta `3000` já estiver ocupada, libere-a antes de iniciar o Next.js; aceitar automaticamente outra porta pode invalidar os redirecionamentos de autenticação.

### Uma porta do Supabase já está em uso

Encerre outra stack local com `npx supabase stop` ou libere o processo que ocupa as portas `54320` a `54324` ou `54327`. Se alterar portas em `supabase/config.toml`, atualize também `NEXT_PUBLIC_SUPABASE_URL` e qualquer configuração de teste que dependa desses endereços.

### O schema local ficou desatualizado

Reconstrua o banco a partir das migrações com:

```bash
npm run db:local:reset
```

Esse comando apaga os dados locais. Preserve manualmente qualquer dado de desenvolvimento necessário antes de executá-lo.

## Próximos passos

- Consulte o [guia de desenvolvimento](development.md) para comandos, padrões de código e fluxo de contribuição local.
- Consulte o [guia de testes](../testing/overview.md) para executar Vitest, Playwright e as suítes especializadas.
- Consulte a [referência de configuração](../configuration/reference.md) para todas as variáveis de ambiente e seus padrões.
- Consulte a [arquitetura](../architecture.md) para entender os componentes, limites e fluxos de dados do sistema.
