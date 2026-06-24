import { createClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !key) {
    return NextResponse.json(
      { status: 'degraded', error: 'Missing Supabase config' },
      { status: 503 }
    );
  }

  try {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from('subscriptions')
      .select('id')
      .limit(0);

    if (error) {
      return NextResponse.json(
        { status: 'degraded', error: 'Database unreachable' },
        { status: 503 }
      );
    }

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json(
      { status: 'error', error: 'Health check failed' },
      { status: 503 }
    );
  }
}
