/**
 * Passage → Word matching (AI-assisted).
 *
 * Given an English passage and a vocabulary list, ask Gemini to identify
 * where each target word (or idiom / phrasal verb / templatic expression)
 * is *used* in the passage, even when the surface form does not exactly
 * match the stored headword.
 *
 * Examples the plain regex-based highlighter cannot handle on its own:
 *   - "run" ↔ "running" / "ran" (inflection)
 *   - "any other ~ than A" ↔ "any other language than english" (template)
 *   - "a sudden surge in A" ↔ "sudden surge in electricity" (partial template)
 *
 * The rest of the pipeline (rendering highlight spans, opening the word
 * modal on click) is unchanged — this module only returns a list of
 * `{ wordId, matchedText }` tuples that the client overlays on the
 * existing exact-match highlights.
 */

import { z } from 'zod';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';

// ---------- Public types ----------

export interface PassageMatchCandidate {
  /** Stable id of the stored word — returned verbatim in match results. */
  id: string;
  /** Headword or phrase as stored in the project word list. */
  english: string;
  /** Normalized POS tags, if known. Used only for filtering. */
  partOfSpeechTags?: string[];
}

export interface PassageWordMatch {
  /** Candidate word id that matched. */
  id: string;
  /**
   * Exact contiguous substring from the passage that corresponds to the
   * target. Guaranteed (by prompt) to be a verbatim substring of `text`.
   * The client locates this substring in the DOM to wrap it in a span.
   */
  matchedText: string;
}

export interface MatchPassageWordsInput {
  text: string;
  candidates: PassageMatchCandidate[];
}

export interface MatchPassageWordsResult {
  matches: PassageWordMatch[];
}

// ---------- Filtering ----------

/** POS tags that benefit from AI matching (non-noun / non-adjective). */
const AI_MATCH_POS = new Set([
  'verb',
  'idiom',
  'phrasal_verb',
  'preposition',
  'conjunction',
  'adverb',
  'auxiliary',
  'pronoun',
  'determiner',
  'interjection',
  'other',
]);

/**
 * Decide whether a candidate is worth sending to the LLM.
 *
 * Rule (per issue #91):
 *   - Multi-word phrases (spaces in the headword) → always send. This covers
 *     idioms and templatic expressions like "any other ~ than A".
 *   - Single words with a known non-noun / non-adjective POS → send. Verbs
 *     need inflection handling; prepositions / phrasal verbs inflect too.
 *   - Single words that are purely nouns or adjectives → skip. The existing
 *     word-boundary regex on the client handles them fine.
 *   - Single words with unknown POS → skip. The regex handles exact hits
 *     and we don't want to waste tokens guessing about unknowns.
 */
export function shouldSendToAi(candidate: {
  english: string;
  partOfSpeechTags?: string[];
}): boolean {
  const english = candidate.english?.trim() ?? '';
  if (!english) return false;
  if (/\s/.test(english)) return true;
  const tags = candidate.partOfSpeechTags ?? [];
  if (tags.length === 0) return false;
  return tags.some((tag) => AI_MATCH_POS.has(tag));
}

export function filterCandidatesForAi(
  candidates: PassageMatchCandidate[],
): PassageMatchCandidate[] {
  const out: PassageMatchCandidate[] = [];
  const seenId = new Set<string>();
  for (const c of candidates) {
    if (seenId.has(c.id)) continue;
    if (!shouldSendToAi(c)) continue;
    seenId.add(c.id);
    out.push(c);
  }
  return out;
}

// ---------- Prompt + schema ----------

export const PASSAGE_MATCH_SYSTEM_PROMPT = `あなたは英語学習アプリの解析アシスタントです。

入力として英語の本文と、学習者の単語リストが与えられます。単語リストには
各項目の id と英語の見出し語 (english) が含まれます。見出し語は単語、熟語、
句動詞、または "any other ~ than A" のようにスロットを含むテンプレート形式
の場合があります。

あなたのタスク: 本文中で各ターゲットが実際に使われている箇所を検出し、
その箇所の本文そのままの部分文字列を返すこと。

【検出ルール】
1. 活用変化を処理する (例: "run" → "running" / "ran" / "runs")。
2. 語形変化を伴う派生にも対応する (例: "exhaust" → "exhausted" / "exhaustion")。
3. テンプレート表現は実際の語で埋められた全体の範囲を返す。
   例: "any other ~ than A" がターゲットで本文に
       "Do you speak any other language than english?" とあれば、
       matchedText は "any other language than english" とする。
4. スロット (A, B, ~ 等) が部分的にしか埋まっていなくても、現れている部分を返す。
   例: "a sudden surge in A" がターゲットで本文に
       "a sudden surge in electricity demand" とあれば、
       matchedText は "a sudden surge in electricity" とする (長い方を優先)。
5. 同じターゲットが本文中に複数回現れる場合は、出現ごとに1エントリずつ返す。
6. ターゲットが本文に使われていない場合はそのターゲットを省略する (空配列で可)。

【matchedText の厳守事項】
- matchedText は必ず本文そのままの連続した部分文字列にすること (大文字小文字・
  句読点も含めて一字一句そのまま)。
- 本文に出現しない語や、複数の箇所をつなげた合成文字列は絶対に返さない。
- 長さは1文字以上、本文の1箇所を指す最短かつ意味を保てる範囲にする
  (ただしテンプレートの場合は埋められた部分を含めた自然な長さにする)。

【出力形式】厳密な JSON 1オブジェクトのみ:
{
  "matches": [
    { "id": "<入力と同じ id>", "matchedText": "<本文からの正確な部分文字列>" }
  ]
}

出力は JSON のみ。説明文・コードフェンス・前置きは一切つけない。
`;

const passageMatchResponseSchema = z.object({
  matches: z
    .array(
      z.object({
        id: z.string().min(1),
        matchedText: z.string().min(1),
      }),
    )
    .default([]),
});

export function buildPassageMatchUserPrompt(
  text: string,
  candidates: PassageMatchCandidate[],
): string {
  const list = candidates
    .map((c) => `- id: ${c.id}  english: ${JSON.stringify(c.english)}`)
    .join('\n');
  return `【本文】\n${text}\n\n【単語リスト】\n${list}\n\n上のルールに従い、本文中の実際の使用箇所を matchedText として JSON で返してください。`;
}

// ---------- Response parsing ----------

export function parsePassageMatchResponse(
  content: string,
): MatchPassageWordsResult {
  let raw: unknown;
  try {
    raw = parseJsonResponse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse passage-match response JSON: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
  const parsed = passageMatchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid passage-match response shape: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ')}`,
    );
  }
  return { matches: parsed.data.matches };
}

/**
 * Drop any AI matches whose `matchedText` is not actually a substring of
 * the passage. LLMs occasionally hallucinate or normalize whitespace; we
 * refuse to trust those since we cannot safely locate them in the DOM.
 */
export function sanitizeMatches(
  result: MatchPassageWordsResult,
  text: string,
  candidateIds: ReadonlySet<string>,
): MatchPassageWordsResult {
  const cleaned: PassageWordMatch[] = [];
  for (const m of result.matches) {
    if (!candidateIds.has(m.id)) continue;
    const matchedText = m.matchedText?.trim();
    if (!matchedText) continue;
    if (!text.includes(matchedText)) continue;
    cleaned.push({ id: m.id, matchedText });
  }
  return { matches: cleaned };
}

// ---------- Core entry point ----------

/** Hard cap to keep a single call bounded. */
export const MAX_CANDIDATES_PER_CALL = 120;
/** Hard cap on passage length (chars) to avoid runaway costs. */
export const MAX_TEXT_LENGTH = 8000;

type GenerateTextFn = (systemPrompt: string, userPrompt: string) => Promise<
  | { success: true; content: string }
  | { success: false; error: string }
>;

export interface MatchPassageWordsDeps {
  /**
   * Dependency-injected text generator. Defaults to the configured Gemini
   * provider via `AI_CONFIG.defaults.gemini`. Tests override this to return
   * canned responses without hitting the network.
   */
  generateText?: GenerateTextFn;
}

/**
 * Find AI-assisted matches for a vocabulary list in a passage.
 *
 * Returns an empty result (no error) when there is nothing to match, so
 * callers can always render the response directly.
 */
export async function matchPassageWords(
  input: MatchPassageWordsInput,
  deps: MatchPassageWordsDeps = {},
): Promise<MatchPassageWordsResult> {
  const text = input.text?.trim() ?? '';
  if (!text) return { matches: [] };
  if (text.length > MAX_TEXT_LENGTH) {
    // Guard against pathological inputs — never crash, just skip.
    return { matches: [] };
  }

  const eligible = filterCandidatesForAi(input.candidates).slice(
    0,
    MAX_CANDIDATES_PER_CALL,
  );
  if (eligible.length === 0) return { matches: [] };

  const userPrompt = buildPassageMatchUserPrompt(text, eligible);

  const runGenerate: GenerateTextFn =
    deps.generateText ??
    (async (systemPrompt, user) => {
      const config = AI_CONFIG.defaults.gemini;
      const provider = getProviderFromConfig(config, getAPIKeys());
      return provider.generateText(`${systemPrompt}\n\n${user}`, {
        ...config,
        temperature: 0,
        maxOutputTokens: 2048,
        responseFormat: 'json',
      });
    });

  const aiResponse = await runGenerate(
    PASSAGE_MATCH_SYSTEM_PROMPT,
    userPrompt,
  );
  if (!aiResponse.success) {
    throw new Error(`Passage match generation failed: ${aiResponse.error}`);
  }

  const parsed = parsePassageMatchResponse(aiResponse.content);
  const ids = new Set(eligible.map((c) => c.id));
  return sanitizeMatches(parsed, text, ids);
}

// ---------- Client-side overlay helper (pure, DOM-free) ----------

export interface HighlightRange {
  start: number;
  end: number;
  wordId: string;
}

/**
 * Convert a list of AI matches into non-overlapping character ranges on a
 * single block of plain text.
 *
 * Each match entry is consumed in order against the same `matchedText`
 * string: the first match takes the first occurrence, the second match
 * takes the next occurrence, etc. This lets the LLM return one entry per
 * occurrence without us needing global char offsets. Any match whose
 * `matchedText` cannot be located is silently dropped.
 *
 * Overlapping ranges are resolved greedily in favour of the earliest start
 * (ties broken by longer span) — the model rarely produces overlaps, but
 * when it does we prefer the longer, more context-rich span.
 */
export function computeAiHighlightRanges(
  text: string,
  matches: readonly PassageWordMatch[],
): HighlightRange[] {
  if (!text || matches.length === 0) return [];
  const cursors = new Map<string, number>();
  const collected: HighlightRange[] = [];
  for (const m of matches) {
    const needle = m.matchedText;
    if (!needle) continue;
    const from = cursors.get(needle) ?? 0;
    const idx = text.indexOf(needle, from);
    if (idx === -1) continue;
    collected.push({
      start: idx,
      end: idx + needle.length,
      wordId: m.id,
    });
    cursors.set(needle, idx + needle.length);
  }
  collected.sort((a, b) =>
    a.start - b.start || b.end - a.end,
  );
  const filtered: HighlightRange[] = [];
  let lastEnd = -1;
  for (const r of collected) {
    if (r.start < lastEnd) continue;
    filtered.push(r);
    lastEnd = r.end;
  }
  return filtered;
}
