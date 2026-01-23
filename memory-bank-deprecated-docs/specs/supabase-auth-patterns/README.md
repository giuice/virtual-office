# Supabase Auth Patterns - Confirmed Specification

**Created**: 2025-12-11  
**Status**: ✅ Verified against official docs  
**Source Document**: `docs/supabase-auth-research.md`

## Overview

This spec documents the canonical patterns for implementing Supabase Auth in the Virtual Office Next.js 15 application. All patterns have been verified against the official Supabase SSR and Auth documentation (December 2025).

## Critical Rules

### 1. User ID vs Supabase UID (DATABASE)
```
users.id          → Internal app UUID (for foreign keys)
users.supabase_uid → Supabase Auth ID (for auth.uid() matching)

❌ users.id = auth.uid()           → ALWAYS WRONG
✅ users.supabase_uid = auth.uid()::text → CORRECT
```

### 2. getSession() vs getUser() (AUTH)
| Context | Method | Why |
|---------|--------|-----|
| Server (API/Actions) | `getUser()` | Validates JWT on Auth server |
| Client (Browser) | `getSession()` | Fast, from local storage |
| Middleware | `getSession()` | OK for token refresh only |

```typescript
// ❌ WRONG - Server trusting getSession
'use server'
const { data: { session } } = await supabase.auth.getSession()
if (session?.user) { /* INSECURE */ }

// ✅ CORRECT - Server using getUser
'use server'
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) { return { error: 'Unauthorized' } }
```

### 3. Client vs Server Supabase Clients
```typescript
// Server (API routes, Server Actions, Server Components)
import { createSupabaseServerClient } from '@/lib/supabase/server-client'
const supabase = await createSupabaseServerClient()

// Client (React Components in browser)
import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
const supabase = createSupabaseBrowserClient()
```

### 4. Admin Operations (service_role)
- **NEVER** expose `SUPABASE_SERVICE_ROLE_KEY` to the client
- **ONLY** use in Server Actions or API Routes
- Always verify user role in database before admin operations

## Key Patterns

### Server Client (Next.js 15)
```typescript
// src/lib/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies() // MUST await in Next.js 15
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Ignore in Server Components */ }
        },
      },
    }
  )
}
```

### Middleware (Official Pattern)
```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getSession() // Refresh tokens
  return supabaseResponse
}
```

### MFA Flow (Complete)
```typescript
// 1. Enroll
const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
const factorId = data.id

// 2. Challenge (REQUIRED!)
const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
const challengeId = challenge.id

// 3. Verify
await supabase.auth.mfa.verify({ factorId, challengeId, code })
```

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/supabase/server-client.ts` | Server-side Supabase client |
| `src/lib/supabase/browser-client.ts` | Browser Supabase client |
| `middleware.ts` | Auth middleware |
| `src/contexts/AuthContext.tsx` | Client-side auth state |
| `src/app/actions/auth.ts` | Server Actions for auth |

## Verification Sources

- `/supabase/ssr` - Official SSR package docs
- `/supabase/supabase-js` - Official JS client docs
- `/websites/supabase_com-docs` - Official Supabase guides

## Related Documents

- Full implementation guide: `docs/supabase-auth-research.md`
- Database schema: `migrations/database-structure.md`
