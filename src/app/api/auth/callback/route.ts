// src/app/api/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Use our server client helper
import { GoogleAvatarService } from '@/lib/services/google-avatar-service';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
// import { Database } from '@/lib/supabase/database.types'; // Uncomment if using types

function getSafeNextPath(nextParam: string | null): string | null {
  if (!nextParam) return null;
  // Prevent open redirect: only allow same-origin relative paths
  if (!nextParam.startsWith('/')) return null;
  // Prevent protocol-relative URLs
  if (nextParam.startsWith('//')) return null;
  return nextParam;
}

export const dynamic = 'force-dynamic'; // Keep dynamic export

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeNextPath(requestUrl.searchParams.get('next'));

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

          // Handle Google OAuth avatar extraction if this is a Google user
          if (user.app_metadata?.provider === 'google' && user.user_metadata) {
            try {
              console.log(`[Callback] Processing Google OAuth user avatar for user: ${user.id}`);
              const userRepository = new SupabaseUserRepository(supabase);
              const googleAvatarService = new GoogleAvatarService(userRepository);
              const avatarResult = await googleAvatarService.extractAndStoreGoogleAvatar(
                user.id,
                user.user_metadata
              );
              
              if (avatarResult.success) {
                console.log(`[Callback] Successfully stored Google avatar for user: ${user.id}`);
              } else {
                console.warn(`[Callback] Failed to store Google avatar for user: ${user.id}`, avatarResult.error);
              }
            } catch (avatarError) {
              console.error(`[Callback] Error processing Google avatar for user: ${user.id}`, avatarError);
              // Don't fail the auth flow due to avatar issues
            }
          }

          try {
            // If caller provided a next path (e.g., invite flow), honor it.
            if (next) {
              const redirectUrl = new URL(next, requestUrl.origin).toString();
              console.log(`[Callback] Redirecting to next: ${redirectUrl}`);
              return NextResponse.redirect(redirectUrl);
            }

            // Check if the user has a company by querying our canonical users table
            // IMPORTANT: do NOT use `user_profiles` (does not exist in this codebase)
            const { data: userRow, error: userRowError } = await supabase
              .from('users')
              .select('company_id')
              .eq('supabase_uid', user.id)
              .maybeSingle();

            if (userRowError) {
              console.error(`[Callback] Error fetching user row: ${userRowError.message}`);
            }

            // Redirect based on whether the user has a company
            const hasCompany = !!userRow?.company_id;
            const redirectPath = hasCompany ? '/floor-plan' : '/onboarding';
            console.log(`[Callback] User company status: ${hasCompany ? 'has company' : 'no company'} -> ${redirectPath}`);

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
