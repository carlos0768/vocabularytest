/**
 * 派生語の AI 生成
 *
 * morphology/generate.ts と同じ構造:
 * - 1語ずつ個別に AI 呼び出し（バッチだと一部の単語を飛ばすため）
 * - 5並列・失敗1回リトライ
 * - DB 保存は呼び出し側（resolve.ts）の責任
 *
 * 「生成する価値があるか」の判定はここでは行わない。呼び出す前に
 * `eligibility.ts` の足切りを通すこと（コーパスと頻度から事前計算した
 * オフライン判定なので、AI を呼ばずに済む単語はここまで来ない）。
 *
 * 派生語の列挙自体は AI に任せる。コーパスは不規則派生
 * (receive→reception, maintain→maintenance) を拾えないため、
 * 候補リストを渡すとかえって出力が悪くなる。代わりに track A の語根族が
 * 分かっている単語では「語根とその意味」を文脈として渡し、
 * 語根を共有しない語（単なる類義語）が混ざるのを抑える。
 */

import { AI_CONFIG, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  DERIVED_WORD_EXAM_TAGS,
  DERIVED_WORD_POS,
  MAX_DERIVED_WORDS,
  derivedWordsAiResponseSchema,
} from '@/lib/schemas/derived-words';
import type { DerivedWordItem, WordDerivedWords } from '../../../shared/types';
import type { DerivedWordsEligibility } from './eligibility';

// ---------- Types ----------

export interface DerivedWordsSeed {
  english: string;
  /** 足切りの結果。語根族が分かっていればプロンプトの文脈に使う */
  eligibility: DerivedWordsEligibility;
}

export interface GeneratedDerivedWords {
  english: string;
  /** null = AI が「出す価値のある派生語なし」と判定 */
  derivedWords: WordDerivedWords | null;
}

export interface GenerateDerivedWordsResult {
  results: GeneratedDerivedWords[];
  errors: string[];
}

type GenerateSingleDependency = (
  seed: DerivedWordsSeed,
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GeneratedDerivedWords>;

const CONCURRENCY = 5;

// ---------- Prompt ----------

const SYSTEM_PROMPT = `あなたは日本の大学受験・TOEFL・IELTS を指導する英語講師です。与えられた英単語の「派生語」をJSONで返してください。

【派生語の定義】
同じ語根を共有し、接尾辞などで品詞や意味が変化した語のこと。
例: receive → reception(名) / receptive(形) / recipient(名)
例: analyze → analysis(名) / analytical(形) / analyst(名)

【ルール】
1. 最大${MAX_DERIVED_WORDS}語まで。試験で実際に問われる価値が高い順に並べる
2. 語根を共有する語だけを出す。意味が似ているだけの類義語・関連語は出さない
   （例: receive に対する get / obtain は誤り）
3. 単なる屈折変化（-s, -ed, -ing, 比較級）は派生語ではないので出さない
4. 入力語そのもの、および綴り違い（analyze/analyse のような英米差）は出さない
5. 受験・TOEFL・IELTS で出題されない専門語・稀語は出さない。
   価値のある派生語が1語もなければ hasDerivedWords を false にして items を空にする
6. 質を優先する。3語に満たなくてよい。無理に埋めない
7. japanese は単語帳向けの簡潔な訳（訳語のみ・説明不要・最大20字）
8. examTags はその語形が問われる試験を挙げる。該当が曖昧なら空配列でよい
   kyotsu=共通テスト / kokkouritsu=国公立二次 / shiritsu=私大 / toefl / ielts / eiken=英検

【出力形式】JSON
{
  "hasDerivedWords": true,
  "items": [
    { "english": "reception", "japanese": "受付・歓迎会", "partOfSpeech": "noun", "examTags": ["toefl", "shiritsu"] },
    { "english": "receptive", "japanese": "受容力のある", "partOfSpeech": "adjective", "examTags": ["toefl", "ielts"] }
  ]
}`;

export const DERIVED_WORDS_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    hasDerivedWords: { type: 'BOOLEAN' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          english: { type: 'STRING' },
          japanese: { type: 'STRING' },
          partOfSpeech: { type: 'STRING', enum: [...DERIVED_WORD_POS] },
          examTags: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: [...DERIVED_WORD_EXAM_TAGS] },
          },
        },
        required: ['english', 'japanese', 'partOfSpeech'],
        propertyOrdering: ['english', 'japanese', 'partOfSpeech', 'examTags'],
      },
    },
  },
  required: ['hasDerivedWords'],
  propertyOrdering: ['hasDerivedWords', 'items'],
};

export function buildDerivedWordsPrompt(seed: DerivedWordsSeed): string {
  const { rootFamily, prefix, root } = seed.eligibility;
  const lines = [`単語: "${seed.english}"`];

  // 語根が分かっている単語では、語根を明示して「語根を共有する語」に誘導する。
  // 語族の例は語根の意味を固定する文脈であって、答えの候補ではない。
  if (root) {
    lines.push(`この単語の語根: ${prefix ? `${prefix}- + ` : ''}${root}`);
  }
  if (rootFamily) {
    lines.push(`同語根の語（参考・そのまま答えにしないこと）: ${rootFamily.words.slice(0, 8).join(', ')}`);
  }

  return `${SYSTEM_PROMPT}\n\n${lines.join('\n')}`;
}

// ---------- Validation ----------

class DerivedWordsGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivedWordsGenerationError';
  }
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * AI 応答を検証して WordDerivedWords に変換する。
 * - 入力語そのもの・重複は落とす
 * - 上限3件に切り詰める（超過は検証エラーにせず捨てる）
 * - 残りが0件なら null（＝派生語なし）
 */
export function toWordDerivedWords(raw: unknown, english: string): WordDerivedWords | null {
  const parsed = derivedWordsAiResponseSchema.parse(raw);
  if (!parsed.hasDerivedWords) return null;

  const sourceKey = normalizeForCompare(english);
  const seen = new Set<string>();
  const items: DerivedWordItem[] = [];

  for (const item of parsed.items) {
    const key = normalizeForCompare(item.english);
    // 入力語そのもの（および綴り違いで同一化する語）は派生語ではない
    if (!key || key === sourceKey || seen.has(key)) continue;
    seen.add(key);
    items.push({
      english: item.english,
      japanese: item.japanese,
      partOfSpeech: item.partOfSpeech,
      ...(item.examTags && item.examTags.length > 0 ? { examTags: item.examTags } : {}),
    });
    if (items.length >= MAX_DERIVED_WORDS) break;
  }

  if (items.length === 0) return null;
  return { items, version: 1 };
}

// ---------- Core ----------

async function generateSingle(
  seed: DerivedWordsSeed,
  apiKeys: { gemini?: string; openai?: string },
): Promise<GeneratedDerivedWords> {
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, apiKeys);

  const aiResponse = await provider.generateText(buildDerivedWordsPrompt(seed), {
    ...config,
    maxOutputTokens: 512,
    responseFormat: 'json',
    responseSchema: DERIVED_WORDS_RESPONSE_SCHEMA,
  });

  if (!aiResponse.success) {
    throw new DerivedWordsGenerationError(
      `AI generation failed for "${seed.english}": ${aiResponse.error}`,
    );
  }

  let raw: unknown;
  try {
    raw = parseJsonResponse(aiResponse.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new DerivedWordsGenerationError(`Failed to parse derived-words response: ${message}`);
  }

  return { english: seed.english, derivedWords: toWordDerivedWords(raw, seed.english) };
}

/**
 * 足切りを通った単語リストに対して派生語を生成する。
 * 失敗した単語は1回だけリトライし、それでも失敗したら errors に積んでスキップ。
 */
export async function generateDerivedWords(
  seeds: DerivedWordsSeed[],
  apiKeys: { gemini?: string; openai?: string },
  deps: { generateSingle?: GenerateSingleDependency } = {},
): Promise<GenerateDerivedWordsResult> {
  if (seeds.length === 0) return { results: [], errors: [] };

  const generateSingleWord = deps.generateSingle ?? generateSingle;
  const results: GeneratedDerivedWords[] = [];
  const errors: string[] = [];
  const firstPassFailures: DerivedWordsSeed[] = [];

  for (let i = 0; i < seeds.length; i += CONCURRENCY) {
    const chunk = seeds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((seed) => generateSingleWord(seed, apiKeys)),
    );
    for (const [index, result] of settled.entries()) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        firstPassFailures.push(chunk[index]!);
      }
    }
  }

  if (firstPassFailures.length > 0) {
    console.log(`[generate-derived-words] Retrying ${firstPassFailures.length} failed words`);
    for (let i = 0; i < firstPassFailures.length; i += CONCURRENCY) {
      const chunk = firstPassFailures.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((seed) => generateSingleWord(seed, apiKeys)),
      );
      for (const [index, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          const message = `${chunk[index]!.english}: ${reason}`;
          console.error('[generate-derived-words] Retry failed:', message);
          errors.push(message);
        }
      }
    }
  }

  return { results, errors };
}

export const __internal = {
  generateSingle,
  buildDerivedWordsPrompt,
  toWordDerivedWords,
};
