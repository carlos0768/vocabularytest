import { getSupabaseAdmin } from '@/lib/supabase/admin';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export type QuizWordMissEvent = {
  wordId?: string | null;
  projectId?: string | null;
  english: string;
  japanese: string;
};

/**
 * Normalizes an English term into a stable aggregation key so the same word
 * studied by different members collapses into a single "most-missed" entry.
 */
export function normalizeMissKey(english: string): string {
  return english.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42P01'
    || (message.includes('quiz_word_misses') && (
      message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('could not find')
      || message.includes('relation')
    ));
}

/**
 * Logs a single wrong quiz answer. Failures are swallowed (best-effort
 * analytics) so they never interrupt the quiz flow.
 */
export async function recordQuizWordMiss(
  userId: string,
  event: QuizWordMissEvent,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<{ recorded: boolean }> {
  const englishKey = normalizeMissKey(event.english);
  if (!englishKey) return { recorded: false };

  const { error } = await admin
    .from('quiz_word_misses')
    .insert({
      user_id: userId,
      word_id: event.wordId ?? null,
      project_id: event.projectId ?? null,
      english_key: englishKey,
      english: event.english.trim().slice(0, 200),
      japanese: event.japanese.trim().slice(0, 300),
    });

  if (error) {
    if (isMissingRelationError(error)) return { recorded: false };
    throw new Error(error.message || 'quiz_word_miss_insert_failed');
  }

  return { recorded: true };
}
