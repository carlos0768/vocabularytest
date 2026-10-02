/**
 * 音声で読み上げた単語の並びを、単語帳に入れる「見出し語」の一覧に分ける。
 *
 * 書き起こしは「apple banana look forward to beautiful」のように、区切りの無い
 * 1本の文字列で返ってくる。空白で割ると熟語 (look forward to) が1語ずつに
 * ばらけてしまう。単語ごとの発話時刻を見て「間」で区切る手もあるが、
 * Cloud Speech-to-Text は無音を前後の語の長さに吸収して返すことが多く、
 * 間の長さが当てにならない。
 *
 * そこで区切りだけを生成AIに訊く。ただしAIの出力は信用しない ——
 * 書き起こしに連続して現れる語の並びでない項目は捨てるので、AIが語を
 * 書き換えたり、言っていない語を足したりしても一覧には入らない。
 * AIが失敗したときは空白区切りに落とす (熟語はばらけるが、一覧で直せる)。
 */

import { z } from 'zod';
import { AI_CONFIG, getAPIKeys, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import { MAX_DICTATED_ENTRY_LENGTH, MAX_DICTATED_WORDS } from './dictated-words-limits';

export { MAX_DICTATED_ENTRY_LENGTH, MAX_DICTATED_WORDS };

/** 熟語として扱う語数の上限。これより長い並びは文であって見出し語ではない。 */
const MAX_WORDS_PER_ENTRY = 6;

/** AIに渡す書き起こしの上限。55秒ぶんの読み上げで数百文字に収まる。 */
const MAX_TRANSCRIPT_LENGTH = 4000;

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

/** 突き合わせ用に、書き起こしを小文字の語の列にする。 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"“”、。]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** `needle` が `haystack` の中に連続して現れるか。 */
function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * 整形・重複除去・上限をかけて一覧を確定する。
 * 重複は大文字小文字を区別せず、先に出たほうを残す (読み上げ順を保つ)。
 */
export function finalizeDictatedEntries(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of entries) {
    const entry = normalizeDictatedEntry(raw);
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
    if (result.length >= MAX_DICTATED_WORDS) break;
  }
  return result;
}

/** AIを使えないときの区切り方。熟語はばらけるが、言った語は全部残る。 */
export function splitTranscriptByWhitespace(transcript: string): string[] {
  return finalizeDictatedEntries(transcript.split(/[\s,、。.]+/));
}

/**
 * AIが返した項目のうち、書き起こしに実際にあるものだけを残す。
 * 語を書き換えた・足した項目はここで落ちる。
 */
export function keepEntriesFoundInTranscript(
  entries: readonly string[],
  transcript: string,
): string[] {
  const tokens = tokenize(transcript);
  return finalizeDictatedEntries(entries).filter((entry) =>
    containsSequence(tokens, tokenize(entry)),
  );
}

const splitResponseSchema = z.object({
  entries: z.array(z.string()).default([]),
});

/** Gemini Controlled Generation schema mirroring `splitResponseSchema`. */
export const DICTATED_WORDS_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    entries: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['entries'],
};

const SPLIT_PROMPT = `あなたは英語の単語帳づくりを手伝うアシスタントです。
学習者が覚えたい英単語や熟語を、続けて声に出して読み上げました。
その音声の書き起こしを、単語帳の見出し語ごとに区切ってください。

ルール:
- 書き起こしに出てくる語だけを使う。綴りを直したり、語を足したり、言い換えたりしない
- 語の順番は書き起こしのとおりに保つ
- 熟語・句動詞・決まった言い回し (例: look forward to, take care of, in spite of) は1項目にまとめる
- それ以外は1語ずつ別の項目にする
- 言い淀み (um, uh など) は含めない
- 説明文やMarkdownは出さない。JSONのみ返す

出力形式:
{ "entries": ["apple", "look forward to", "beautiful"] }`;

export interface DictatedWordsDeps {
  generateText?: (prompt: string) => Promise<string>;
}

async function generateWithProvider(prompt: string): Promise<string> {
  const config = {
    ...AI_CONFIG.lexicon.classifyPos,
    temperature: 0,
    maxOutputTokens: 2048,
    responseFormat: 'json' as const,
    responseSchema: DICTATED_WORDS_RESPONSE_SCHEMA,
  };

  const provider = getProviderFromConfig(config, getAPIKeys());
  const result = await provider.generateText(prompt, config);

  if (!result.success) throw new Error(result.error);
  return result.content;
}

/**
 * 書き起こしを見出し語の一覧にする。
 *
 * 1語しか無ければ区切るまでもないので、AIは呼ばない。AIが失敗した・
 * 何も残らなかったときは空白区切りに落とす —— 読み上げた語を失うより、
 * 熟語がばらけるほうがましで、一覧の上で直せる。
 */
export async function splitDictatedTranscript(
  transcript: string,
  deps?: DictatedWordsDeps,
): Promise<string[]> {
  const text = transcript.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
  if (!text) return [];

  const fallback = splitTranscriptByWhitespace(text);
  if (fallback.length <= 1) return fallback;

  try {
    const generateText = deps?.generateText ?? generateWithProvider;
    const content = await generateText(`${SPLIT_PROMPT}\n\n書き起こし:\n${text}`);
    const parsed = splitResponseSchema.parse(parseJsonResponse(content));
    const entries = keepEntriesFoundInTranscript(parsed.entries, text);
    if (entries.length > 0) return entries;
  } catch (error) {
    console.error('Dictated word split failed:', error);
  }

  return fallback;
}
