import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  DEFAULT_STUDY_REMINDER_TIMEZONE,
  getLocalDateTimeParts,
  isSupportedTimeZone,
} from '@/lib/notifications/study-reminders';
import { sendStudyReminderPushNotifications } from '@/lib/notifications/web-push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

export const dynamic = 'force-dynamic';

const testNotificationSchema = z.object({
  timeZone: z.string().trim().min(1).max(100).refine(isSupportedTimeZone).optional(),
}).strict();

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

    const parsed = await parseJsonWithSchema(request, testNotificationSchema, {
      invalidMessage: 'Invalid test notification payload',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const timeZone = parsed.data.timeZone ?? DEFAULT_STUDY_REMINDER_TIMEZONE;
    const local = getLocalDateTimeParts(new Date(), timeZone);
    const result = await sendStudyReminderPushNotifications(getSupabaseAdmin(), {
      userId,
      reminderTime: local.time,
      localDateKey: local.dateKey,
      timeZone,
    });

    return NextResponse.json({
      success: result.sent > 0,
      ...result,
    });
  } catch (error) {
    console.error('[study-reminders] test notification failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
