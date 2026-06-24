import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { readSingleLineEnv } from '@/lib/env';
import { createClient as createServerClient } from './server';

export async function createRouteHandlerClient(request: NextRequest): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    if (!url || !key) {
      throw new Error('Supabase environment variables not configured');
    }

    return createSupabaseClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
  }

  return createServerClient();
}
