import { createClient } from '@/lib/supabase/server';
import {
  buildExpiredOAuthRedirectCookie,
  normalizeOAuthRedirectPath,
  readOAuthRedirectCookie,
} from '@/lib/auth/oauth';
import { NextResponse } from 'next/server';

// GET /auth/callback
// Handles email confirmation redirect from Supabase
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const cookieNext = readOAuthRedirectCookie(request.headers.get('cookie'));
  const next = normalizeOAuthRedirectPath(searchParams.get('next') ?? cookieNext);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      response.headers.append('Set-Cookie', buildExpiredOAuthRedirectCookie());
      return response;
    }
  }

  // Return the user to an error page with instructions
  const response = NextResponse.redirect(`${origin}/auth/auth-code-error`);
  response.headers.append('Set-Cookie', buildExpiredOAuthRedirectCookie());
  return response;
}
