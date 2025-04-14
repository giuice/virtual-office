// src/app/api/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use our server client helper
// import { Database } from '@/lib/supabase/database.types'; // Uncomment if using types

export const dynamic = 'force-dynamic'; // Keep dynamic export

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  let errorMessage = 'Authentication failed. Please try again.'; // Default error message

  if (code) {
    // Use the server client helper function
    const supabase = await createSupabaseServerClient();

    try {
      // Exchange the code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();


        if (!authError && user) {
          console.log(`[Callback] Code exchange successful for user: ${user.id}`);

          try {
            // Check if the user has a company by querying user profiles
            const { data: userProfile, error: profileError } = await supabase
              .from('user_profiles')
              .select('company_id')
              .eq('user_id', user.id)
              .single();

            if (profileError && profileError.code !== 'PGRST116') {
              console.error(`[Callback] Error fetching user profile: ${profileError.message}`);
            }

            // Redirect based on whether the user has a company
            let redirectPath;
            if (userProfile?.company_id) {
              console.log(`[Callback] User has a company. Redirecting to office.`);
              redirectPath = '/office';
            } else {
              console.log(`[Callback] User does not have a company. Redirecting to create-company.`);
              redirectPath = '/create-company';
            }

            const redirectUrl = new URL(redirectPath, requestUrl.origin).toString();
            console.log(`[Callback] Redirecting to: ${redirectUrl}`);
            return NextResponse.redirect(redirectUrl);
          } catch (profileError: any) {
            console.error('[Callback] Exception during profile check:', profileError);
            // On error checking profile, fallback to login page which has its own checks
            return NextResponse.redirect(new URL('/login', requestUrl.origin));
          }
        }

        // If no session was created (unlikely), redirect to login
        console.log('[Callback] No session after code exchange. Redirecting to login.');
        return NextResponse.redirect(new URL('/login', requestUrl.origin));
      }
      // If exchange failed, set specific error message
      console.error('[Callback] Error exchanging code for session:', error);
      errorMessage = error.message || 'Failed to exchange code for session.';
    } catch (e: any) {
      // Catch any other exceptions during the process
      console.error('[Callback] Exception during code exchange:', e);
      errorMessage = e.message || 'An unexpected error occurred during authentication.';
    }
  } else {
    // If code is missing from the start
    console.error('[Callback] Code missing in request URL.');
    errorMessage = 'Authorization code not found in callback URL.';
  }

  // If we reach here, it means an error occurred or code was missing
  const errorRedirectUrl = new URL('/auth/auth-error', request.url); // Assuming an error page exists at /auth/auth-error
  errorRedirectUrl.searchParams.set('message', errorMessage);
  console.log(`[Callback] Redirecting to error page: ${errorRedirectUrl.toString()}`);
  return NextResponse.redirect(errorRedirectUrl);
}
