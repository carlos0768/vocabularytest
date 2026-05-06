import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
    if (error || !user) return null;
    return user.id;
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createRouteHandlerClient(request);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_last_opened')
      .upsert(
        {
          user_id: userId,
          last_opened_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('Failed to update user last opened:', error);
      return NextResponse.json({ error: 'Failed to update user last opened' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('User last opened error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
