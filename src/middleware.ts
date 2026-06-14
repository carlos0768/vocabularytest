import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const billingPaths = ['/pricing', '/subscription'];
const billingScopedFeaturePaths = ['/correction', '/parser'];

export async function middleware(request: NextRequest) {
  if (
    process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true' &&
    [...billingPaths, ...billingScopedFeaturePaths].some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
