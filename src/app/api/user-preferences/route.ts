import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  DEFAULT_STUDY_REMINDER_ENABLED,
  DEFAULT_STUDY_REMINDER_TIMES,
  DEFAULT_STUDY_REMINDER_TIMEZONE,
  MAX_STUDY_REMINDER_TIMES,
  isSupportedTimeZone,
  isValidStudyReminderId,
  isValidStudyReminderTimeValue,
  normalizeStudyReminderTimes,
  type StudyReminderTime,
} from '@/lib/notifications/study-reminders';
import {
  MAX_EXAMPLE_GENRES,
  MAX_EXAMPLE_GENRE_LENGTH,
  normalizeExampleGenres,
} from '@/lib/preferences/example-genres';

const updateSchema = z.object({
  aiEnabled: z.boolean().optional(),
  exampleGenres: z.array(z.string().trim().min(1).max(MAX_EXAMPLE_GENRE_LENGTH))
    .max(MAX_EXAMPLE_GENRES)
    .optional(),
  studyReminderEnabled: z.boolean().optional(),
  studyReminderTimes: z.array(z.object({
    id: z.string().trim().min(1).max(40).refine(isValidStudyReminderId),
    time: z.string().trim().refine(isValidStudyReminderTimeValue),
    enabled: z.boolean(),
  }).strict())
    .min(1)
    .max(MAX_STUDY_REMINDER_TIMES)
    .refine((times) => new Set(times.map((time) => time.id)).size === times.length, {
      message: 'Reminder ids must be unique',
    })
    .refine((times) => new Set(times.map((time) => time.time)).size === times.length, {
      message: 'Reminder times must be unique',
    })
    .optional(),
  studyReminderTimezone: z.string().trim().min(1).max(100).refine(isSupportedTimeZone).optional(),
}).strict().refine(
  (value) =>
    value.aiEnabled !== undefined ||
    value.exampleGenres !== undefined ||
    value.studyReminderEnabled !== undefined ||
    value.studyReminderTimes !== undefined ||
    value.studyReminderTimezone !== undefined,
  { message: 'At least one preference field is required' },
);

type PreferenceRow = {
  ai_enabled: boolean | null;
  example_genres: unknown;
  study_reminder_enabled: boolean | null;
  study_reminder_times: unknown;
  study_reminder_timezone: string | null;
};

type LegacyPreferenceRow = {
  ai_enabled: boolean | null;
};

const PREFERENCE_SELECT_COLUMNS = 'ai_enabled, example_genres, study_reminder_enabled, study_reminder_times, study_reminder_timezone';

// マイグレーション未適用環境向け: 新しめのカラムが無い場合は ai_enabled のみで読む
function isMissingStudyReminderColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (
    candidate.code === '42703' ||
    candidate.code === 'PGRST204' ||
    message.includes('study_reminder_') ||
    message.includes('example_genres')
  );
}

function normalizePreferenceResponse(data: PreferenceRow | null): {
  aiEnabled: boolean | null;
  exampleGenres: string[];
  studyReminderEnabled: boolean;
  studyReminderTimes: StudyReminderTime[];
  studyReminderTimezone: string;
} {
  const timeZone = data?.study_reminder_timezone;

  return {
    aiEnabled: data?.ai_enabled ?? null,
    exampleGenres: normalizeExampleGenres(data?.example_genres),
    studyReminderEnabled: data?.study_reminder_enabled ?? DEFAULT_STUDY_REMINDER_ENABLED,
    studyReminderTimes: data
      ? normalizeStudyReminderTimes(data.study_reminder_times)
      : [...DEFAULT_STUDY_REMINDER_TIMES],
    studyReminderTimezone: isSupportedTimeZone(timeZone)
      ? timeZone
      : DEFAULT_STUDY_REMINDER_TIMEZONE,
  };
}

function normalizeLegacyPreferenceResponse(data: LegacyPreferenceRow | null) {
  return normalizePreferenceResponse({
    ai_enabled: data?.ai_enabled ?? null,
    example_genres: [],
    study_reminder_enabled: DEFAULT_STUDY_REMINDER_ENABLED,
    study_reminder_times: DEFAULT_STUDY_REMINDER_TIMES,
    study_reminder_timezone: DEFAULT_STUDY_REMINDER_TIMEZONE,
  });
}

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
      .select(PREFERENCE_SELECT_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle<PreferenceRow>();

    if (error) {
      if (isMissingStudyReminderColumnError(error)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('user_preferences')
          .select('ai_enabled')
          .eq('user_id', userId)
          .maybeSingle<LegacyPreferenceRow>();

        if (!legacyError) {
          return NextResponse.json(normalizeLegacyPreferenceResponse(legacyData ?? null));
        }
      }

      console.error('Failed to fetch user preferences:', error);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    return NextResponse.json(normalizePreferenceResponse(data ?? null));
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

    const updatePayload: Record<string, unknown> = {
      user_id: userId,
    };
    if (parsed.data.aiEnabled !== undefined) {
      updatePayload.ai_enabled = parsed.data.aiEnabled;
    }
    if (parsed.data.exampleGenres !== undefined) {
      const normalizedGenres = normalizeExampleGenres(parsed.data.exampleGenres);
      updatePayload.example_genres = normalizedGenres;
    }
    if (parsed.data.studyReminderEnabled !== undefined) {
      updatePayload.study_reminder_enabled = parsed.data.studyReminderEnabled;
    }
    if (parsed.data.studyReminderTimes !== undefined) {
      updatePayload.study_reminder_times = parsed.data.studyReminderTimes;
    }
    if (parsed.data.studyReminderTimezone !== undefined) {
      updatePayload.study_reminder_timezone = parsed.data.studyReminderTimezone;
    }
    const updatesStudyReminders =
      parsed.data.exampleGenres !== undefined ||
      parsed.data.studyReminderEnabled !== undefined ||
      parsed.data.studyReminderTimes !== undefined ||
      parsed.data.studyReminderTimezone !== undefined;

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        updatePayload,
        { onConflict: 'user_id' }
      )
      .select(PREFERENCE_SELECT_COLUMNS)
      .single<PreferenceRow>();

    if (error) {
      if (!updatesStudyReminders && isMissingStudyReminderColumnError(error)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('user_preferences')
          .select('ai_enabled')
          .eq('user_id', userId)
          .single<LegacyPreferenceRow>();

        if (!legacyError) {
          return NextResponse.json(normalizeLegacyPreferenceResponse(legacyData));
        }
      }

      console.error('Failed to update user preferences:', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json(normalizePreferenceResponse(data));
  } catch (error) {
    console.error('User preferences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
