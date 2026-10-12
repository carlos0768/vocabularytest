/**
 * 1回の録音から、単語帳に入れる見出し語を1つだけ決める。
 *
 * 音声で追加は「1回の録音 = 1語 (熟語なら1つ)」。書き起こしを空白で割ると、
 * 聞き違い (apple → "a pole") がそのまま2語として追加されてしまうので、
 * 発話全体を1項目として扱い、割ることはしない。
 *
 * 日本人の発音の英語は en-US の認識だけでは別の語に化けやすい (カタカナ寄りの
 * 発音は英語モデルの想定外)。そこで ja-JP でも同時に認識しておく —— こちらは
 * 「アップル」のようにカタカナで拾える。英語の認識が自信を持って1語を返した
 * ときはそれを使い、そうでなければ両方の候補を生成AIに渡して、学習者が
 * 言おうとした英語を1つだけ選ばせる。AIが失敗したら英語の最有力候補に落とす。
 * どの経路でも返すのは高々1項目。
 */

import { z } from 'zod';
import { AI_CONFIG, getAPIKeys, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { MAX_DICTATED_ENTRY_LENGTH } from './dictated-words-limits';

/** 熟語として扱う語数の上限。これより長い並びは文であって見出し語ではない。 */
const MAX_WORDS_PER_ENTRY = 6;

/** AIに渡す候補の数。認識側の候補数 (5) に合わせ、余計なものは渡さない。 */
const MAX_CANDIDATES_PER_LANGUAGE = 5;

/** 候補1つの長さの上限。1語ぶんの発話でこれを超えることは無い。 */
const MAX_CANDIDATE_LENGTH = 80;

/**
 * 英語の認識をそのまま信じてよい確信度。これ以上なら AI を呼ばない
 * (はっきり発音できた語でまで待たせない)。日本人の発音で化けたときは
 * 確信度が下がるので、AI の判断に回る。
 */
export const CONFIDENT_ENGLISH_THRESHOLD = 0.85;

/** 言い淀み。認識側が拾ってしまったときだけ落とす。 */
const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'eh', 'hmm', 'mm', 'erm', 'uhm']);

/** 見出し語にしてよい形。英字で始まり、英字・アポストロフィ・ハイフン・空白だけ。 */
const ENTRY_PATTERN = /^[a-z][a-z'\- ]*$/i;

/**
 * 1項目を見出し語の形に整える。使えないものは null。
 *
 * 認識結果に付く句読点を落とし、空白を詰める。大文字小文字はそのまま残す
 * (固有名詞の大文字は意味があり、認識側は普通の語を小文字で返す)。
 */
export function normalizeDictatedEntry(raw: string): string | null {
  const text = raw
    .replace(/[“”"「」]/g, '')
    .replace(/[.,!?;:、。]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-']+|[-']+$/g, '')
    .trim();

  if (!text || text.length > MAX_DICTATED_ENTRY_LENGTH) return null;
  if (!ENTRY_PATTERN.test(text)) return null;

  const words = text.split(' ');
  if (words.length > MAX_WORDS_PER_ENTRY) return null;
  if (words.every((word) => FILLER_WORDS.has(word.toLowerCase()))) return null;
  return text;
}

export interface SpokenEntryCandidates {
  /** en-US の認識候補 (先頭が最有力)。 */
  english: readonly string[];
  /** en-US の最有力候補の確信度 (0〜1)。 */
  englishConfidence: number;
  /** ja-JP の認識候補 (先頭が最有力)。カタカナで拾えた発音が入る。 */
  japanese: readonly string[];
}

function cleanCandidates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || value.length > MAX_CANDIDATE_LENGTH || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= MAX_CANDIDATES_PER_LANGUAGE) break;
  }
  return result;
}

const resolveResponseSchema = z.object({
  entry: z.string().default(''),
});

/** Gemini Controlled Generation schema mirroring `resolveResponseSchema`. */
export const SPOKEN_ENTRY_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    entry: { type: 'STRING' },
  },
  required: ['entry'],
};

const RESOLVE_PROMPT = `あなたは日本人の英語学習者の単語帳づくりを手伝うアシスタントです。
学習者は覚えたい英単語か英語の熟語を「1つだけ」声に出しました。日本語なまりの発音のことがあります。
その音声を英語の音声認識と日本語の音声認識の両方にかけた結果を渡すので、
学習者が言おうとした英単語（または熟語）を1つだけ答えてください。

判断のしかた:
- 英語の認識結果は、日本語なまりのせいで別の語に聞き違えられていることがある（例: "a pole" は apple の聞き違い）
- 日本語の認識結果は、英語の発音をカタカナで拾っていることがある（例: アップル → apple、ルック フォワード トゥ → look forward to）
- 両方を照らし合わせ、音が近く、学習者が単語帳に入れそうな語を選ぶ
- 熟語・句動詞は1つの項目として、そのまま答える
- 複数の語を並べて答えない。見出し語は必ず1つ
- 英単語として判断できないときは空文字を返す
- 答えは英語の綴り（小文字。固有名詞のみ大文字）で返す。説明文やMarkdownは出さない。JSONのみ返す

出力形式:
{ "entry": "apple" }`;

export interface SpokenEntryDeps {
  generateText?: (prompt: string) => Promise<string>;
}

async function generateWithProvider(prompt: string): Promise<string> {
  const config = {
    ...AI_CONFIG.lexicon.classifyPos,
    temperature: 0,
    maxOutputTokens: 256,
    responseFormat: 'json' as const,
    responseSchema: SPOKEN_ENTRY_RESPONSE_SCHEMA,
  };

  const provider = getProviderFromConfig(config, getAPIKeys());
  const result = await provider.generateText(prompt, config);

  if (!result.success) throw new Error(result.error);
  return result.content;
}

function formatCandidates(values: readonly string[]): string {
  return values.length > 0 ? values.map((value, index) => `${index + 1}. ${value}`).join('\n') : '(なし)';
}

/**
 * 認識候補から見出し語を1つ決める。決められなければ null。
 *
 * - 英語の最有力候補が確信度高く見出し語の形をしていれば、それをそのまま使う
 * - それ以外は AI に英語・日本語の両候補を見せて1つ選ばせる
 * - AI が失敗・判断不能なら、英語の候補で見出し語の形をしている最初のものに落とす
 */
export async function resolveSpokenEntry(
  candidates: SpokenEntryCandidates,
  deps?: SpokenEntryDeps,
): Promise<string | null> {
  const english = cleanCandidates(candidates.english);
  const japanese = cleanCandidates(candidates.japanese);
  const englishEntries = english
    .map((candidate) => normalizeDictatedEntry(candidate))
    .filter((entry): entry is string => entry !== null);

  const topEnglish = english[0] ? normalizeDictatedEntry(english[0]) : null;
  if (topEnglish && candidates.englishConfidence >= CONFIDENT_ENGLISH_THRESHOLD) {
    return topEnglish;
  }

  const fallback = englishEntries[0] ?? null;
  if (english.length === 0 && japanese.length === 0) return null;

  try {
    const generateText = deps?.generateText ?? generateWithProvider;
    const content = await generateText(
      `${RESOLVE_PROMPT}\n\n英語の音声認識の候補:\n${formatCandidates(english)}\n\n日本語の音声認識の候補:\n${formatCandidates(japanese)}`,
    );
    const parsed = resolveResponseSchema.parse(parseJsonResponse(content));
    const entry = normalizeDictatedEntry(parsed.entry);
    if (entry) return entry;
  } catch (error) {
    console.error('Spoken entry resolve failed:', error);
  }

  return fallback;
}
