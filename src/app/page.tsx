import { cookies } from 'next/headers';
import { GuestLanding } from '@/components/home/GuestLanding';
import { HomeClient } from './home-client';

/**
 * Root route. Visitors without a Supabase session cookie get the landing page
 * server-rendered, so the initial HTML carries the full LP content (crawlers
 * and the AdSense review included) instead of the client auth spinner.
 * Cookie holders get the client home; its own !user branch still falls back
 * to the landing page if the session turns out to be invalid.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const hasSupabaseSession = cookieStore
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));

  if (!hasSupabaseSession) {
    return <GuestLanding />;
  }

  return <HomeClient />;
}
