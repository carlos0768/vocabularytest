import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  checkAndIncrementFeatureUsage,
  isAiUsageLimitsEnabled,
  readNumberEnv,
} from '@/lib/ai/feature-usage';
import {
  OPTION_REPORT_FEATURE_KEY,
  OPTION_REPORT_FREE_DAILY_LIMIT,
  OPTION_REPORT_PRO_DAILY_UNLIMITED,
  buildReplacedDistractors,
  isProblemVerdict,
  type OptionReportJudgement,
} from '@/lib/quiz/option-report';
import { judgeReportedOption } from '@/lib/quiz/option-report.server';
import { normalizeJapaneseSense } from '@/lib/quiz/distractor-safety';

/**
 * 四択の「選択肢がおかしい」報告。
 *
 * 1. 報告された選択肢が本当におかしいかを Gemini に判定させる
 * 2. おかしければ、その単語の誤答配列 (`words.distractors`) からその選択肢を外し、
 *    判定が返した候補のうち検査を通ったものに差し替える
 * 3. 同じ誤答がマスター (`lexicon_senses.distractors`) にもあれば、そちらも直す
 *    （他のユーザーにも同じ誤答が配られているため）
 * 4. 報告と判定を `quiz_option_reports` に残す（best-effort）
 *
 * 単語行の読み書きはユーザーのクライアント（RLS）で行い、本人の単語しか直せない。
 */

export const maxDuration = 30;

const requestSchema = z.object({
  wordId: z.string().trim().min(1).max(80),
  reportedOption: z.string().trim().min(1).max(300),
  /** 画面に出ていた選択肢（正解を含む）。判定の材料にするだけで、保存はしない。 */
  options: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
}).strict();

interface WordRow {
  id: string;
  english: string;
  japanese: string | null;
  distractors: unknown;
  lexicon_sense_id?: string | null;
  project_id?: string | null;
}

interface ReportOptionDeps {
  createClient?: typeof createRouteHandlerClient;
  getAdmin?: typeof getSupabaseAdmin;
  judge?: typeof judgeReportedOption;
}

function isMissingColumnOrRelationError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204'
    || message.includes('does not exist') || message.includes('schema cache') || message.includes('could not find');
}

async function loadWordRow(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  wordId: string,
): Promise<WordRow | null> {
  const full = await supabase
    .from('words')
    .select('id, english, japanese, distractors, lexicon_sense_id, project_id')
    .eq('id', wordId)
    .maybeSingle();
  if (!full.error) return (full.data as WordRow | null) ?? null;
  if (!isMissingColumnOrRelationError(full.error)) {
    throw new Error(full.error.message || 'word_load_failed');
  }
  // lexicon 列が無い互換環境では従来の列だけで読む。
  const fallback = await supabase
    .from('words')
    .select('id, english, japanese, distractors')
    .eq('id', wordId)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message || 'word_load_failed');
  return (fallback.data as WordRow | null) ?? null;
}

async function loadKnownTranslations(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  wordId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('word_translations')
    .select('translation_ja')
    .eq('word_id', wordId);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => (row as { translation_ja?: unknown }).translation_ja)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

/**
 * マスターの誤答にも同じ選択肢が入っていれば、単語行と同じ差し替えを当てる。
 * best-effort: 失敗しても報告の結果には影響させない。
 */
async function fixLexiconSenseDistractors(
  admin: ReturnType<typeof getSupabaseAdmin>,
  senseId: string,
  reportedOption: string,
  replacement: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from('lexicon_senses')
    .select('distractors')
    .eq('id', senseId)
    .maybeSingle();
  if (error || !data) return false;
  const current = Array.isArray((data as { distractors?: unknown }).distractors)
    ? ((data as { distractors: unknown[] }).distractors).filter((item): item is string => typeof item === 'string')
    : [];
  const reportedKey = normalizeJapaneseSense(reportedOption);
  if (!current.some((item) => normalizeJapaneseSense(item) === reportedKey)) return false;
  const next = current.flatMap((item) => {
    if (normalizeJapaneseSense(item) !== reportedKey) return [item];
    return replacement && !current.some((other) => normalizeJapaneseSense(other) === normalizeJapaneseSense(replacement))
      ? [replacement]
      : [];
  });
  const { error: updateError } = await admin
    .from('lexicon_senses')
    .update({ distractors: next })
    .eq('id', senseId);
  return !updateError;
}

async function recordReport(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: {
    user_id: string;
    word_id: string;
    project_id: string | null;
    english: string;
    japanese: string;
    reported_option: string;
    verdict: string;
    reason: string;
    replacement: string | null;
    fixed: boolean;
    lexicon_fixed: boolean;
  },
): Promise<void> {
  const { error } = await admin.from('quiz_option_reports').insert(row);
  if (error && !isMissingColumnOrRelationError(error)) {
    console.error('[quiz/report-option] report insert failed (non-critical):', error);
  }
}

export async function handleQuizOptionReportPost(request: NextRequest, deps?: ReportOptionDeps) {
  try {
    const createClient = deps?.createClient ?? createRouteHandlerClient;
    const getAdmin = deps?.getAdmin ?? getSupabaseAdmin;
    const judge = deps?.judge ?? judgeReportedOption;

    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '報告の形式が不正です',
    });
    if (!parsed.ok) return parsed.response;

    const { wordId, reportedOption, options } = parsed.data;

    // RLS で本人の単語だけが読める。見つからなければ他人の単語か削除済み。
    const word = await loadWordRow(supabase, wordId);
    if (!word || !word.japanese?.trim()) {
      return NextResponse.json({ success: false, error: '単語が見つかりません' }, { status: 404 });
    }
    if (normalizeJapaneseSense(reportedOption) === normalizeJapaneseSense(word.japanese)) {
      return NextResponse.json({ success: false, error: '正解の選択肢は報告できません' }, { status: 400 });
    }

    // AI を呼ぶので回数を数える。形式の不正や存在しない単語では減らさない。
    if (isAiUsageLimitsEnabled()) {
      const usage = await checkAndIncrementFeatureUsage({
        supabase,
        featureKey: OPTION_REPORT_FEATURE_KEY,
        freeDailyLimit: readNumberEnv('AI_LIMIT_QUIZ_OPTION_REPORT_FREE_DAILY', OPTION_REPORT_FREE_DAILY_LIMIT),
        proDailyLimit: readNumberEnv('AI_LIMIT_QUIZ_OPTION_REPORT_PRO_DAILY', OPTION_REPORT_PRO_DAILY_UNLIMITED),
      });
      if (!usage.allowed) {
        return NextResponse.json(
          { success: false, error: `本日の選択肢の報告の上限（${usage.limit ?? '∞'}回）に達しました。`, limitReached: true },
          { status: 429 },
        );
      }
    }

    const knownTranslations = await loadKnownTranslations(supabase, wordId);

    let judgement: OptionReportJudgement;
    try {
      judgement = await judge({
        english: word.english,
        japanese: word.japanese,
        knownTranslations,
        reportedOption,
        options,
      });
    } catch (error) {
      console.error('[quiz/report-option] judge failed:', error);
      return NextResponse.json(
        { success: false, error: '選択肢の確認に失敗しました。時間をおいてお試しください。' },
        { status: 502 },
      );
    }

    const problem = isProblemVerdict(judgement.verdict);
    const stored = Array.isArray(word.distractors) ? word.distractors : [];
    let distractors = stored.filter((item): item is string => typeof item === 'string');
    let replacement: string | null = null;
    let fixed = false;
    let lexiconFixed = false;

    if (problem) {
      const replaced = buildReplacedDistractors(
        { english: word.english, japanese: word.japanese, knownTranslations },
        stored,
        reportedOption,
        judgement,
      );
      replacement = replaced.replacement;
      if (replaced.reportedWasStored) {
        const { error: updateError } = await supabase
          .from('words')
          .update({ distractors: replaced.distractors })
          .eq('id', wordId);
        if (updateError) {
          throw new Error(updateError.message || 'word_update_failed');
        }
        distractors = replaced.distractors;
        fixed = true;
      }

      if (word.lexicon_sense_id) {
        try {
          lexiconFixed = await fixLexiconSenseDistractors(getAdmin(), word.lexicon_sense_id, reportedOption, replacement);
        } catch (error) {
          console.error('[quiz/report-option] lexicon fix failed (non-critical):', error);
        }
      }
    }

    try {
      await recordReport(getAdmin(), {
        user_id: user.id,
        word_id: wordId,
        project_id: word.project_id ?? null,
        english: word.english.slice(0, 200),
        japanese: word.japanese.slice(0, 300),
        reported_option: reportedOption.slice(0, 300),
        verdict: judgement.verdict,
        reason: judgement.reason.slice(0, 200),
        replacement,
        fixed,
        lexicon_fixed: lexiconFixed,
      });
    } catch (error) {
      console.error('[quiz/report-option] report record failed (non-critical):', error);
    }

    return NextResponse.json({
      success: true,
      verdict: judgement.verdict,
      reason: judgement.reason,
      fixed,
      replacement,
      distractors,
    });
  } catch (error) {
    console.error('[quiz/report-option] error:', error);
    return NextResponse.json({ success: false, error: '選択肢の報告に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleQuizOptionReportPost(request);
}
