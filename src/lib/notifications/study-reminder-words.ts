import type { SupabaseClient } from '@supabase/supabase-js';

export type StudyReminderWordKind = 'review' | 'wrong';

export type StudyReminderWordPick = {
  id: string;
  english: string;
  kind: StudyReminderWordKind;
};

export const STUDY_REMINDER_WORD_COUNT = 5;
export const STUDY_REMINDER_QUIZ_QUESTION_COUNT = 10;
export const STUDY_REMINDER_REVIEW_WINDOW_HOURS = 24;

type ReviewWordRow = {
  id: string;
  english: string;
  next_review_at: string | null;
};

type WrongAnswerRow = {
  word_id: string;
  english: string;
  last_wrong_at: string;
};

export function buildStudyReminderQuizUrl(wordIds: string[]): string {
  const base = `/quiz/all?reminder=1&count=${STUDY_REMINDER_QUIZ_QUESTION_COUNT}`;
  const ids = wordIds.filter((id) => id.length > 0).slice(0, STUDY_REMINDER_WORD_COUNT);
  if (ids.length === 0) return base;
  return `${base}&priority=${encodeURIComponent(ids.join(','))}`;
}

export function formatStudyReminderBody(
  periodLabel: string,
  picks: StudyReminderWordPick[],
): string {
  if (picks.length === 0) {
    return `${periodLabel}の単語復習の時間です。今日の学習を始めましょう。`;
  }

  const quote = (items: StudyReminderWordPick[]) =>
    items.map((pick) => `「${pick.english}」`).join('');
  const reviewPicks = picks.filter((pick) => pick.kind === 'review');
  const wrongPicks = picks.filter((pick) => pick.kind === 'wrong');

  const lead = reviewPicks.length > 0 && wrongPicks.length > 0
    ? `${quote(reviewPicks)}が復習時期です。最近間違えた${quote(wrongPicks)}も一緒に復習しましょう。`
    : wrongPicks.length > 0
      ? `最近間違えた${quote(wrongPicks)}を復習しましょう。`
      : `${quote(reviewPicks)}の復習時期が近づいています。`;

  return `${periodLabel}の単語復習の時間です。${lead}タップして${STUDY_REMINDER_QUIZ_QUESTION_COUNT}問クイズに挑戦しましょう。`;
}

/**
 * Pick up to 5 words to feature in a study reminder: words whose review is
 * due (or within the next 24h) first, padded with recently mistaken words.
 *
 * Reads only synced (Supabase) data, so users whose words live solely in
 * IndexedDB get an empty result; the quiz page recomputes the same selection
 * client-side via selectReminderQuizWords().
 */
export async function pickStudyReminderWords(
  supabaseAdmin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<StudyReminderWordPick[]> {
  const picks: StudyReminderWordPick[] = [];
  const seenIds = new Set<string>();
  const seenEnglish = new Set<string>();

  const addPick = (id: string, english: string, kind: StudyReminderWordKind) => {
    if (picks.length >= STUDY_REMINDER_WORD_COUNT) return;
    const normalized = english.trim();
    if (!id || !normalized) return;
    if (seenIds.has(id) || seenEnglish.has(normalized.toLowerCase())) return;
    seenIds.add(id);
    seenEnglish.add(normalized.toLowerCase());
    picks.push({ id, english: normalized, kind });
  };

  const windowEnd = new Date(
    now.getTime() + STUDY_REMINDER_REVIEW_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const { data: reviewRows, error: reviewError } = await supabaseAdmin
    .from('words')
    .select('id, english, next_review_at, projects!inner(user_id)')
    .eq('projects.user_id', userId)
    .not('next_review_at', 'is', null)
    .lte('next_review_at', windowEnd.toISOString())
    .order('next_review_at', { ascending: true })
    .limit(STUDY_REMINDER_WORD_COUNT);

  if (reviewError) {
    console.error('[study-reminders] failed to fetch due review words:', reviewError);
  }
  for (const row of (reviewRows ?? []) as ReviewWordRow[]) {
    addPick(row.id, row.english, 'review');
  }

  if (picks.length < STUDY_REMINDER_WORD_COUNT) {
    const { data: wrongRows, error: wrongError } = await supabaseAdmin
      .from('user_wrong_answers')
      .select('word_id, english, last_wrong_at')
      .eq('user_id', userId)
      .order('last_wrong_at', { ascending: false })
      .limit(STUDY_REMINDER_WORD_COUNT * 2);

    if (wrongError) {
      console.error('[study-reminders] failed to fetch wrong answers:', wrongError);
    }
    for (const row of (wrongRows ?? []) as WrongAnswerRow[]) {
      addPick(row.word_id, row.english, 'wrong');
    }
  }

  return picks;
}
