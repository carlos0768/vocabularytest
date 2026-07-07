import { createClient } from '@/lib/supabase/server';
import {
  buildExpiredOAuthOnboardingCookie,
  buildExpiredOAuthRedirectCookie,
  normalizeOAuthRedirectPath,
  readOAuthOnboardingCookie,
  readOAuthRedirectCookie,
} from '@/lib/auth/oauth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  hasSignupProfileFields,
  isUniqueSignupProfileViolation,
  saveSignupProfileFields,
} from '@/lib/auth/signup-profile';
import { seedDefaultOfficialWordbooksForUser } from '@/lib/official-wordbooks/import-default';
import { NextResponse } from 'next/server';

type AuthCallbackDeps = {
  createServerClient?: typeof createClient;
  getAdmin?: typeof getSupabaseAdmin;
  saveSignupProfileFields?: typeof saveSignupProfileFields;
  seedDefaultOfficialWordbooksForUser?: typeof seedDefaultOfficialWordbooksForUser;
};

function clearOAuthCookies(response: NextResponse): void {
  response.headers.append('Set-Cookie', buildExpiredOAuthRedirectCookie());
  response.headers.append('Set-Cookie', buildExpiredOAuthOnboardingCookie());
}

// GET /auth/callback
// Handles email confirmation redirect from Supabase
export async function handleAuthCallbackGet(request: Request, deps: AuthCallbackDeps = {}) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const cookieHeader = request.headers.get('cookie');
  const cookieNext = readOAuthRedirectCookie(cookieHeader);
  const onboardingFields = readOAuthOnboardingCookie(cookieHeader);
  const next = normalizeOAuthRedirectPath(searchParams.get('next') ?? cookieNext);

  if (code) {
    const supabase = await (deps.createServerClient ?? createClient)();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (data.user && onboardingFields && hasSignupProfileFields(onboardingFields)) {
        const admin = (deps.getAdmin ?? getSupabaseAdmin)();
        const persistProfile = deps.saveSignupProfileFields ?? saveSignupProfileFields;
        let profileError = await persistProfile(admin, data.user.id, onboardingFields);

        if (profileError && isUniqueSignupProfileViolation(profileError) && onboardingFields.user_handle) {
          const fallbackFields = { ...onboardingFields };
          delete fallbackFields.user_handle;
          profileError = await persistProfile(admin, data.user.id, fallbackFields);
        }

        if (profileError) {
          console.error('Failed to save OAuth onboarding profile:', profileError);
        }

        // Seed the default official wordbooks for the chosen EIKEN level. OAuth
        // signups never reach signup-verify, so this is their equivalent seed.
        // Awaited before the redirect so the wordbooks exist in Supabase by the
        // time the client runs its first sync (the sessionStorage fallback in
        // /api/onboarding/profile does not fire when it is lost across the OAuth
        // round-trip). persist de-dupes by official slug, so if that fallback
        // also runs it never creates duplicates. A seeding failure must not
        // block the user from entering the app.
        const eikenLevel = onboardingFields.eiken_level;
        if (eikenLevel) {
          try {
            await (deps.seedDefaultOfficialWordbooksForUser ?? seedDefaultOfficialWordbooksForUser)(
              admin,
              data.user.id,
              eikenLevel,
            );
          } catch (seedError) {
            console.error('Failed to seed OAuth default wordbooks:', seedError);
          }
        }
      }

      const response = NextResponse.redirect(`${origin}${next}`);
      clearOAuthCookies(response);
      return response;
    }
  }

  // Return the user to an error page with instructions
  const response = NextResponse.redirect(`${origin}/auth/auth-code-error`);
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: Request) {
  return handleAuthCallbackGet(request);
}
