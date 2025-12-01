import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to onboarding after email confirmation
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}/onboarding`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}/onboarding`);
      } else {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  // Return to login if error (invalid token, expired link, etc.)
  return NextResponse.redirect(`${origin}/login`);
}