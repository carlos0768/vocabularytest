/**
 * 日本語の読み(ひらがな)を引く。
 *
 * 音読チャレンジ (英→日) は「音が合っているか」を見たいのに、Cloud Speech-to-Text は
 * 認識結果を漢字に変換して返す。正しく「おんしゃ」と言っても最有力が「御社」に
 * なれば、答えの「恩赦」とは表記が一致しない。「コケ」を「苔」と書かれるのも同じ。
 * 期待表記を speechContexts のヒントに渡して寄せてはいるが、それでも割れる。
 *
 * 読みを機械的に求めるには形態素解析辞書が要る (kuromoji で数十MB) ので、
 * サーバーレスに載せる代わりに、既にある生成AIに読みだけを訊く。
 * 呼ぶのは「表記では一致しなかった」ときだけなので、正解した問題では発生しない。
 *
 * 同じ訳語は問題・ユーザーをまたいで何度も出るため、プロセス内にキャッシュする。
 */

import { z } from 'zod';
import { AI_CONFIG, getAPIKeys, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';

/** 1回で読みを引く語数の上限。認識候補+訳語の候補を合わせてもこれで足りる。 */
const MAX_LOOKUP_TEXTS = 16;

/** 訳語1つ分としてありえない長さ。長文を投げつけられても伸びないようにする。 */
const MAX_TEXT_LENGTH = 60;

/** プロセス内キャッシュの上限。訳語は短いので、この数でも数十KB。 */
const CACHE_LIMIT = 2000;

const readingResponseSchema = z.object({
  results: z.array(z.object({
    text: z.string(),
    reading: z.string(),
  })).default([]),
});

/** Gemini Controlled Generation schema mirroring `readingResponseSchema`. */
export const JAPANESE_READING_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          reading: { type: 'STRING' },
        },
        required: ['text', 'reading'],
        propertyOrdering: ['text', 'reading'],
      },
    },
  },
  required: ['results'],
};

const READING_PROMPT = `あなたは日本語の読み仮名を付ける校正者です。
与えられた語句それぞれの読みを、ひらがなだけで返してください。

ルール:
- reading は必ずひらがなのみ。漢字・カタカナ・ローマ字・数字・記号は使わない
- 送り仮名も含めて、その語句を声に出したとおりに書く（例:「気づく」→「きづく」、「恩赦」→「おんしゃ」）
- 読みが複数ある語は、その語句として最も一般的な読みを1つだけ返す
- 読みを確定できない場合は空文字を返す
- text は与えられた語句をそのまま返す
- 説明文やMarkdownは出さない。JSONのみ返す

出力形式:
{
  "results": [
    { "text": "恩赦", "reading": "おんしゃ" }
  ]
}`;

/** ひらがな・カタカナ・長音だけでできているか。漢字が残っていれば読みとして使えない。 */
function isKanaOnly(value: string): boolean {
  return /^[ぁ-ゖァ-ヺー\s]+$/.test(value);
}

/** カタカナをひらがなに畳む。AIがカタカナで返してきたぶんを揃える。 */
function toHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

const readingCache = new Map<string, string>();

function cacheReading(text: string, reading: string): void {
  // 一番古いものから捨てる。読みは書き換わらないので、更新のための削除は要らない。
  if (readingCache.size >= CACHE_LIMIT) {
    const oldest = readingCache.keys().next();
    if (!oldest.done) readingCache.delete(oldest.value);
  }
  readingCache.set(text, reading);
}

/** テストからキャッシュを切り離すため。プロダクションコードからは呼ばない。 */
export function clearJapaneseReadingCache(): void {
  readingCache.clear();
}

export interface JapaneseReadingDeps {
  generateText?: (prompt: string) => Promise<string>;
}

async function generateWithProvider(prompt: string): Promise<string> {
  const config = {
    ...AI_CONFIG.lexicon.classifyPos,
    temperature: 0,
    maxOutputTokens: 1024,
    responseFormat: 'json' as const,
    responseSchema: JAPANESE_READING_RESPONSE_SCHEMA,
  };

  const provider = getProviderFromConfig(config, getAPIKeys());
  const result = await provider.generateText(prompt, config);

  if (!result.success) throw new Error(result.error);
  return result.content;
}

/**
 * 語句ごとの読み(ひらがな)を返す。
 *
 * 引けなかった語は結果に入らない。呼び出し側は読みが無い前提で判定できるので、
 * ここで例外を投げると認識そのものを巻き添えにしてしまう。失敗は握って
 * 「分かったぶんだけ」返す。
 */
export async function lookupJapaneseReadings(
  texts: readonly string[],
  deps?: JapaneseReadingDeps,
): Promise<Record<string, string>> {
  const readings: Record<string, string> = {};
  const missing: string[] = [];

  const seen = new Set<string>();
  for (const raw of texts) {
    const text = raw?.trim();
    if (!text || text.length > MAX_TEXT_LENGTH || seen.has(text)) continue;
    seen.add(text);

    // 既にかなだけの語は、読みを引くまでもなく自分自身が読み。
    if (isKanaOnly(text)) {
      readings[text] = toHiragana(text);
      continue;
    }

    const cached = readingCache.get(text);
    if (cached !== undefined) {
      if (cached) readings[text] = cached;
      continue;
    }

    if (missing.length < MAX_LOOKUP_TEXTS) missing.push(text);
  }

  if (missing.length === 0) return readings;

  try {
    const generateText = deps?.generateText ?? generateWithProvider;
    const content = await generateText(
      `${READING_PROMPT}\n\n対象:\n${missing.map((text, index) => `${index + 1}. ${text}`).join('\n')}`,
    );

    const parsed = readingResponseSchema.parse(parseJsonResponse(content));
    const returned = new Set<string>();

    for (const entry of parsed.results) {
      const text = entry.text.trim();
      if (!missing.includes(text)) continue;
      returned.add(text);

      const reading = toHiragana(entry.reading.trim()).replace(/\s+/g, '');
      // 漢字混じりで返ってきた読みは、突き合わせても表記比較と変わらない。
      // 読みとして使えないものは覚えず、次回に引き直す余地を残す。
      if (!reading || !isKanaOnly(reading)) continue;

      readings[text] = reading;
      cacheReading(text, reading);
    }

    // 読みを出せなかった語は空で覚える。同じ語で毎回AIを呼ばないため。
    for (const text of missing) {
      if (!returned.has(text)) cacheReading(text, '');
    }
  } catch (error) {
    // 読みが無いだけなら表記だけで判定が続く。認識結果は返せるので落とさない。
    console.error('Japanese reading lookup failed:', error);
  }

  return readings;
}
