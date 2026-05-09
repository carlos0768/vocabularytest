import { createClient } from '@/lib/supabase/server';
import { normalizeOAuthRedirectPath } from '@/lib/auth/oauth';
import { NextResponse } from 'next/server';

// GET /auth/callback
// Handles email confirmation redirect from Supabase
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = normalizeOAuthRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
