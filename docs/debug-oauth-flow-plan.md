# Debugging Plan: OAuth Login Flow (Supabase SSR)

This plan outlines steps to diagnose issues with the OAuth (specifically Google) login flow using `@supabase/ssr` in a Next.js application, particularly when redirects are not behaving as expected.

__DO READ__
**Updated login google docs**: `docs/google-login.md`

**Problem Context:** User clicks "Sign in with Google", authenticates with Google, but is redirected back to the `/login` page instead of the intended post-login destination (e.g., `/dashboard` for users with an existing company, or `/create-company` for new users). This creates a redirect loop where the user is constantly re-authenticating with Google but cannot access the application, and the application state doesn't seem to recognize the user immediately.

**Current Setup:**
*   Next.js App Router
*   `@supabase/ssr` package for client/server components and middleware.
*   Middleware (`src/middleware.ts`) handles session refreshing and protects routes.
*   Callback route (`src/app/api/auth/callback/route.ts`) handles code exchange.
*   Client-side state management (`AuthContext`, `useSession`).

**Debugging Steps:**

**Phase 1: Verify Supabase & Google Configuration**

1.  **Supabase Auth Settings:**
    *   Navigate to your Supabase Project -> Authentication -> Settings.
    *   **Site URL:** Verify it *exactly* matches your local development URL (e.g., `http://localhost:3000`). No trailing slash. Check `http` vs `https`.
    *   **Additional Redirect URLs:** Verify `http://localhost:3000/api/auth/callback` is listed *exactly*. Check for typos, `http` vs `https`, and no trailing slash.
    *   **Provider Settings (Google):** Ensure the Google provider is enabled. Double-check that the Client ID and Secret are correctly copied from your Google Cloud Console project and saved in Supabase.
2.  **Google Cloud Console Credentials:**
    *   Go to your Google Cloud project -> APIs & Services -> Credentials.
    *   Select the OAuth 2.0 Client ID used for this application.
    *   **Authorized JavaScript origins:** Verify `http://localhost:3000` is listed.
    *   **Authorized redirect URIs:** Verify `http://localhost:3000/api/auth/callback` is listed *exactly*. Mismatches here are a common cause of redirect failures *from* Google.
3.  **Environment Variables:**
    *   Verify `.env.local` (or your environment variable source) has the correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    *   Ensure these variables are prefixed with `NEXT_PUBLIC_` as they are used client-side.
    *   Verify server-side environment variables (if deployed) also have these set correctly.

**Phase 2: Trace the Initial OAuth Redirect (Client -> Google)**

1.  **Client-Side Call:**
    *   Open the browser's Network tab (usually F12).
    *   Clear the network log. Ensure "Preserve log" is checked.
    *   Click the "Sign in with Google" button on your `/login` page.
    *   Observe the very first request initiated after the click. It should be a request to the Supabase URL (`https://<your-project-ref>.supabase.co/auth/v1/authorize?provider=google&...`).
    *   **Check:** Does this request happen?
    *   **Check:** Does it have the correct query parameters (like `provider=google`, `redirect_to=...`)?
    *   **Check:** Does it receive a 302 redirect response?
    *   **Check:** Is the `Location` header in the 302 response pointing to `accounts.google.com`?
2.  **Google Authentication:**
    *   You should be redirected to Google's login/consent screen.
    *   Authenticate with Google.
    *   **Check:** Does Google accept the authentication without errors?

**Phase 3: Trace the Redirect *Back* from Google (Google -> App)**

1.  **Network Tab (Crucial Step):**
    *   *After* authenticating with Google, carefully watch the Network tab again.
    *   Google *should* issue a 302 redirect back to the URI specified in your Google Cloud Console (`http://localhost:3000/api/auth/callback`). This redirect URL will include the `code=...` parameter.
    *   **Check:** Does this redirect request appear in the Network tab?
    *   **Check:** Is the `Location` header in the response from Google pointing *exactly* to `http://localhost:3000/api/auth/callback?code=...&state=...`?
    *   **Troubleshooting:** If this redirect doesn't happen or points elsewhere, the "Authorized redirect URIs" in your Google Cloud Console is the most likely cause.

**Phase 4: Trace the Application Callback and Middleware (App Internal)**

*(Only proceed if Phase 3 shows Google redirecting correctly to `/api/auth/callback`)*

1.  **Server Logs:**
    *   Ensure your Next.js development server is running (`npm run dev`).
    *   Check the **server console** logs immediately after the redirect from Google hits your application.
    *   **Check:** Do you see the `[Callback] Code exchange successful. Redirecting to: http://localhost:3000/dashboard...` log message? Or do you see `[Callback] Error...` or `[Callback] Code missing...`?
    *   **Troubleshooting (Callback Errors):** If errors occur here, it might be issues with `createSupabaseServerClient` setup, environment variables (`URL`, `ANON_KEY`), or the code exchange itself.
2.  **Middleware Logs (Post-Callback):**
    *   **Check:** If the callback log shows success and a redirect to `/dashboard`, what does the *very next* `[Middleware]` log line show?
        *   Expected: `[Middleware] Path: /dashboard, User: <user-id>, Error: None`
        *   Problematic: `[Middleware] Path: /dashboard, User: None, Error: Auth session missing!`
    *   **Check:** If the middleware log for `/dashboard` shows `User: None`, does it then log `[Middleware] Redirecting unauthenticated user from protected route: /dashboard to /login`?
    *   **Check:** What is the *next* middleware log after that?
        *   Expected (if redirected to login): `[Middleware] Path: /login, User: <user-id>, Error: None` (Session should be readable now)
        *   Problematic: `[Middleware] Path: /login, User: None, Error: Auth session missing!` (Indicates persistent session issue)
    *   **Troubleshooting (Middleware Issues):** If the middleware consistently fails to see the user (`User: None`) even after a successful callback, suspect cookie propagation delays or issues with how `createServerClient` reads cookies in the middleware context vs. the route handler context. Ensure `getAll`/`setAll` is correctly implemented in the middleware.

**Phase 5: Client-Side Hydration**

*(Only proceed if Phase 4 shows middleware eventually recognizing the user)*

1.  **Browser Console Logs:**
    *   Check the browser console for logs from `useSession` or `AuthContext`.
    *   **Check:** Does `useSession` eventually report a valid session and user?
    *   **Check:** Are there any client-side errors?
2.  **Component Rendering:**
    *   If the user ends up on `/login` even when authenticated according to middleware, check the rendering logic of the `/login` page. Is there a `useEffect` or similar that might be redirecting authenticated users incorrectly?
    *   Check the rendering logic of the intended target page (`/dashboard`). Is it correctly handling the loading state from `useSession` or `useAuth` before attempting redirects?

**Phase 6: Advanced Cookie Troubleshooting and Common Issues**

1.  **Cookie Inspection:**
    *   Open the Application tab in DevTools, navigate to Cookies, and select your domain.
    *   **Check:** Are `sb-<project-ref>-auth-token` cookies present?
    *   **Check:** Do these cookies have the correct attributes?
        *   **Domain:** Should match your domain exactly.
        *   **Path:** Should be `/`.
        *   **Expires/Max-Age:** Should have a future date (not expired).
        *   **HttpOnly:** Should be `true` for security.
        *   **SameSite:** Often set to `Lax` or `None` (if Secure is true).
        *   **Secure:** Depends on your environment (true for HTTPS).
    *   **Check:** Are there multiple conflicting auth cookies? This can happen when testing with multiple Supabase projects.

2.  **Network Request Headers:**
    *   In the Network tab, look at requests to your application after authentication.
    *   **Check:** Are cookies being sent in the `Cookie` header?
    *   **Check:** Are request headers like `Authorization: Bearer ...` present when expected?

3.  **Common Edge Cases to Test:**
    *   **Incognito/Private Window:** Test the flow in a private/incognito window to rule out cookie conflicts.
    *   **Different Browser:** Test in a completely different browser to validate cross-browser compatibility.
    *   **Mobile Devices:** If applicable, test on mobile browsers where cookie handling can differ.
    *   **Clearing Cookies:** Try explicitly clearing all cookies before testing.
    *   **Session Expiry:** If your sessions expire quickly for testing, verify renewal is working.

4.  **Specific Supabase SSR Implementation Issues:**
    *   **Middleware Cookie Handling:** Ensure middleware correctly implements `createServerClient` with the cookie methods:
      ```typescript
      export const createClient = (cookieStore: {
        get: (name: string) => string | undefined
        set: (name: string, value: string, options: CookieOptions) => void
      }) => {
        return createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              get(name: string) {
                return cookieStore.get(name)
              },
              set(name: string, value: string, options: CookieOptions) {
                cookieStore.set(name, value, options)
              },
              remove(name: string, options: CookieOptions) {
                cookieStore.set(name, '', { ...options, maxAge: 0 })
              },
            },
          }
        )
      }
      ```
    *   **Callback Route Implementation:** Verify the callback route is properly handling the OAuth code exchange:
      ```typescript
      // Minimal example of a properly implemented OAuth callback route
      export async function GET(request: NextRequest) {
        const requestUrl = new URL(request.url)
        const code = requestUrl.searchParams.get('code')
        const next = requestUrl.searchParams.get('next') ?? '/'
        
        if (!code) {
          console.error('[Callback] Code missing!')
          return NextResponse.redirect(`${requestUrl.origin}/login?error=code_missing`)
        }
        
        try {
          const cookieStore = cookies()
          const supabase = createClient(cookieStore)
          
          // Exchange the code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          
          if (error) {
            console.error(`[Callback] Error: ${error.message}`)
            return NextResponse.redirect(`${requestUrl.origin}/login?error=${error.message}`)
          }
          
          console.log(`[Callback] Code exchange successful. Redirecting to: ${next}`)
          return NextResponse.redirect(`${requestUrl.origin}${next}`)
        } catch (error) {
          console.error(`[Callback] Exception: ${error instanceof Error ? error.message : String(error)}`)
          return NextResponse.redirect(`${requestUrl.origin}/login?error=unknown`)
        }
      }
      ```

By following these steps, we should be able to pinpoint where the OAuth flow is breaking down.

**Phase 7: Company-Based Redirect Logic Troubleshooting**

This phase addresses the specific issue where users get stuck in a Google authentication loop, unable to be properly redirected based on whether they have a company or not.

1. **Check Company Determination Logic:**
   * After successful authentication, the application should check if the user has an associated company.
   * **Check:** Is there a database query that runs after authentication to determine if the user has a company?
   * **Check:** Are there any errors in this database query? Check server logs for any database connection issues or query errors.
   * **Check:** Is the user ID being correctly passed to this query? The query might be failing if it's using the wrong ID format (e.g., using `uid` when the database uses `id`).

2. **Redirect Logic Inspection:**
   * **Check:** Identify where in the codebase the post-authentication redirect decision happens. Look for code like:
     ```javascript
     // Example logic that might exist in a route handler, middleware, or component
     if (user) {
       const userCompany = await getUserCompany(user.id);
       if (userCompany) {
         return redirect('/dashboard');
       } else {
         return redirect('/create-company');
       }
     }
     ```
   * **Check:** Is this logic executing at all? Add logging to confirm it runs.
   * **Check:** Are there any error protection mechanisms that might be causing fallback to `/login` when errors occur?

3. **Race Condition Check:**
   * **Check:** Is it possible that the company check happens before the user session is fully established?
   * **Check:** Is the redirect happening too early in the authentication flow, before cookies are properly set?
   * **Troubleshooting:** Add artificial delays or implement proper async/await patterns to ensure session establishment before company checks.

4. **Cross-Tab / Cross-Window Issues:**
   * **Check:** Are you testing in multiple tabs or windows? Supabase auth tokens might be getting confused across tabs.
   * **Check:** Try clearing all browser data and testing in a fresh, single browser window.

5. **Implementation Check:**
   * Look at your callback route implementation. It should include logic for company-based routing:
     ```typescript
     // Example of what might need to be added to your callback route
     export async function GET(request: NextRequest) {
       const requestUrl = new URL(request.url)
       const code = requestUrl.searchParams.get('code')
       
       if (!code) {
         return NextResponse.redirect(`${requestUrl.origin}/login?error=code_missing`)
       }
       
       try {
         const cookieStore = cookies()
         const supabase = createClient(cookieStore)
         
         // Exchange the code for a session
         const { error } = await supabase.auth.exchangeCodeForSession(code)
         
         if (error) {
           return NextResponse.redirect(`${requestUrl.origin}/login?error=${error.message}`)
         }
         
         // Get the session and user after exchange
         const { data: { session } } = await supabase.auth.getSession()
         
         if (session && session.user) {
           // Check if the user has a company
           const { data: userCompany, error: companyError } = await supabase
             .from('companies')
             .select('id')
             .eq('user_id', session.user.id)
             .single()
           
           if (companyError && companyError.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
             console.error(`[Callback] Company lookup error: ${companyError.message}`)
             return NextResponse.redirect(`${requestUrl.origin}/login?error=company_lookup_failed`)
           }
           
           // Redirect based on company existence
           if (userCompany) {
             return NextResponse.redirect(`${requestUrl.origin}/dashboard`)
           } else {
             return NextResponse.redirect(`${requestUrl.origin}/create-company`)
           }
         }
         
         // Fallback redirect if we somehow get here without a valid session
         return NextResponse.redirect(`${requestUrl.origin}/login?error=no_session`)
       } catch (error) {
         console.error(`[Callback] Exception: ${error instanceof Error ? error.message : String(error)}`)
         return NextResponse.redirect(`${requestUrl.origin}/login?error=unknown`)
       }
     }
     ```

By carefully checking each of these aspects, you should be able to identify why the redirect loop is occurring and fix the specific issue in your OAuth flow.

**Phase 8: Client-Side Login Page Redirect Logic**

After examining the login page code, we need to specifically check the client-side redirect logic in the `useEffect` hook in `src/app/(auth)/login/page.tsx`:

1. **Browser Console Diagnostic Logs:**
   * Add temporary detailed logging in the `useEffect` hook in the login page to track the state values that determine redirects:
   ```javascript
   // Add this inside the useEffect but before any conditional logic
   console.log('[Debug] Login Page Redirect Check:', { 
     isAuthenticated: !!user, 
     userId: user?.id,
     isCompanyLoading: companyLoading,
     hasCompany: !!company, 
     companyId: company?.id,
     profileCompanyId: currentUserProfile?.companyId,
     currentUserProfile: currentUserProfile 
   });
   ```
   * **Check:** After Google authentication, do these logs appear in the console? If not, the component might not be mounting properly.
   * **Check:** Is `user` populated but `company` or `currentUserProfile` null/undefined? This would indicate the user session is established but company data isn't being fetched.

2. **Auth Context Inspection:**
   * Inspect the `useAuth()` hook implementation to ensure `signInWithGoogle()` properly awaits and handles the OAuth redirect:
   ```javascript
   // Look for code similar to this in your auth provider
   const signInWithGoogle = async () => {
     const { error } = await supabase.auth.signInWithOAuth({
       provider: 'google',
       options: {
         redirectTo: `${window.location.origin}/api/auth/callback`,
       },
     });
     
     if (error) throw error;
     // There should NOT be any code here that assumes the user is already signed in
     // The callback should handle the session establishment
   };
   ```
   * **Check:** Is the `redirectTo` option properly set? It must exactly match the callback URL configured in Supabase and Google.

3. **Company Context Loading:**
   * Examine `CompanyContext` to see how company data is loaded after authentication:
   ```javascript
   // Look for this pattern in your company context
   useEffect(() => {
     const fetchCompany = async () => {
       if (!user) return; // Skip if no user
       
       try {
         setIsLoading(true);
         const { data, error } = await supabase
           .from('companies')
           .select('*')
           .eq('user_id', user.id) // Is this the correct user ID field?
           .single();
           
         if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
           console.error('Error fetching company:', error);
         }
         
         setCompany(data || null);
       } catch (error) {
         console.error('Exception fetching company:', error);
       } finally {
         setIsLoading(false);
       }
     };
     
     fetchCompany();
   }, [user, supabase]);
   ```
   * **Check:** Is the company query using the correct user ID field? Sometimes user.id vs user.uid causes issues.
   * **Check:** Are there any errors in the company data fetch that might be silent?

4. **Race Condition Tests:**
   * Add a small artificial delay in the redirect logic to ensure all state is properly loaded:
   ```javascript
   useEffect(() => {
     // Skip if loading or if no user is authenticated
     if (!user || companyLoading) return;

     // Small delay to ensure all state is settled
     const redirectTimer = setTimeout(() => {
       console.log('[Debug] Executing redirect after delay with state:', { 
         user: !!user, company: !!company, companyLoading, currentUserProfile 
       });
       
       // If user is logged in but doesn't have a company, redirect to company creation
       if (!company || !currentUserProfile?.companyId) {
         router.push('/create-company');
       } else {
         // User has a company, redirect to office
         router.push('/office');
       }
     }, 500); // 500ms delay
     
     return () => clearTimeout(redirectTimer);
   }, [user, company, companyLoading, router, currentUserProfile]);
   ```
   * **Check:** Does adding this delay resolve the issue? If so, it confirms a race condition.
