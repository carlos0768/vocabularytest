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

const registerSchema = z.object({
  deviceToken: z.string().trim().min(1).max(200),
  bundleId: z.string().trim().max(200).optional(),
  appVersion: z.string().trim().max(50).optional().nullable(),
  osVersion: z.string().trim().max(50).optional().nullable(),
}).strict();

const deleteSchema = z.object({
  deviceToken: z.string().trim().min(1).max(200),
}).strict();

// POST: Register or update device token
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, registerSchema, {
      invalidMessage: 'Invalid device token payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { deviceToken, bundleId, appVersion, osVersion } = parsed.data;

    const { error } = await getSupabaseAdmin()
      .from('ios_device_tokens')
      .upsert(
        {
          user_id: auth.userId,
          device_token: deviceToken,
          bundle_id: bundleId ?? 'com.merken.iosnative',
          app_version: appVersion ?? null,
          os_version: osVersion ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_token' }
      );

    if (error) {
      console.error('Failed to save iOS device token:', error);
      return NextResponse.json({ error: 'Failed to save device token' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('iOS device token POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Unregister device token (e.g. on logout)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, deleteSchema, {
      invalidMessage: 'Invalid device token payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { deviceToken } = parsed.data;

    const { error } = await getSupabaseAdmin()
      .from('ios_device_tokens')
      .delete()
      .eq('user_id', auth.userId)
      .eq('device_token', deviceToken);

    if (error) {
      console.error('Failed to delete iOS device token:', error);
      return NextResponse.json({ error: 'Failed to delete device token' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('iOS device token DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
