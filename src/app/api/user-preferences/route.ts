import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';

const updateSchema = z.object({
  aiEnabled: z.boolean(),
}).strict();

type PreferenceRow = {
  ai_enabled: boolean | null;
};

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

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('user_preferences')
      .select('ai_enabled')
      .eq('user_id', userId)
      .maybeSingle<PreferenceRow>();

    if (error) {
      console.error('Failed to fetch user preferences:', error);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    return NextResponse.json({
      aiEnabled: data?.ai_enabled ?? null,
    });
  } catch (error) {
    console.error('User preferences GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, updateSchema, {
      invalidMessage: 'Invalid preferences payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const supabase = await createRouteHandlerClient(request);
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          ai_enabled: parsed.data.aiEnabled,
        },
        { onConflict: 'user_id' }
      )
      .select('ai_enabled')
      .single<PreferenceRow>();

    if (error) {
      console.error('Failed to update user preferences:', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json({
      aiEnabled: data.ai_enabled,
    });
  } catch (error) {
    console.error('User preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
