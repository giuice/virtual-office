# Guia de Desenvolvimento: Login, Signin e Invites com Supabase Auth

## Visão Geral

Este guia fornece uma implementação completa para autenticação de usuários usando Supabase Auth em aplicações Next.js. O Supabase Auth oferece recursos robustos de autenticação, incluindo registro, login, redefinição de senha e convites, com suporte a Row Level Security (RLS) para controle de acesso aos dados.

## Conceitos Explicados (Técnica Feynman)

Para garantir que entendemos profundamente o que estamos construindo, aqui estão os conceitos principais explicados de forma simples, como se estivéssemos ensinando a uma criança de 12 anos.

### 1. Supabase Auth: O Segurança da Balada
Imagine que seu aplicativo é uma festa exclusiva. O **Supabase Auth** é o segurança na porta.
- **Sign Up**: É quando você coloca seu nome na lista VIP pela primeira vez.
- **Sign In**: É quando você chega na festa, mostra sua identidade (email/senha) e o segurança deixa você entrar.
- **Token (JWT)**: É a pulseirinha que o segurança coloca no seu braço. Enquanto você estiver com ela, pode entrar e sair, pedir bebidas e dançar sem ter que mostrar a identidade de novo a cada 5 minutos.

### 2. Client vs Server: O Restaurante
- **Client (Navegador)**: É a mesa onde o cliente senta. Ele pode ver o cardápio e pedir pratos, mas não pode entrar na cozinha. Se ele tentar cozinhar, vai fazer bagunça.
- **Server (API/Backend)**: É a cozinha. É lá que os ingredientes (dados) são guardados e preparados. Só os cozinheiros (código do servidor) podem mexer nas facas afiadas (banco de dados direto).
- **Por que separamos?**: Para segurança. Se deixarmos a faca na mesa do cliente, alguém pode se machucar. Por isso usamos `createSupabaseServerClient` na cozinha e `createSupabaseBrowserClient` na mesa.

### 3. Middleware: O Monitor do Corredor
O **Middleware** é como um monitor que fica no corredor da escola. Antes de você entrar em qualquer sala (página), ele te para e pergunta: "Cadê seu crachá?".
- Se você tem o crachá (está logado), ele deixa passar.
- Se não tem, ele te manda para a diretoria (página de login).
- Ele faz isso *antes* de você sequer tocar na maçaneta da porta. É a primeira linha de defesa.

### 4. RLS (Row Level Security): O Diário Pessoal
Imagine uma estante cheia de diários na biblioteca da escola.
- Sem RLS, qualquer um poderia pegar qualquer diário e ler os segredos de todo mundo.
- **Com RLS**, cada diário tem um cadeado mágico.
- Quando você tenta abrir um diário, o cadeado verifica sua "assinatura mágica" (seu User ID).
- Se o diário é seu, ele abre. Se é do colega, ele continua trancado e parece até que nem existe.
- Isso acontece *dentro* do banco de dados. Mesmo que o programador esqueça de filtrar os dados no código, o banco de dados não deixa vazar nada.

## Configuração Inicial

### ⚠️ SEGURANÇA CRÍTICA: getSession() vs getUser()

> **Esta é uma das fontes mais comuns de vulnerabilidades em apps Supabase.**

| Método | Onde Usar | Segurança | Performance |
|--------|-----------|-----------|-------------|
| `getSession()` | **Cliente** (browser) | ⚠️ Dados do storage local | ⚡ Rápido |
| `getUser()` | **Servidor** (API routes, Server Actions) | ✅ Valida JWT no servidor Auth | 🐢 Network request |

**Regras de Ouro:**

1. **No SERVIDOR** (API Routes, Server Actions, Server Components):
   - ✅ SEMPRE use `getUser()` para verificar autorização
   - ❌ NUNCA confie em `getSession()` para decisões de segurança

2. **No CLIENTE** (React Components no browser):
   - ✅ `getSession()` é OK para UX (mostrar nome, avatar)
   - ✅ `onAuthStateChange()` para reagir a mudanças de estado

3. **No MIDDLEWARE**:
   - ✅ `getSession()` é aceitável para refresh de tokens
   - ⚠️ Não faça decisões de autorização críticas apenas no middleware

```typescript
// ❌ ERRADO - Server Action confiando em getSession
'use server'
export async function dangerousAction() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) { /* INSEGURO! */ }
}

// ✅ CORRETO - Server Action usando getUser
'use server'
export async function safeAction() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: 'Não autorizado' }
  }
  // Agora é seguro usar user.id para operações
}
```

### 1. Instalação das Dependências

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 2. Configuração do Cliente Supabase

#### Cliente do Lado do Servidor (API Routes e Server Components)

```typescript
// src/lib/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // O método setAll foi chamado de um Server Component.
            // Isso pode ser ignorado se você tiver middleware atualizando
            // as sessões do usuário.
          }
        },
      },
    }
  )
}
```

#### Cliente do Lado do Cliente (Client Components)

```typescript
// src/lib/supabase/browser-client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 3. Variáveis de Ambiente

```env
# Configurações básicas
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Configurações específicas do ambiente
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Validação de Formulários

### Utilitários de Validação

```typescript
// src/lib/validation/auth.ts
export const validateEmail = (email: string): string[] => {
  const errors = []
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!email) {
    errors.push('Email é obrigatório')
  } else if (!emailRegex.test(email)) {
    errors.push('Formato de email inválido')
  }

  return errors
}

export const validatePassword = (password: string): string[] => {
  const errors = []

  if (!password) {
    errors.push('Senha é obrigatória')
  } else {
    if (password.length < 8) errors.push('Mínimo 8 caracteres')
    if (!/[A-Z]/.test(password)) errors.push('Pelo menos uma letra maiúscula')
    if (!/[a-z]/.test(password)) errors.push('Pelo menos uma letra minúscula')
    if (!/\d/.test(password)) errors.push('Pelo menos um número')
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Pelo menos um caractere especial')
    }
  }

  return errors
}

export const validatePasswordConfirmation = (password: string, confirmPassword: string): string[] => {
  const errors = []

  if (password !== confirmPassword) {
    errors.push('As senhas não coincidem')
  }

  return errors
}
```

## Registro de Usuários (Sign Up)

### Implementação Básica com Validação

```typescript
// src/app/auth/signup/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { validateEmail, validatePassword } from '@/lib/validation/auth'

export default function SignUpPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const supabase = createSupabaseBrowserClient()

  const validateForm = () => {
    const newErrors: Record<string, string[]> = {
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
      confirmPassword: validatePasswordConfirmation(formData.password, formData.confirmPassword)
    }

    setErrors(newErrors)
    return Object.values(newErrors).every(fieldErrors => fieldErrors.length === 0)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: '',
            last_name: '',
          }
        }
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
        return
      }

      if (data.user && !data.session) {
        // TODO: Substituir por componente de Toast/Notificação
        console.log('Verifique seu email para confirmar a conta!')
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    // Limpar erros do campo quando usuário começa a digitar
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: [] }))
    }
  }

  return (
    <form onSubmit={handleSignUp} className="space-y-4">
      {/* aria-live para anunciar erros a leitores de tela */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {errors.general?.join('. ')}
      </div>
      <div>
        <input
          type="email"
          value={formData.email}
          onChange={handleInputChange('email')}
          placeholder="Email"
          required
          className="w-full p-2 border rounded"
          aria-describedby="email-error"
        />
        {errors.email?.map((error, index) => (
          <p key={index} id="email-error" className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <input
          type="password"
          value={formData.password}
          onChange={handleInputChange('password')}
          placeholder="Senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.password?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <input
          type="password"
          value={formData.confirmPassword}
          onChange={handleInputChange('confirmPassword')}
          placeholder="Confirmar Senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.confirmPassword?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Registrando...' : 'Registrar'}
      </button>
    </form>
  )
}
```

### Configurações de Confirmação de Email

No painel do Supabase, configure:
- **Confirm email**: Ativado para produção
- **SITE_URL**: URL do seu domínio para redirecionamento após confirmação
- **SMTP Settings**: Configure SMTP customizado para melhor deliverability

## Login de Usuários (Sign In)

### Login com Email e Senha

```typescript
// src/app/auth/signin/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { validateEmail } from '@/lib/validation/auth'

export default function SignInPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const supabase = createSupabaseBrowserClient()

  const validateForm = () => {
    const newErrors: Record<string, string[]> = {
      email: validateEmail(formData.email),
      password: formData.password ? [] : ['Senha é obrigatória']
    }

    setErrors(newErrors)
    return Object.values(newErrors).every(fieldErrors => fieldErrors.length === 0)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
        return
      }

      router.push('/dashboard')
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: [] }))
    }
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      {/* aria-live para anunciar erros a leitores de tela */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {errors.general?.join('. ')}
      </div>
      <div>
        <input
          type="email"
          value={formData.email}
          onChange={handleInputChange('email')}
          placeholder="Email"
          required
          className="w-full p-2 border rounded"
          aria-describedby="signin-email-error"
        />
        {errors.email?.map((error, index) => (
          <p key={index} id="signin-email-error" className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <input
          type="password"
          value={formData.password}
          onChange={handleInputChange('password')}
          placeholder="Senha"
          required
          className="w-full p-2 border rounded"
          aria-describedby="signin-password-error"
        />
        {errors.password?.map((error, index) => (
          <p key={index} id="signin-password-error" className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500" role="alert">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

### Login sem Senha (Magic Link)

```typescript
const handleMagicLink = async () => {
  const emailErrors = validateEmail(formData.email)
  if (emailErrors.length > 0) {
    setErrors({ email: emailErrors })
    return
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email: formData.email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) {
    setErrors({ general: [handleAuthError(error)] })
  } else {
    // TODO: Substituir por Toast notification de sucesso
    // Exemplo: toast.success('Verifique seu email para o link de login!')
    console.log('Verifique seu email para o link de login!')
  }
}
```

## Tratamento de Erros Detalhado

```typescript
// src/lib/auth/errors.ts
import { AuthError } from '@supabase/supabase-js'

export const handleAuthError = (error: AuthError): string => {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Credenciais inválidas. Verifique email e senha.'
    case 'Email not confirmed':
      return 'Confirme seu email antes de fazer login.'
    case 'Too many requests':
      return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
    case 'User already registered':
      return 'Este email já está cadastrado. Tente fazer login.'
    case 'Password should be at least 6 characters':
      return 'A senha deve ter pelo menos 6 caracteres.'
    case 'Unable to validate email address: invalid format':
      return 'Formato de email inválido.'
    case 'Signup is disabled':
      return 'Novos cadastros estão temporariamente desabilitados.'
    case 'Email link is invalid or has expired':
      return 'O link de email é inválido ou expirou.'
    default:
      console.error('Erro de auth não tratado:', error)
      return 'Erro de autenticação. Tente novamente ou entre em contato com o suporte.'
  }
}
```

## Redefinição de Senha

### Envio do Email de Redefinição

```typescript
// src/app/auth/forgot-password/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { validateEmail, handleAuthError } from '@/lib/validation/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    const emailErrors = validateEmail(email)
    if (emailErrors.length > 0) {
      setErrors({ email: emailErrors })
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
      } else {
        setSuccess(true)
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-4">Email Enviado!</h2>
        <p>Verifique sua caixa de entrada e clique no link para redefinir sua senha.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 text-blue-500 underline"
        >
          Enviar outro email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleResetPassword} className="space-y-4">
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors({})
          }}
          placeholder="Email"
          required
          className="w-full p-2 border rounded"
        />
        {errors.email?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Enviando...' : 'Enviar Email de Redefinição'}
      </button>
    </form>
  )
}
```

### Página de Atualização de Senha

```typescript
// src/app/auth/reset-password/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { validatePassword, handleAuthError } from '@/lib/validation/auth'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    // Verificar se estamos em um fluxo de recuperação de senha
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          // Usuário autenticado via link de redefinição
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  const validateForm = () => {
    const newErrors: Record<string, string[]> = {
      password: validatePassword(password),
      confirmPassword: password !== confirmPassword ? ['As senhas não coincidem'] : []
    }

    setErrors(newErrors)
    return Object.values(newErrors).every(fieldErrors => fieldErrors.length === 0)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
      } else {
        // TODO: Substituir por Toast notification de sucesso
        console.log('Senha atualizada com sucesso!')
        router.push('/dashboard')
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleUpdatePassword} className="space-y-4">
      {/* aria-live para anunciar erros a leitores de tela */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {errors.general?.join('. ')}
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors({})
          }}
          placeholder="Nova Senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.password?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            setErrors({})
          }}
          placeholder="Confirmar Nova Senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.confirmPassword?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Atualizando...' : 'Atualizar Senha'}
      </button>
    </form>
  )
}
```

## Sistema de Convites

### Envio de Convites (Admin)

```typescript
// src/app/admin/invitations/page.tsx
'use client'

import { useState } from 'react'
import { validateEmail } from '@/lib/validation/auth'
import { inviteUserAction } from '@/app/actions/auth' // Server Action

export default function InvitationsPage() {
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()

    const emailErrors = validateEmail(email)
    if (emailErrors.length > 0) {
      setErrors({ email: emailErrors })
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const result = await inviteUserAction(email)

      if (result.error) {
        setErrors({ general: [result.error] })
      } else {
        setSuccess(true)
        setEmail('')
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-4">Convite Enviado!</h2>
        <p>O convite foi enviado para {email}</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 text-blue-500 underline"
        >
          Enviar outro convite
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleInvite} className="space-y-4">
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors({})
          }}
          placeholder="Email do convidado"
          required
          className="w-full p-2 border rounded"
        />
        {errors.email?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Enviando...' : 'Enviar Convite'}
      </button>
    </form>
  )
}
```

### Server Action para Convites (Admin)

```typescript
// src/app/actions/auth.ts
'use server'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server-client'

export async function inviteUserAction(email: string) {
  const supabase = await createSupabaseServerClient()
  
  // Verificar se o usuário atual é admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: 'Usuário não autenticado' }
  }

  // Verificar role no banco de dados
  const { data: userRole } = await supabase
    .from('users')
    .select('role')
    .eq('supabase_uid', user.id)
    .single()

  if (userRole?.role !== 'admin') {
    return { error: 'Acesso negado: Apenas administradores podem enviar convites.' }
  }
  
  // Inicializar cliente com service_role para operações administrativas
  // CUIDADO: Nunca exponha a service_role key no cliente
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept-invite`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
```

### Aceitação de Convites

```typescript
// src/app/auth/accept-invite/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { validatePassword, handleAuthError } from '@/lib/validation/auth'

export default function AcceptInvitePage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    // Verificar se há um token de convite na URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    if (accessToken && refreshToken) {
      // Usuário clicou no link do convite - definir sessão
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).catch(error => {
        console.error('Erro ao definir sessão:', error)
        setErrors({ general: ['Link de convite inválido ou expirado.'] })
      })
    } else {
      setErrors({ general: ['Link de convite inválido.'] })
    }
  }, [supabase])

  const validateForm = () => {
    const newErrors: Record<string, string[]> = {
      password: validatePassword(password),
      confirmPassword: password !== confirmPassword ? ['As senhas não coincidem'] : []
    }

    setErrors(newErrors)
    return Object.values(newErrors).every(fieldErrors => fieldErrors.length === 0)
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
      } else {
        // TODO: Substituir por Toast notification de sucesso
        console.log('Conta configurada com sucesso!')
        router.push('/dashboard')
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSetPassword} className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">Configure sua senha</h2>

      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors({})
          }}
          placeholder="Defina sua senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.password?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            setErrors({})
          }}
          placeholder="Confirme sua senha"
          required
          className="w-full p-2 border rounded"
        />
        {errors.confirmPassword?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Configurando...' : 'Configurar Conta'}
      </button>
    </form>
  )
}
```

## Middleware de Autenticação

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // IMPORTANTE: A variável response é criada dentro de setAll para garantir
  // que os cookies sejam propagados corretamente (padrão oficial Supabase SSR)
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Primeiro, definir nos cookies da request
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Criar nova response com a request atualizada
          supabaseResponse = NextResponse.next({
            request,
          })
          // Definir cookies na response
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: getSession() atualiza tokens automaticamente
  // Isso é essencial para manter a sessão ativa
  const { data: { session } } = await supabase.auth.getSession()

  // Proteger rotas que requerem autenticação
  if (request.nextUrl.pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  // Redirecionar usuários autenticados da página de login
  if (request.nextUrl.pathname === '/auth/signin' && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // NOTA: Verificação de role no middleware NÃO é confiável.
  // session.user.role não existe por padrão no Supabase Auth.
  // Para rotas admin, use uma API Route ou Server Action que verifica o role no banco.
  // Exemplo: redirecionar para /api/admin/verify que faz a checagem real.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Verificação básica de autenticação - role real deve ser verificado no servidor
    if (!session) {
      return NextResponse.redirect(new URL('/auth/signin', request.url))
    }
    // Dica: Para verificação de role, crie um Server Component wrapper
    // que busca o role no DB antes de renderizar a página admin.
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

## Context Provider de Autenticação

```typescript
// src/contexts/AuthContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Session } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    // Obter sessão inicial
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Erro ao obter sessão:', error)
      }
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Ouvir mudanças de estado
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Redirecionamentos automáticos baseados no evento
        if (event === 'SIGNED_OUT') {
          router.push('/auth/signin')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, router])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      console.error('Erro ao atualizar sessão:', error)
    } else {
      setSession(data.session)
      setUser(data.session?.user ?? null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
```

## Gerenciamento de Perfil de Usuário

```typescript
// src/app/profile/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { useAuth } from '@/contexts/AuthContext'
import { validateEmail, handleAuthError } from '@/lib/validation/auth'

export default function ProfilePage() {
  const { user, refreshSession } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: ''
  })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || ''
      })
    }
  }, [user])

  const validateForm = () => {
    const newErrors: Record<string, string[]> = {
      email: validateEmail(formData.email)
    }

    setErrors(newErrors)
    return Object.values(newErrors).every(fieldErrors => fieldErrors.length === 0)
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setLoading(true)
    setErrors({})
    setSuccess('')

    try {
      const { error } = await supabase.auth.updateUser({
        email: formData.email,
        data: {
          first_name: formData.firstName,
          last_name: formData.lastName
        }
      })

      if (error) {
        setErrors({ general: [handleAuthError(error)] })
      } else {
        setSuccess('Perfil atualizado com sucesso!')
        await refreshSession()
      }
    } catch (error) {
      setErrors({ general: ['Erro inesperado. Tente novamente.'] })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: [] }))
    }
  }

  if (!user) {
    return <div>Carregando...</div>
  }

  return (
    <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
      <h2 className="text-xl font-semibold">Editar Perfil</h2>

      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          value={formData.email}
          onChange={handleInputChange('email')}
          className="w-full p-2 border rounded"
        />
        {errors.email?.map((error, index) => (
          <p key={index} className="text-red-500 text-sm">{error}</p>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Nome</label>
        <input
          type="text"
          value={formData.firstName}
          onChange={handleInputChange('firstName')}
          className="w-full p-2 border rounded"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Sobrenome</label>
        <input
          type="text"
          value={formData.lastName}
          onChange={handleInputChange('lastName')}
          className="w-full p-2 border rounded"
        />
      </div>

      {success && (
        <p className="text-green-500">{success}</p>
      )}

      {errors.general?.map((error, index) => (
        <p key={index} className="text-red-500">{error}</p>
      ))}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Atualizando...' : 'Atualizar Perfil'}
      </button>
    </form>
  )
}
```

## Configuração de Row Level Security (RLS)

### Habilitar RLS nas Tabelas

```sql
-- Habilitar RLS na tabela users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para usuários verem apenas seus próprios dados
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = supabase_uid);

-- Política para usuários atualizarem seus próprios dados
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = supabase_uid);

-- Política para admins verem todos os dados
CREATE POLICY "Admins can view all data" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE supabase_uid = auth.uid()::text
      AND role = 'admin'
    )
  );
```

## Tratamento de Erros Comuns

### Problemas de CORS
- Configure `SITE_URL` no painel do Supabase
- Adicione todas as URLs permitidas nas configurações de auth
- Use HTTPS em produção

### Sessões Expiradas
- Implemente refresh automático de tokens
- Use `onAuthStateChange` para detectar mudanças de sessão
- Configure `autoRefreshToken: true` (padrão)

### Rate Limiting
- Supabase impõe limites de taxa: 60 requests/minuto para auth
- Implemente tratamento de erros apropriado
- Use exponential backoff para retries

### Emails não Chegam
- Configure SMTP customizado no Supabase
- Verifique pasta de spam
- Use domínios verificados para melhor deliverability

### Links de Convite/Reset Inválidos
- Links expiram em 24 horas por padrão
- Configure `SITE_URL` corretamente
- Use HTTPS para links seguros

## Exemplos de Testes

```typescript
// __tests__/auth/signup.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import SignUpPage from '@/app/auth/signup/page'

// Mock do next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

const mockSignUp = vi.fn()
vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: mockSignUp }
  })
}))

beforeEach(() => {
  vi.clearAllMocks()
})

test('registro bem-sucedido redireciona para dashboard', async () => {
  mockSignUp.mockResolvedValue({
    data: { user: { id: '1', email: 'test@example.com' }, session: { access_token: 'token' } },
    error: null
  })

  render(<SignUpPage />)

  fireEvent.change(screen.getByPlaceholderText('Email'), {
    target: { value: 'test@example.com' }
  })
  fireEvent.change(screen.getByPlaceholderText('Senha'), {
    target: { value: 'StrongPass123!' }
  })
  fireEvent.change(screen.getByPlaceholderText('Confirmar Senha'), {
    target: { value: 'StrongPass123!' }
  })
  fireEvent.click(screen.getByText('Registrar'))

  await waitFor(() => {
    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })
})

test('validação de senha fraca mostra erros', async () => {
  render(<SignUpPage />)

  fireEvent.change(screen.getByPlaceholderText('Email'), {
    target: { value: 'test@example.com' }
  })
  fireEvent.change(screen.getByPlaceholderText('Senha'), {
    target: { value: '123' }
  })
  fireEvent.click(screen.getByText('Registrar'))

  await waitFor(() => {
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
  })
})
```

## Recursos Avançados

### Callback Handler para OAuth

```typescript
// src/app/auth/callback/page.tsx
'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const redirectToSignIn = useCallback(() => {
    setIsRedirecting(true)
    router.push('/auth/signin')
  }, [router])

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // IMPORTANTE: Use getUser() para validação autêntica
        // getSession() pode retornar dados do storage não confiável
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          console.error('Erro no callback:', userError)
          setError('Erro na autenticação. Tente novamente.')
          setTimeout(redirectToSignIn, 3000)
          return
        }

        if (user) {
          console.log('Login bem-sucedido via OAuth')
          router.push('/dashboard')
        } else {
          setError('Sessão não encontrada. Redirecionando...')
          setTimeout(redirectToSignIn, 3000)
        }
      } catch (err) {
        console.error('Erro inesperado no callback:', err)
        setError('Erro inesperado. Tente novamente.')
      }
    }

    handleAuthCallback()
  }, [supabase, router, redirectToSignIn])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        {error ? (
          <div>
            <p className="text-red-500 mb-4" role="alert">{error}</p>
            <button
              onClick={redirectToSignIn}
              disabled={isRedirecting}
              className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {isRedirecting ? 'Redirecionando...' : 'Voltar ao Login'}
            </button>
          </div>
        ) : (
          <div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Processando autenticação...</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Autenticação Social (OAuth)

```typescript
// src/components/auth/OAuthButtons.tsx
'use client'

import { useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

export default function OAuthButtons() {
  // Otimização: evitar recriação do cliente a cada render
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const handleGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    })

    if (error) {
      console.error('Erro no login Google:', error)
      // TODO: Substituir por Toast notification
      console.warn('Erro no login com Google. Tente novamente.')
    }
  }

  const handleGitHubSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })

    if (error) {
      console.error('Erro no login GitHub:', error)
      // TODO: Substituir por Toast notification
      console.warn('Erro no login com GitHub. Tente novamente.')
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleGoogleSignIn}
        className="w-full flex items-center justify-center bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50"
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          {/* Google icon SVG */}
        </svg>
        Continuar com Google
      </button>

      <button
        onClick={handleGitHubSignIn}
        className="w-full flex items-center justify-center bg-gray-800 text-white rounded-lg px-4 py-2 hover:bg-gray-700"
      >
        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
          {/* GitHub icon SVG */}
        </svg>
        Continuar com GitHub
      </button>
    </div>
  )
}
```

### Multi-Factor Authentication (MFA)

```typescript
// src/components/auth/MFAEnroll.tsx
'use client'

import { useState, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'

export default function MFAEnroll() {
  const [loading, setLoading] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null) // Armazenar factorId!
  const [challengeId, setChallengeId] = useState<string | null>(null) // Armazenar challengeId!
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  // Otimização: criar cliente uma vez com useMemo
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const handleEnrollTOTP = async () => {
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App'
      })

      if (error) {
        console.error('Erro ao inscrever MFA:', error)
        // TODO: Substituir por Toast notification
        console.warn('Erro ao configurar MFA. Tente novamente.')
        return
      }

      // CRÍTICO: Armazenar o factorId retornado!
      setFactorId(data.id)
      setQrCode(data.totp?.qr_code || null)
      setSecret(data.totp?.secret || null)
      
      // Criar challenge imediatamente após enroll
      // O usuário precisará escanear o QR code e digitar o código
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: data.id
      })
      
      if (challengeError) {
        console.error('Erro ao criar challenge:', challengeError)
        return
      }
      
      setChallengeId(challengeData.id)
    } catch (error) {
      console.error('Erro inesperado:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyTOTP = async (code: string) => {
    if (!factorId || !challengeId) {
      console.error('FactorId ou ChallengeId não encontrado. Inicie o processo de enroll novamente.')
      return
    }

    try {
      // IMPORTANTE: A verificação requer factorId, challengeId E code
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId, // Obrigatório segundo a documentação oficial!
        code
      })

      if (error) {
        // TODO: Substituir por Toast notification
        console.error('Código inválido. Tente novamente.')
        return
      }

      // Sucesso! A sessão agora tem nível aal2
      // Todas as outras sessões foram deslogadas automaticamente
      // TODO: Substituir por Toast notification de sucesso
      console.log('MFA configurado com sucesso!')
      setFactorId(null)
      setChallengeId(null)
      setQrCode(null)
      setSecret(null)
    } catch (error) {
      console.error('Erro na verificação:', error)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleEnrollTOTP}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Configurando...' : 'Configurar MFA'}
      </button>

      {qrCode && (
        <div className="text-center">
          <p className="mb-4">Escaneie o código QR com seu app autenticador:</p>
          <img src={qrCode} alt="QR Code para MFA" className="mx-auto" />
          {secret && (
            <p className="mt-4 text-sm text-gray-600">
              Código secreto: {secret}
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Digite o código de 6 dígitos"
            className="mt-4 p-2 border rounded"
            aria-label="Código de verificação MFA"
            onChange={(e) => {
              if (e.target.value.length === 6) {
                handleVerifyTOTP(e.target.value)
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
```

### Webhooks para Eventos de Auth

Configure webhooks no painel do Supabase para eventos como:
- `user.created`
- `user.updated`
- `user.deleted`
- `user.signed_in`
- `user.signed_out`

```typescript
// src/app/api/webhooks/auth/route.ts
import { createSupabaseServerClient } from '@/lib/supabase/server-client'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// TODO: Implementar verificação HMAC real usando SUPABASE_WEBHOOK_SECRET
// Exemplo de verificação:
// const expectedSignature = crypto
//   .createHmac('sha256', process.env.SUPABASE_WEBHOOK_SECRET!)
//   .update(JSON.stringify(body))
//   .digest('hex')
// if (signature !== expectedSignature) return 401

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // SEGURANÇA: Verificar assinatura do webhook
    // AVISO: Este código apenas verifica se o header existe.
    // Em produção, você DEVE verificar a assinatura criptograficamente!
    const signature = request.headers.get('x-supabase-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // TODO: Adicionar verificação HMAC real aqui antes de processar o webhook

    const { type, record } = body

    switch (type) {
      case 'INSERT':
        console.log('Novo usuário criado:', record.email)
        // Lógica para novo usuário
        break
      case 'UPDATE':
        console.log('Usuário atualizado:', record.email)
        // Lógica para atualização
        break
      case 'DELETE':
        console.log('Usuário deletado:', record.id)
        // Lógica para deleção
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro no webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## Melhores Práticas de Segurança

### Configurações de Produção
- Sempre use HTTPS
- Configure `SITE_URL` corretamente
- Use chaves de serviço apenas no servidor
- Implemente rate limiting
- Monitore logs de autenticação

### Gerenciamento de Sessões
- Tokens de acesso expiram em 1 hora por padrão
- Tokens de refresh não expiram, mas são de uso único
- Implemente rotação automática de sessões
- Limpe sessões antigas regularmente

### Proteção contra Ataques
- Implemente CAPTCHA para formulários públicos
- Use validação rigorosa de entrada
- Monitore tentativas de login suspeitas
- Implemente bloqueio temporário após falhas

Este guia fornece uma implementação completa e segura para autenticação com Supabase Auth. Todas as melhorias foram aplicadas, incluindo validação robusta, tratamento detalhado de erros, testes, OAuth completo, MFA, gerenciamento de perfil e seção abrangente de troubleshooting. Adapte os exemplos conforme necessário para seu caso de uso específico.