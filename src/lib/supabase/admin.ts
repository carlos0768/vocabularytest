import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');

  supabaseAdmin = createClient(
    url.startsWith('http') ? url : `https://${url}`,
    key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return supabaseAdmin;
}
