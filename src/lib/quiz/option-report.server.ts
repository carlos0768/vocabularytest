/**
 * 報告された選択肢を Gemini に判定させる（サーバー専用）。
 *
 * 判定と差し替え候補を1回の呼び出しで得る。候補は `buildReplacedDistractors` が
 * 誤答生成と同じ検査にかけるので、ここでは AI の出力を信用せず、形だけを zod で見る。
 */

import { z } from 'zod';
import { AI_CONFIG, getAPIKeys, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  OPTION_REPORT_VERDICTS,
  type OptionReportJudgement,
  type OptionReportVerdict,
  type OptionReportWord,
} from '@/lib/quiz/option-report';

export interface JudgeReportedOptionInput extends OptionReportWord {
  reportedOption: string;
  /** その問題で並んでいた選択肢（正解を含む）。重複や並びの不自然さの判定に使う。 */
  options?: readonly string[];
}

const judgementResponseSchema = z.object({
  verdict: z.enum(OPTION_REPORT_VERDICTS as [OptionReportVerdict, ...OptionReportVerdict[]]),
  reason: z.string().default(''),
  replacements: z.array(z.string()).default([]),
  replacementSources: z.array(z.string()).default([]),
});

/** Gemini Controlled Generation schema mirroring `judgementResponseSchema`. */
export const OPTION_REPORT_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: [...OPTION_REPORT_VERDICTS] },
    reason: { type: 'STRING' },
    replacements: { type: 'ARRAY', items: { type: 'STRING' } },
    replacementSources: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['verdict', 'reason', 'replacements', 'replacementSources'],
  propertyOrdering: ['verdict', 'reason', 'replacements', 'replacementSources'],
};

export const OPTION_REPORT_JUDGE_PROMPT = `あなたは英単語4択クイズの品質管理者です。学習者が「この選択肢はおかしい」と報告した誤答選択肢について、本当に問題があるかを判定し、問題があれば差し替え候補を作ってください。

クイズは「英単語を見て、その日本語訳を4つの選択肢から選ぶ」形式です。正解はちょうど1つでなければなりません。

【前提】誤答はわざと紛らわしく作ってあります:
誤答は、出題語と語形（接頭辞・接尾辞・語根・綴り）が似た別の英単語の訳から作っています。語形が似た語は意味も近いことが多く、「正解と意味が近い」「連想できる」「同じ分野の語」という選択肢は意図どおりです。意味が近いことは欠陥ではありません。問題になるのは、報告された選択肢が【出題語そのものの訳として通る】場合だけです。

【判定 (verdict)】次のどれか1つ:
- correct_translation: 報告された選択肢が出題語の正しい訳として通る。基準は「英和辞典の出題語の項にその訳（または明らかに同じ訳の表記違い）が載っているか」「英語の試験で出題語の訳としてその語を書いたら正解になるか」。出題語の別の意味（多義語）・品詞違いの用法・正解の言い換え・「出題語の他の訳」に挙がっているものはこれに当たる
- too_similar: 出題語の訳としては通らないが、正解と意味が近い（類義語・上位語/下位語・同じ分野・ニュアンスが似ている）。これは差し替えません。「辞書には載らないが意味的に近い」はすべてここ
- other_problem: 日本語として壊れている・意味不明で、選択肢として成立していない
- ok: 誤答として成立している（出題語の訳ではなく、正解とも十分に意味が離れている）

迷ったら correct_translation ではなく too_similar か ok にしてください。correct_translation は「出題語をその日本語に訳しても正しい」と辞書の裏付けをもって言えるときだけです。「文脈によっては通るかもしれない」「広い意味では同じ」程度では correct_translation にしないでください。

【差し替え候補 (replacements)】verdict が correct_translation か other_problem のとき、3つ作ります（too_similar と ok のときは空配列）:
- 出題語と語形（接頭辞・接尾辞・語根・綴り）が似ていて、意味は明らかに違う別の英単語を選び、その日本語訳を候補にする。元の英単語を同じ順で replacementSources に入れる
- 候補は出題語の訳として絶対に通らないこと。出題語の多義・品詞違い・派生語・正解の類義語は禁止
- 正解や、残っている他の選択肢と意味が被らないこと
- 正解と同じフォーマット・長さ・意味候補の数（読点区切りの数）にそろえること

【reason】判定の根拠を日本語で1文（40字以内）。学習者にそのまま見せます。too_similar のときは「別の語の訳である」ことが伝わる書き方にしてください（例:「堤防は embankment の訳で bank の訳ではありません」）。

出力はJSONのみ:
{ "verdict": "correct_translation", "reason": "...", "replacements": ["...", "...", "..."], "replacementSources": ["...", "...", "..."] }`;

export function buildOptionReportJudgePrompt(input: JudgeReportedOptionInput): string {
  const others = (input.knownTranslations ?? [])
    .map((value) => value.trim())
    .filter((value) => value && value !== input.japanese.trim());
  const lines = [
    `出題語（英語）: ${input.english}`,
    `正解の訳: ${input.japanese}`,
    `出題語の他の訳（辞書上の別の意味。これらも正解として通る）: ${others.length > 0 ? others.join('、') : '（なし）'}`,
    `報告された選択肢: ${input.reportedOption}`,
  ];
  if (input.options && input.options.length > 0) {
    lines.push(`その問題の選択肢（正解を含む）: ${input.options.join(' / ')}`);
  }
  return `${OPTION_REPORT_JUDGE_PROMPT}\n\n${lines.join('\n')}`;
}

export async function judgeReportedOption(input: JudgeReportedOptionInput): Promise<OptionReportJudgement> {
  const config = {
    ...AI_CONFIG.defaults.gemini,
    // 判定は一貫性が命。創造性は差し替え候補にしか要らない。
    temperature: 0.2,
    maxOutputTokens: 1024,
    responseFormat: 'json' as const,
    responseSchema: OPTION_REPORT_RESPONSE_SCHEMA,
  };
  const provider = getProviderFromConfig(config, getAPIKeys());
  const result = await provider.generateText(buildOptionReportJudgePrompt(input), config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI option report response is empty' : result.error);
  }
  const parsed = judgementResponseSchema.parse(parseJsonResponse(result.content));
  return {
    verdict: parsed.verdict,
    reason: parsed.reason.trim().slice(0, 120),
    replacements: parsed.replacements.map((value) => value.trim()).filter(Boolean).slice(0, 5),
    replacementSources: parsed.replacementSources.map((value) => value.trim()).slice(0, 5),
  };
}
