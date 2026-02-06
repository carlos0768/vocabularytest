import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

// Client-side Supabase client (for use in Client Components)
// Uses singleton pattern to avoid creating multiple instances
export function createClient(): SupabaseClient {
  // Return existing instance if available
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build time or if env vars are missing, return a placeholder
  // that will be properly initialized at runtime
  if (!url || !key) {
    // Return a minimal mock for SSR/build time
    // This should never be used in actual client-side rendering
    if (typeof window === 'undefined') {
      // Server-side: return a mock that won't be used
      return {} as SupabaseClient;
    }
    throw new Error('Supabase environment variables not configured');
  }

  supabaseInstance = createBrowserClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  return supabaseInstance;
}
