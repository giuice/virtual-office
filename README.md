<!-- generated-by: gsd-doc-writer -->
# Virtual Office

![Versao](https://img.shields.io/badge/vers%C3%A3o-0.1.0-blue)

Workspace digital para equipes remotas organizarem empresas, salas, presen&ccedil;a e conversas em tempo real em uma planta de escrit&oacute;rio compartilhada.

## Principais recursos

- Autentica&ccedil;&atilde;o por e-mail/senha e Google com Supabase Auth.
- Cria&ccedil;&atilde;o de empresas, convites e administra&ccedil;&atilde;o de integrantes.
- Planta virtual com bairros, salas, capacidade e controle de acesso a espa&ccedil;os privados.
- Presen&ccedil;a em tempo real, movimenta&ccedil;&atilde;o entre salas e solicita&ccedil;&otilde;es de entrada (Knock).
- Conversas diretas e por sala com anexos, rea&ccedil;&otilde;es, favoritos e mensagens fixadas.
- Interface responsiva constru&iacute;da com Next.js, React, Tailwind CSS e componentes Radix UI.

## Instala&ccedil;&atilde;o

Clone o reposit&oacute;rio e instale as depend&ecirc;ncias com npm:

```bash
git clone https://github.com/giuice/virtual-office.git
cd virtual-office
npm install
```

## In&iacute;cio r&aacute;pido

1. Inicie o Supabase local e aplique as migra&ccedil;&otilde;es versionadas:

   ```bash
   npm run db:local:start
   npm run db:local:reset
   ```

2. Crie `.env.local` com os valores exibidos pelo Supabase local. A chave de servi&ccedil;o deve permanecer apenas no servidor:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-local>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key-local>
   ```

3. Inicie a aplica&ccedil;&atilde;o:

   ```bash
   npm run dev
   ```

4. Acesse [http://localhost:3000](http://localhost:3000). A p&aacute;gina inicial redireciona para o login.

## Exemplos de uso

### Criar um escrit&oacute;rio

1. Acesse `/signup` e crie uma conta.
2. Conclua o onboarding criando uma empresa.
3. Ao terminar, a aplica&ccedil;&atilde;o abre `/floor-plan`, onde o escrit&oacute;rio pode ser organizado em bairros e salas.

### Trabalhar em uma sala

Na planta, selecione uma sala e entre nela. Sua posi&ccedil;&atilde;o passa a aparecer para os demais integrantes conectados; em uma sala privada, o acesso pode exigir uma solicita&ccedil;&atilde;o de entrada ao ocupante.

### Conversar com a equipe

Abra o chat de uma sala ou selecione o avatar de uma pessoa para iniciar uma conversa direta. Novas mensagens, rea&ccedil;&otilde;es, indicadores de digita&ccedil;&atilde;o e confirma&ccedil;&otilde;es de leitura s&atilde;o atualizados em tempo real.

## Comandos &uacute;teis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento com Turbopack. |
| `npm run build` | Gera o build de produ&ccedil;&atilde;o. |
| `npm run type-check` | Valida os tipos TypeScript sem gerar arquivos. |
| `npm run lint` | Executa o ESLint no projeto. |
| `npm test` | Executa a su&iacute;te Vitest. |
| `npm run test:api` | Executa os testes Playwright. |

## Licen&ccedil;a

O projeto &eacute; privado e n&atilde;o declara uma licen&ccedil;a de distribui&ccedil;&atilde;o em `package.json` nem possui um arquivo `LICENSE`.
