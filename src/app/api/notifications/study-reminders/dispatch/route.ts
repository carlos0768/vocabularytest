import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalWorkerRequest } from '@/lib/api/internal-worker';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  DEFAULT_STUDY_REMINDER_TIMEZONE,
  STUDY_REMINDER_DISPATCH_GRACE_MINUTES,
  createStudyReminderDeliveryKey,
  getDueStudyReminderCandidates,
  isSupportedTimeZone,
  normalizeStudyReminderTimes,
} from '@/lib/notifications/study-reminders';
import { sendStudyReminderPushNotifications } from '@/lib/notifications/web-push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const dispatchSchema = z.object({
  now: z.string().datetime().optional(),
  dryRun: z.boolean().optional(),
}).strict();

type ReminderPreferenceRow = {
  user_id: string;
  study_reminder_times: unknown;
  study_reminder_timezone: string | null;
  study_reminder_last_sent_key: string | null;
};

function parseNow(value?: string): Date | null {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const auth = authorizeInternalWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonWithSchema(request, dispatchSchema, {
    invalidMessage: 'Invalid dispatch payload',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const now = parseNow(parsed.data.now);
  if (!now) {
    return NextResponse.json({ error: 'Invalid now timestamp' }, { status: 400 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('user_preferences')
      .select('user_id, study_reminder_times, study_reminder_timezone, study_reminder_last_sent_key')
      .eq('study_reminder_enabled', true);

    if (error) {
      console.error('[study-reminders] failed to fetch preferences:', error);
      return NextResponse.json({ error: 'Failed to fetch reminder preferences' }, { status: 500 });
    }

    let matched = 0;
    let dispatched = 0;
    let sent = 0;
    let removed = 0;
    let failed = 0;

    for (const row of (data ?? []) as ReminderPreferenceRow[]) {
      const timeZone = isSupportedTimeZone(row.study_reminder_timezone)
        ? row.study_reminder_timezone
        : DEFAULT_STUDY_REMINDER_TIMEZONE;
      const dueCandidates = getDueStudyReminderCandidates({
        times: normalizeStudyReminderTimes(row.study_reminder_times),
        now,
        timeZone,
        graceMinutes: STUDY_REMINDER_DISPATCH_GRACE_MINUTES,
      });

      for (const dueCandidate of dueCandidates) {
        const deliveryKey = createStudyReminderDeliveryKey({
          timeZone,
          localDateKey: dueCandidate.localDateKey,
          reminderTime: dueCandidate.time.time,
        });

        if (row.study_reminder_last_sent_key === deliveryKey) {
          continue;
        }

        matched += 1;
        if (parsed.data.dryRun) {
          continue;
        }

        const result = await sendStudyReminderPushNotifications(supabaseAdmin, {
          userId: row.user_id,
          reminderTime: dueCandidate.time.time,
          localDateKey: dueCandidate.localDateKey,
          timeZone,
        });

        sent += result.sent;
        removed += result.removed;
        failed += result.failed;
        dispatched += 1;

        const { error: updateError } = await supabaseAdmin
          .from('user_preferences')
          .update({
            study_reminder_last_sent_key: deliveryKey,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', row.user_id);

        if (updateError) {
          console.error('[study-reminders] failed to update delivery key:', updateError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      matched,
      dispatched,
      sent,
      removed,
      failed,
    });
  } catch (error) {
    console.error('[study-reminders] dispatch failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
