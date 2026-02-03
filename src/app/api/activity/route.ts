import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // upsert: 同じ user_id + active_date なら何もしない (ON CONFLICT DO NOTHING)
    const { error } = await supabase
      .from('user_activity_logs')
      .upsert(
        { user_id: user.id, active_date: new Date().toISOString().split('T')[0] },
        { onConflict: 'user_id,active_date', ignoreDuplicates: true }
      );

    if (error) {
      console.error('Failed to log activity:', error);
      return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Activity log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
