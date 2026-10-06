/**
 * 四択の「選択肢がおかしい」報告。
 *
 * 誤答生成 (`generate-quiz-content.ts`) に出題語の正しい訳が混ざると、正解が2つある
 * 問題になる。学習者が気づいた選択肢を報告できるようにし、報告は Gemini に
 * 「本当におかしいか」を判定させ、おかしければその場で別の誤答に差し替える。
 *
 * このファイルは AI を呼ばない純粋な部分（判定結果の型・差し替えの組み立て）。
 * Gemini 呼び出しは `option-report.server.ts`、API は `/api/quiz/report-option`。
 */

import {
  DISTRACTOR_COUNT,
  collectForbiddenSenses,
  isDistractorSenseOfWord,
  isSourceSameOrDerivedWord,
  normalizeJapaneseSense,
} from '@/lib/quiz/distractor-safety';

/**
 * 判定結果。`ok` 以外はすべて「おかしい」= 差し替え対象。
 * - correct_translation: 報告された選択肢は出題語の正しい訳として通る（正解が2つ）
 * - too_similar: 正解の類義語・言い換えで、区別がつかない
 * - other_problem: 日本語として不自然・正解と重複・フォーマットが違う など
 * - ok: 問題なし（誤答として成立している）
 */
export type OptionReportVerdict = 'correct_translation' | 'too_similar' | 'other_problem' | 'ok';

export const OPTION_REPORT_VERDICTS: readonly OptionReportVerdict[] = [
  'correct_translation',
  'too_similar',
  'other_problem',
  'ok',
];

export function isProblemVerdict(verdict: OptionReportVerdict): boolean {
  return verdict !== 'ok';
}

export interface OptionReportJudgement {
  verdict: OptionReportVerdict;
  /** 判定の根拠（学習者に見せる短い一文）。 */
  reason: string;
  /** 差し替え候補（良い順）。`ok` のときは空でよい。 */
  replacements: string[];
  /** replacements と同じ順で、各候補の元になった英単語。 */
  replacementSources: string[];
}

export interface OptionReportWord {
  english: string;
  japanese: string;
  knownTranslations?: readonly string[];
}

/** 置き換え後の誤答配列を組み立てた結果。 */
export interface OptionReplacementResult {
  distractors: string[];
  /** 実際に採用した差し替え。候補が全部使えなければ null（報告された選択肢は外すだけ）。 */
  replacement: string | null;
  /** 報告された選択肢が元の配列に無かった（＝クイズ側のフォールバックで出た選択肢）。 */
  reportedWasStored: boolean;
}

function sameSense(a: string, b: string): boolean {
  return normalizeJapaneseSense(a) === normalizeJapaneseSense(b);
}

/**
 * 報告された選択肢を、判定が返した候補の中で「出題語の訳として通らない」最初の
 * ものに差し替える。候補は AI の出力なので、誤答生成と同じ検査（正解・既知の訳との
 * 一致/包含、元の英単語が出題語や派生語でないか、既存の誤答との重複）を通す。
 *
 * 報告された選択肢が保存済みの誤答に無い（クイズ側のフォールバックで他の語の訳が
 * 出た）場合は、保存済み配列には触らずそのまま返す。
 */
export function buildReplacedDistractors(
  word: OptionReportWord,
  storedDistractors: readonly unknown[],
  reportedOption: string,
  judgement: Pick<OptionReportJudgement, 'replacements' | 'replacementSources'>,
): OptionReplacementResult {
  const stored = storedDistractors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const reportedIndex = stored.findIndex((item) => sameSense(item, reportedOption));
  if (reportedIndex === -1) {
    return { distractors: stored, replacement: null, reportedWasStored: false };
  }

  const remaining = stored.filter((_, index) => index !== reportedIndex);
  const forbidden = collectForbiddenSenses(word);
  const taken = new Set(remaining.map(normalizeJapaneseSense));
  taken.add(normalizeJapaneseSense(reportedOption));

  let replacement: string | null = null;
  judgement.replacements.some((candidate, index) => {
    const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
    if (!trimmed) return false;
    const key = normalizeJapaneseSense(trimmed);
    if (!key || taken.has(key)) return false;
    if (isDistractorSenseOfWord(trimmed, forbidden)) return false;
    const source = judgement.replacementSources[index];
    if (source && isSourceSameOrDerivedWord(source, word.english)) return false;
    replacement = trimmed;
    return true;
  });

  const distractors = replacement
    ? [...remaining.slice(0, reportedIndex), replacement, ...remaining.slice(reportedIndex)]
    : remaining;

  return {
    distractors: distractors.slice(0, Math.max(DISTRACTOR_COUNT, distractors.length)),
    replacement,
    reportedWasStored: true,
  };
}

export const OPTION_REPORT_FREE_DAILY_LIMIT = 20;
/** Proは無制限。0以下は `check_and_increment_feature_usage` が「上限なし」と扱う。 */
export const OPTION_REPORT_PRO_DAILY_UNLIMITED = 0;
export const OPTION_REPORT_FEATURE_KEY = 'quiz_option_report';

/** 学習者に見せる判定の見出し。 */
export function describeOptionReportVerdict(verdict: OptionReportVerdict): string {
  switch (verdict) {
    case 'correct_translation':
      return 'その選択肢も正解として通る訳でした';
    case 'too_similar':
      return '正解と意味が近すぎる選択肢でした';
    case 'other_problem':
      return '選択肢として不適切でした';
    case 'ok':
    default:
      return '選択肢に問題は見つかりませんでした';
  }
}
