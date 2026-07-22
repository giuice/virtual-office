<!-- generated-by: gsd-doc-writer -->
# Referência da API HTTP

Esta referência descreve os Route Handlers internos do Virtual Office em `src/app/api`. As rotas são consumidas pela própria aplicação Next.js, não formam uma API pública versionada e não possuem uma especificação OpenAPI no repositório. Os caminhos abaixo são relativos à origem em que a aplicação está em execução.

<!-- VERIFY: registrar a URL base de cada ambiente implantado; o repositório define apenas rotas relativas e fallbacks locais -->

## Autenticação

A API usa a sessão do Supabase Auth armazenada em cookies. Em cada requisição protegida, `createSupabaseServerClient()` lê os cookies do App Router e `supabase.auth.getUser()` valida o JWT no servidor. Não há suporte explícito a API key ou a um header `Authorization: Bearer` nos handlers desta referência.

Depois da validação, `requireAuthUser()` resolve o perfil da aplicação por `users.supabase_uid`. O UID do Supabase Auth e `users.id` são identificadores diferentes: o primeiro identifica a conta autenticada e o segundo é usado nas chaves estrangeiras da aplicação. Algumas operações ainda exigem papel `admin`, acesso de platform admin, pertencimento à mesma empresa, participação na conversa ou uma sessão de presença válida.

Para clientes web, autentique-se pelo fluxo Supabase da aplicação e preserve os cookies nas chamadas para `/api/*`:

```ts
const response = await fetch('/api/spaces?companyId=<uuid>', {
  credentials: 'same-origin',
});
```

As exceções são:

- `GET /api/auth/callback`, chamado pelo redirecionamento OAuth/PKCE e respondido com outro redirecionamento;
- `GET /api/invitations/validate`, que valida um token sem exigir sessão;
- `/api/test/messaging/seed`, disponível somente fora de produção e protegido pelo header `x-test-secret`, cujo valor vem de `PLAYWRIGHT_TEST_SECRET`;
- `GET /api/messages/attachment/[id]`, que exige sessão e participação na conversa e, quando autorizado, redireciona para uma URL assinada temporária do Storage.

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY` é usada somente no servidor. Ela não é uma credencial de cliente e nunca deve ser enviada em cookies, headers ou payloads.

## Visão geral dos endpoints

### Autenticação e empresas

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `GET` | `/api/auth/callback` | Troca o código de autenticação por sessão e redireciona para a próxima tela segura. | Não |
| `POST` | `/api/companies/create` | Cria uma empresa para o usuário atual e o torna administrador. | Sessão |
| `GET` | `/api/companies/get?id={companyId}` | Obtém a empresa indicada, limitada à empresa do usuário atual. | Sessão + mesma empresa |
| `PATCH` | `/api/companies/update?id={companyId}` | Atualiza nome e/ou configurações da empresa. | Sessão + admin da empresa |
| `POST` | `/api/platform-admin/create-company` | Cria empresa e convite para o primeiro administrador. | Sessão + platform admin |

### Usuários

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `GET` | `/api/users/list` | Lista os usuários da empresa do solicitante. | Sessão |
| `GET` | `/api/users/by-company?companyId={companyId}` | Lista usuários da empresa informada, com isolamento por empresa. | Sessão + mesma empresa |
| `GET` | `/api/users/get?id={userId}` | Obtém um usuário pelo UUID da aplicação. | Sessão + mesma empresa |
| `GET` | `/api/users/get-by-id?supabase_uid={uid}` | Obtém o próprio perfil pelo UID do Supabase e inclui o nome da empresa. | Sessão + próprio UID |
| `POST` | `/api/users/sync-profile` | Cria ou sincroniza o perfil autenticado com e-mail e nome de exibição. | Sessão + próprio UID |
| `PATCH` | `/api/users/update?id={userId}` | Atualiza o próprio perfil ou, para admins, o papel de outro membro. | Sessão; admin para outro usuário |
| `POST` | `/api/users/remove-from-company` | Remove um membro da empresa e encerra o estado de presença relacionado. | Sessão + admin da empresa |
| `POST` | `/api/users/avatar` | Envia, redimensiona e associa o avatar do usuário atual. | Sessão |
| `POST` | `/api/users/avatar/remove` | Remove o avatar do usuário atual. | Sessão |
| `PUT` | `/api/users/location` | Executa a escrita legada e controlada de localização/disponibilidade. | Sessão + regras de acesso |
| `POST` | `/api/users/location` | Mesmo contrato legado de `PUT`; mantido por compatibilidade. | Sessão + regras de acesso |

Novos fluxos de movimento devem usar `POST /api/presence/location`; `/api/users/location` é um writer legado protegido por gate de compatibilidade.

### Convites

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `GET` | `/api/invitations/validate?token={token}` | Valida token, expiração e situação do convite. | Não |
| `GET` | `/api/invitations/pending` | Busca o convite pendente associado ao e-mail autenticado. | Sessão |
| `GET` | `/api/invitations/list?companyId={companyId}&status={status}` | Lista convites da empresa; `status` aceita `pending`, `accepted` ou `expired`. | Sessão + admin da empresa |
| `POST` | `/api/invitations/create` | Cria ou reutiliza um convite para `email`, `role` e `companyId`. | Sessão + admin da empresa |
| `POST` | `/api/invitations/accept` | Aceita um convite pelo token para a conta autenticada. | Sessão |
| `POST` | `/api/invitations/resend` | Renova o token e a expiração de um convite pendente. | Sessão + admin da empresa |
| `POST` | `/api/invitations/revoke` | Revoga um convite. | Sessão + admin da empresa |

### Espaços e bairros

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `GET` | `/api/spaces?companyId={companyId}` | Lista os espaços da empresa. | Sessão + mesma empresa |
| `POST` | `/api/spaces` | Cria um espaço na empresa do usuário. | Sessão + mesma empresa |
| `PUT` | `/api/spaces` | Atualiza um espaço; o UUID é enviado como `id` no corpo. | Sessão + mesma empresa |
| `DELETE` | `/api/spaces?id={spaceId}` | Exclui um espaço não referenciado. Também aceita `spaceId` como query param. | Sessão + mesma empresa |
| `GET` | `/api/spaces/[id]/details` | Obtém detalhes e ocupantes de um espaço acessível. | Sessão + mesma empresa/acesso |
| `PATCH` | `/api/spaces/[id]/neighborhood` | Associa ou remove o bairro de um espaço. | Sessão + admin da empresa |
| `GET` | `/api/neighborhoods` | Lista bairros da empresa com contagem de espaços. | Sessão |
| `POST` | `/api/neighborhoods` | Cria um bairro. | Sessão + admin da empresa |
| `GET` | `/api/neighborhoods/[id]` | Obtém um bairro com sua contagem de espaços. | Sessão + mesma empresa |
| `PUT` | `/api/neighborhoods/[id]` | Atualiza nome, descrição ou cor de um bairro. | Sessão + admin da empresa |
| `DELETE` | `/api/neighborhoods/[id]` | Exclui um bairro. | Sessão + admin da empresa |
| `POST` | `/api/neighborhoods/[id]/spaces` | Associa em lote os `spaceIds` ao bairro. | Sessão + admin da empresa |
| `DELETE` | `/api/neighborhoods/[id]/spaces` | Remove todos os espaços associados ao bairro. | Sessão + admin da empresa |

### Presença e Knock

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `POST` | `/api/presence/sessions` | Registra ou renova idempotentemente uma sessão de presença. | Sessão verificada |
| `POST` | `/api/presence/sessions/[sessionId]/heartbeat` | Renova o lease de uma sessão de presença ativa. | Sessão verificada + dono da sessão |
| `POST` | `/api/presence/sessions/[sessionId]/disconnect` | Encerra uma sessão de presença. | Sessão verificada + dono da sessão |
| `GET` | `/api/presence/snapshot` | Retorna o snapshot autoritativo de presença da empresa. | Sessão verificada |
| `POST` | `/api/presence/location` | Executa uma transição atômica e idempotente entre espaços. | Sessão verificada + sessão de presença |
| `POST` | `/api/presence/logout` | Encerra presença e limpa a localização no logout. | Sessão verificada ou contexto de logout revogado |
| `POST` | `/api/spaces/knock/request` | Solicita entrada em um espaço privado. | Sessão verificada + sessão de presença |
| `POST` | `/api/spaces/knock/respond` | Aprova ou nega uma solicitação de entrada. | Sessão verificada + autorização para responder |
| `GET` | `/api/spaces/knock/status/[requestId]?sessionId={sessionId}` | Consulta o estado de uma solicitação de entrada. | Sessão verificada + sessão de presença |
| `GET` | `/api/spaces/knock/pending?sessionId={sessionId}&spaceId={spaceId}` | Lista solicitações pendentes destinadas ao espaço. | Sessão verificada + sessão de presença |

### Conversas e mensagens

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `GET` | `/api/conversations/get` | Lista conversas com filtros e paginação por cursor. | Sessão |
| `POST` | `/api/conversations/resolve` | Localiza ou cria uma conversa `direct` por `userId` ou `room` por `roomId`. | Sessão + acesso ao destino |
| `POST` | `/api/conversations/join` | Adiciona o usuário a uma conversa acessível. | Sessão |
| `PATCH` | `/api/conversations/read` | Marca uma conversa como lida pelo usuário atual. | Sessão + participante |
| `GET` | `/api/conversations/preferences?conversationId={id}` | Obtém preferências pessoais da conversa. | Sessão + participante |
| `PATCH` | `/api/conversations/preferences` | Atualiza pin, ordem, estrela ou notificações da conversa. | Sessão + participante |
| `PATCH` | `/api/conversations/archive` | Arquiva ou desarquiva a conversa para o usuário atual. | Sessão + participante |
| `GET` | `/api/messages/get?conversationId={id}` | Lista mensagens com paginação `cursorBefore`/`cursorAfter`. | Sessão + participante |
| `POST` | `/api/messages/create` | Cria uma mensagem de até 8.192 caracteres. | Sessão + participante |
| `POST` | `/api/messages/react` | Alterna a reação `emoji` do usuário na mensagem. | Sessão + participante |
| `POST` | `/api/messages/[messageId]/pin` | Fixa uma mensagem. | Sessão + participante |
| `DELETE` | `/api/messages/[messageId]/pin` | Remove a fixação da mensagem. | Sessão + participante |
| `POST` | `/api/messages/[messageId]/star` | Marca uma mensagem com estrela para o usuário. | Sessão + participante |
| `DELETE` | `/api/messages/[messageId]/star` | Remove a estrela da mensagem. | Sessão + participante |
| `POST` | `/api/messages/upload` | Envia um anexo e, opcionalmente, o vincula a uma mensagem. | Sessão + participante |
| `GET` | `/api/messages/attachments?messageId={id}` | Lista os anexos autorizados de uma mensagem. | Sessão + participante |
| `GET` | `/api/messages/attachment/[id]` | Redireciona para uma URL assinada do anexo privado. | Sessão + participante |
| `DELETE` | `/api/messages/attachment/[id]` | Exclui o anexo se o usuário for seu remetente. | Sessão + participante/remetente |

`GET /api/conversations/get` aceita `type=direct|room`, `includeArchived=true`, `pinned=true`, `limit` de 1 a 100 e `cursor`. `GET /api/messages/get` usa `limit` de 1 a 100, com padrão 20, e não permite combinar `cursorBefore` e `cursorAfter`.

### Suporte a testes

| Método | Caminho | Descrição | Autenticação exigida |
| --- | --- | --- | --- |
| `POST` | `/api/test/messaging/seed` | Provisiona dados para cenários Playwright. Retorna `404` em produção. | `x-test-secret` |
| `DELETE` | `/api/test/messaging/seed` | Limpa os dados de teste indicados no corpo. Retorna `404` em produção. | `x-test-secret` |

Essa rota usa `service_role` e existe exclusivamente para automação. Não a exponha como ferramenta administrativa.

## Formatos de requisição e resposta

### JSON

A maioria das operações recebe e devolve `application/json`. Não existe um envelope único em todas as rotas: endpoints mais novos normalmente retornam objetos com `success`, `code` e o recurso; endpoints legados podem retornar diretamente o recurso ou usar `message` no lugar de `error`.

Exemplo de criação de empresa:

```json
{
  "name": "Acme Remota",
  "settings": {
    "allowGuestAccess": false,
    "maxRooms": 20,
    "theme": "neon"
  }
}
```

Resultado `201 Created`:

```json
{
  "success": true,
  "code": "COMPANY_CREATED",
  "company": {
    "id": "<uuid>",
    "name": "Acme Remota",
    "adminIds": ["<user-id>"],
    "settings": {
      "allowGuestAccess": false,
      "maxRooms": 20,
      "theme": "neon"
    },
    "createdAt": "<timestamp ISO 8601>"
  },
  "message": "Company created successfully"
}
```

Exemplo de mensagem:

```json
{
  "conversationId": "<uuid>",
  "content": "Bom dia, equipe!",
  "type": "text",
  "replyToId": null
}
```

Resultado `201 Created`:

```json
{
  "message": {
    "id": "<uuid>",
    "conversationId": "<uuid>",
    "content": "Bom dia, equipe!",
    "status": "sent"
  }
}
```

O servidor ignora um `status` enviado pelo cliente, normaliza o conteúdo com `trim()` e valida que `replyToId`, quando presente, pertence à mesma conversa.

### Contratos de presença

O registro de sessão recebe dois UUIDs:

```json
{
  "registrationId": "<uuid-idempotente-do-cliente>",
  "expectedCompanyId": "<company-uuid>"
}
```

Uma transição de localização usa o contrato estrito abaixo. `spaceId: null` representa saída do espaço, e a combinação dos campos é validada conforme `reason`.

```json
{
  "sessionId": "<presence-session-uuid>",
  "transitionId": "<uuid-idempotente>",
  "spaceId": "<space-uuid-ou-null>",
  "reason": "manual",
  "knockRequestId": null,
  "expectedLocationVersion": 12
}
```

Em sucesso, `POST /api/presence/location` devolve:

```json
{
  "success": true,
  "code": "LOCATION_UPDATED",
  "transitionId": "<uuid>",
  "previousSpaceId": null,
  "currentSpaceId": "<space-uuid>",
  "locationVersion": 13,
  "alreadyApplied": false
}
```

Os valores aceitos para `reason` são definidos em `src/lib/presence/transition-contract.ts`; clientes devem reutilizar esse contrato em vez de enviar strings livres.

### Uploads multipart

`POST /api/users/avatar` espera `multipart/form-data` com o campo `avatar`. Aceita JPEG, PNG, WebP ou GIF de até 5 MB; a imagem é redimensionada para no máximo 800 px por dimensão e processada visando até 1 MB.

`POST /api/messages/upload` espera:

| Campo | Obrigatório | Descrição |
| --- | --- | --- |
| `file` | Sim | JPEG, PNG, GIF, WebP, PDF, texto, Word ou Excel, até 10 MB. |
| `conversationId` | Sim | Conversa da qual o solicitante participa. |
| `messageId` | Não | Mensagem da mesma conversa à qual o anexo será associado. |

```ts
const form = new FormData();
form.set('file', file);
form.set('conversationId', conversationId);

const response = await fetch('/api/messages/upload', {
  method: 'POST',
  body: form,
  credentials: 'same-origin',
});
```

Não defina manualmente o header `Content-Type`: o runtime precisa acrescentar o boundary do `FormData`.

### Redirecionamentos e correlação

`GET /api/auth/callback` e `GET /api/messages/attachment/[id]` respondem com redirecionamento, não com JSON. Algumas rotas novas incluem `x-correlation-id` no header; quando o erro foi criado por `jsonError()`, o mesmo identificador também pode aparecer no corpo.

## Códigos de erro

O contrato compartilhado de erro é:

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED",
  "correlationId": "<uuid-opcional>"
}
```

Rotas legadas também podem responder com `{ "message": "..." }` ou com campos específicos do domínio. O consumidor deve usar primeiro o status HTTP e `code`, quando presente, e tratar a mensagem como texto para exibição ou diagnóstico.

| Status | Significado no projeto |
| --- | --- |
| `400 Bad Request` | JSON inválido, campo obrigatório ausente, UUID/formato inválido ou combinação de campos incompatível. |
| `401 Unauthorized` | Cookie ausente/inválido, JWT rejeitado ou sessão de autenticação revogada. |
| `403 Forbidden` | Usuário autenticado sem papel, empresa, participação ou acesso ao espaço necessário. |
| `404 Not Found` | Recurso inexistente ou não visível ao solicitante. |
| `409 Conflict` | Estado concorrente ou incompatível, como espaço em uso, sessão inválida, transição supersedida ou operação idempotente conflitante. |
| `410 Gone` | Convite ou solicitação de Knock expirou e não pode mais ser usada. |
| `413 Content Too Large` | Mensagem acima de 8.192 caracteres ou anexo acima de 10 MB. |
| `415 Unsupported Media Type` | Tipo MIME do anexo não permitido. |
| `426 Upgrade Required` | O contrato de banco exigido pelo subsistema de presença não está disponível/compatível. |
| `429 Too Many Requests` | Limite de autenticação, mensagem, reação, upload ou Knock excedido. |
| `500 Internal Server Error` | Falha inesperada, de repositório, Storage ou RPC. |
| `503 Service Unavailable` | Dependência temporariamente indisponível ou contenção transitória no fluxo de presença. |

Erros de transição de presença acrescentam `success: false`, `retryable` e `transitionId`, por exemplo:

```json
{
  "success": false,
  "code": "SPACE_FULL",
  "message": "Space is full",
  "retryable": false,
  "transitionId": "<uuid>"
}
```

## Limites de requisição

As mutações de mensagens usam contadores por `users.id` em janelas fixas compartilhadas no Postgres:

| Operação | Limite | Janela |
| --- | --- | --- |
| `POST /api/messages/create` | 30 requisições | 60 segundos |
| `POST /api/messages/react` | 60 requisições | 60 segundos |
| `POST /api/messages/upload` | 10 requisições | 60 segundos |

Quando o limite é excedido, a resposta é `429` com `code: "rate_limited"`. Se a RPC `check_rate_limit` falhar, essas três rotas registram o problema e permitem a operação; portanto, a disponibilidade do banco faz parte da efetividade desse controle.

O fluxo de Knock também pode responder `429` com `code: "KNOCK_RATE_LIMITED"` e um header `Retry-After` calculado pelo contrato do banco. Uma contenção transitória de locks pode responder `503` com `Retry-After: 1`.

<!-- VERIFY: documentar os valores e a janela efetivos do rate limit de Knock no ambiente implantado; eles são devolvidos pela RPC e não estão fixados no Route Handler -->

Não foi detectado middleware global de rate limiting para todas as rotas. O Supabase Auth pode devolver `429`; nesse caso, `requireAuthUser()` propaga `RATE_LIMITED` com a mensagem `Authentication service rate limit reached`.
