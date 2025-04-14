// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
// import { Database } from '@/lib/supabase/database.types'; // Uncomment if using types

export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
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
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  // Log user status in middleware
  console.log(`[Middleware] Path: ${request.nextUrl.pathname}, User: ${user?.id || 'None'}, Error: ${userError?.message || 'None'}`);

  // Optional: Redirect logic based on auth state and path
  const { pathname } = request.nextUrl;

  // Define protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/floor-plan', '/create-company', '/admin']; // Add all routes that need auth

  // Redirect unauthenticated users trying to access protected routes
  if (!user && protectedRoutes.some(route => pathname.startsWith(route))) {
     console.log(`[Middleware] Redirecting unauthenticated user from protected route: ${pathname} to /login`);
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
