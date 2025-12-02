import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin, hash } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type'); // 'invite', 'recovery', 'signup', 'magiclink'

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';

  const getRedirectUrl = (path: string, hashFragment?: string) => {
    let baseUrl: string;
    if (isLocalEnv) {
      baseUrl = `${origin}${path}`;
    } else if (forwardedHost) {
      baseUrl = `https://${forwardedHost}${path}`;
    } else {
      baseUrl = `${origin}${path}`;
    }
    return hashFragment ? `${baseUrl}#${hashFragment}` : baseUrl;
  };

  // Handle PKCE flow (code exchange)
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Check if this is an invite or recovery flow that requires password setup
      // If user was invited, they may need to set a password
      const user = data.session.user;
      const isInviteFlow = type === 'invite' || type === 'recovery';
      
      // Check if user has confirmed their email but may need password setup
      // Invited users typically need to set a password after clicking the link
      if (isInviteFlow) {
        return NextResponse.redirect(getRedirectUrl('/set-password'));
      }

      // Normal flow: redirect to onboarding
      return NextResponse.redirect(getRedirectUrl('/onboarding'));
    }
  }

  // Handle hash-based auth (invite/recovery links use hash fragments)
  // Note: Hash fragments aren't sent to the server, but we prepare for client-side handling
  // The /set-password page will handle the hash processing client-side
  if (type === 'invite' || type === 'recovery') {
    return NextResponse.redirect(getRedirectUrl('/set-password'));
  }

  // Return to login if error (invalid token, expired link, etc.)
  return NextResponse.redirect(getRedirectUrl('/login'));
}