// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  createAuthCorrelationId,
  getAuthErrorCode,
  recordAuthValidation,
} from '@/lib/auth/auth-metrics';
// import { Database } from '@/lib/supabase/database.types'; // Uncomment if using types

export async function proxy(request: NextRequest) {
  const correlationId = createAuthCorrelationId();
  let refreshed = false;
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // If using generated types:
  // const supabase = createServerClient<Database>(
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          refreshed ||= cookiesToSet.length > 0;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Create a new response object to apply the updated cookies
          response = NextResponse.next({
            request, // Pass the modified request
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid placing code between createServerClient and auth.getUser()
  // Fetch user instead of session to ensure authentication against the server
  let user = null;
  let userError: unknown;
  try {
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
    userError = authResult.error;
  } catch (error) {
    userError = error;
    recordAuthValidation({
      correlationId,
      boundary: 'proxy',
      pathname: request.nextUrl.pathname,
      authMethod: 'getUser',
      authStatus: 'error',
      authErrorCode: getAuthErrorCode(error),
      refreshed,
    });
    throw error;
  }

  recordAuthValidation({
    correlationId,
    boundary: 'proxy',
    pathname: request.nextUrl.pathname,
    authMethod: 'getUser',
    authStatus: userError ? 'error' : user ? 'authenticated' : 'unauthenticated',
    authErrorCode: getAuthErrorCode(userError),
    refreshed,
  });

  // Log user status in proxy
  // console.log(
  //   `[Proxy] Path: ${request.nextUrl.pathname}, User: ${user?.id || 'None'}, Error: ${userError?.message || 'None'}`
  // );

  // Optional: Redirect logic based on auth state and path
  const { pathname } = request.nextUrl;

  // Define protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/floor-plan', '/create-company', '/admin']; // Add all routes that need auth

  // Redirect unauthenticated users trying to access protected routes
  if (!user && protectedRoutes.some(route => pathname.startsWith(route))) {
    console.log(
      `[Proxy] Redirecting unauthenticated user from protected route: ${pathname} to /login`
    );
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // --- Remove the redirect for authenticated users on /login ---
  // Let the application handle where logged-in users go after hitting /login or /.
  // if (user && pathname === '/login') {
  //    console.log('Redirecting authenticated user from /login');
  //    return NextResponse.redirect(new URL('/dashboard', request.url));
  // }

  // IMPORTANT: Return the potentially modified response object
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/ (all Next.js internal/dev assets)
     * - __nextjs (Next.js dev overlay frames)
     * - favicon.ico (favicon file)
     * - src/ (raw source-map fetches)
     * - public files with an extension (images, fonts, manifests, and similar
     *   assets must never spend an Auth validation)
     * - api and api/** (API route handlers are the single authoritative auth
     *   boundary: requireAuthUser or an equivalent direct getUser() validation
     *   in the handler. Matching API routes here would also call Auth,
     *   double-hitting the Auth server per request (the VO-RUNTIME-002
     *   auth-request storm). Route handlers persist rotated cookies through the
     *   server client's setAll (src/lib/supabase/server-client.ts), while
     *   /api/auth/callback independently exchanges its OAuth code for session
     *   cookies. The api(?:/|$) boundary also excludes the exact /api pathname
     *   and does NOT exclude page paths like /api-docs.
     *
     * The proxy continues to use getUser(), rather than getClaims(), for page
     * protection and cookie refresh. This project uses legacy HS256 signing:
     * its JWKS endpoint returned empty keys (verified WP0.5, 2026-07-15), so
     * getClaims() would fall back to a network call and provide no benefit.
     */
    '/((?!_next/|__nextjs|favicon.ico|src/|api(?:/|$)|.*\\.[A-Za-z0-9]+$).*)',
  ],
};
