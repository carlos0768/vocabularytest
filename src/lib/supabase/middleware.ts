import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that require authentication check
const protectedPaths = ['/project', '/quiz', '/quiz2', '/scan', '/settings', '/subscription', '/share', '/flashcard', '/sentence-quiz', '/favorites', '/grammar', '/stats'];
const authPaths = ['/login', '/signup'];

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isHomePath = pathname === '/';

  // Fast path: skip Supabase auth check entirely for routes that do not depend on auth state
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));
  const shouldCheckSession = isProtectedPath || isAuthPath || isHomePath;

  if (!shouldCheckSession) {
    // Public routes that do not branch on auth can bypass the session lookup.
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Local/offline development may run without Supabase env.
  // In that case, skip middleware auth enforcement instead of crashing.
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getSession() for fast cookie-based check (no network roundtrip).
  // JWT integrity is still verified by Supabase RLS on actual data access.
  // getUser() was causing ~100-300ms server roundtrip on every navigation.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (isProtectedPath && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isHomePath && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/lp';
    return NextResponse.redirect(url);
  }

  if (isAuthPath && session) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
