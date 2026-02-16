import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }
  return supabaseAdmin;
}

async function authenticateUser(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return { userId: user.id };
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(600),
    auth: z.string().trim().min(1).max(600),
  }).strict(),
  userAgent: z.string().trim().max(1000).optional().nullable(),
}).strict();

const deleteSchema = z.object({
  endpoint: z.string().url().max(2000),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, subscriptionSchema, {
      invalidMessage: 'Invalid subscription payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { endpoint, keys, userAgent } = parsed.data;

    const { error } = await getSupabaseAdmin()
      .from('web_push_subscriptions')
      .upsert(
        {
          user_id: auth.userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: userAgent ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('Failed to save push subscription:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, deleteSchema, {
      invalidMessage: 'Invalid subscription payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { endpoint } = parsed.data;

    const { error } = await getSupabaseAdmin()
      .from('web_push_subscriptions')
      .delete()
      .eq('user_id', auth.userId)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('Failed to delete push subscription:', error);
      return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
