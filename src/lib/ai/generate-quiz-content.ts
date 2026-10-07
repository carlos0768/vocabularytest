import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { buildExampleGenreGuidance } from '@/lib/preferences/example-genres';
import { isWordOrderEligible } from '@/lib/quiz/word-order';
import {
  DISTRACTOR_CANDIDATE_COUNT,
  DISTRACTOR_COUNT,
  selectSafeDistractors,
} from '@/lib/quiz/distractor-safety';

// 誤答の安全性検査はクライアント (選択肢の報告) からも使うので、AI プロバイダに
// 依存しない `@/lib/quiz/distractor-safety` に置き、ここからは再エクスポートだけする。
// このファイル自体は providers を読むのでクライアントに import してはいけない。
export {
  DISTRACTOR_CANDIDATE_COUNT,
  DISTRACTOR_COUNT,
  collectForbiddenSenses,
  isDistractorSenseOfWord,
  isSourceSameOrDerivedWord,
  normalizeJapaneseSense,
  selectSafeDistractors,
} from '@/lib/quiz/distractor-safety';

export interface QuizContentFieldNeeds {
  distractors?: boolean;
  example?: boolean;
  pronunciation?: boolean;
  pos?: boolean;
}

export interface QuizContentWordInput {
  id: string;
  english: string;
  japanese: string;
  /**
   * 出題語が持つ「正解以外の訳」(word_translations の他の語義など)。
   * プロンプトで誤答禁止として明示し、生成後のフィルタでも落とす。
   * 省略時は `japanese` だけを正解とみなす。
   */
  knownTranslations?: readonly string[];
  /** 生成するフィールドの指定。省略時は全フィールド生成（後方互換）。 */
  needs?: QuizContentFieldNeeds;
}

export interface ResolvedQuizContentFieldNeeds {
  distractors: boolean;
  example: boolean;
  pronunciation: boolean;
  pos: boolean;
}

export function resolveQuizContentNeeds(word: QuizContentWordInput): ResolvedQuizContentFieldNeeds {
  return {
    distractors: word.needs?.distractors ?? true,
    example: word.needs?.example ?? true,
    pronunciation: word.needs?.pronunciation ?? true,
    pos: word.needs?.pos ?? true,
  };
}

function hasAnyNeed(needs: ResolvedQuizContentFieldNeeds): boolean {
  return needs.distractors || needs.example || needs.pronunciation || needs.pos;
}

function formatNeedsForPrompt(needs: ResolvedQuizContentFieldNeeds): string {
  const fields: string[] = [];
  if (needs.distractors) fields.push('distractors');
  if (needs.pos) fields.push('partOfSpeechTags');
  if (needs.pronunciation) fields.push('pronunciation');
  if (needs.example) fields.push('exampleSentence');
  return fields.join(', ');
}

export interface QuizContentResult {
  wordId: string;
  distractors: string[];
  partOfSpeechTags: string[];
  pronunciation: string;
  exampleSentence: string;
  exampleSentenceJa: string;
}

export const BATCH_DISTRACTOR_PROMPT = `あなたは英語学習教材の作成者です。与えられた複数の英単語とその日本語訳に対して、それぞれ以下を生成してください:
1. 4択クイズ用の誤答選択肢（distractors）の候補を${DISTRACTOR_CANDIDATE_COUNT}つと、それぞれの元になった英単語（distractorSources）
2. その単語の主分類（partOfSpeechTags）を1つ
3. IPA発音記号（pronunciation）を1つ
4. その単語を使った例文（英語）と日本語訳

【絶対ルール】誤答は「出題語の正しい訳」であってはならない:
4択クイズの正解はちょうど1つでなければなりません。誤答の中に出題語の訳として成り立つ日本語が1つでも混ざると、正解が2つ以上ある不正な問題になります。このルールは他のどのルール（語形の類似など）よりも優先します。
出題語そのものの「別の意味」を誤答に絶対に使わない（多義語・同音異義語の禁止）。誤答は必ず「正解とは別の英単語」の日本語訳から作ること。
次はすべて「出題語の正しい訳」とみなし、誤答に使ってはいけません:
- 多義語・同音異義語の別の意味: bank（銀行）に「土手」「堤防」、spring（春）に「ばね」「泉」「跳ねる」
- 品詞が違う用法の意味: book（本）に「予約する」、right（右）に「正しい」「権利」、address（住所）に「演説」「取り組む」
- 正解の言い換え・類義語・表記違い: 「祝う」に「祝福する」、「捧げる」に「献上する」、「影響する」に「影響を与える」
- 正解を含む・正解に含まれる訳: 「綿密に計画する」に「計画する」、「犬」に「動物」
- 出題語の派生語・活用形の訳: predict（予測する）に prediction「予測」や predictable「予測できる」
- 入力の「出題語の他の訳」に列挙された訳。これは出題語が実際に持つ別の意味なので、意味が離れていても全部禁止

【誤答の作り方（必ずこの順で行う）】
1. 出題語と語形（接頭辞・接尾辞・語根・綴り）が似ていて、意味は明らかに違う別の英単語を${DISTRACTOR_CANDIDATE_COUNT}つ選ぶ。学習者が英単語の見た目から意味を推測して間違えやすい選択肢にするためで、優先順位は次のとおり:
   - 同じ接頭辞を持つ単語（例: pre-, un-, re-, dis-, con-, in-, de-, ex-, pro-）
   - 同じ接尾辞を持つ単語（例: -tion, -ment, -able, -ness, -ous, -ive, -ful, -less）
   - 同じ語根を持つ単語（例: duct → conduct, deduct, induct）
   - 綴りや発音が似ている単語（例: affect / effect, adapt / adopt, complement / compliment）
2. それぞれの英単語の代表的な日本語訳を書く（下のフォーマット規則に従う）
3. 自己検査: 「出題語をその日本語に訳しても正しくないか」を誤答1つずつ確かめる。正しい・正しいかもしれない・文脈によっては通る、のどれかに当てはまれば、その誤答は捨てて別の英単語から作り直す。語形が似ていることより、意味がはっきり違うことを優先する
   - 同じ語根の単語は意味も近いことが多いので特に注意: comprehend（理解する）に apprehend「理解する」はNG（apprehend の「逮捕する」なら可）
   - 綴りが似た単語の訳が偶然正解と重なることもある: affect（影響する）に effect の名詞の訳「影響」はNG
4. 検査を通った誤答を distractors に、元になった英単語を同じ順で distractorSources に入れる（アプリ側がこの対応で再検査する）。distractorSources に出題語そのものや出題語の派生語を入れてはいけない

具体例:
- predict（予測する）→ precede（先行する）、prescribe（処方する）、prevail（普及する）、preserve（保存する）— 全て pre- を共有
- construction（建設）→ instruction（指示）、obstruction（妨害）、destruction（破壊）、restriction（制限）— 全て -struction / -striction を共有
- export（輸出する）→ explore（探検する）、exploit（活用する）、expose（さらす）、expand（拡大する）— 全て ex- を共有
- considerable（かなりの）→ comparable（比較できる）、comfortable（快適な）、compatible（互換性のある）、combustible（燃えやすい）— 全て co-/com- + -able を共有
- comprehend（理解する）→ comprise（構成する）、compromise（妥協する）、compress（圧縮する）、compel（強いる）— 全て compr-/comp- を共有

【重要】誤答のフォーマット統一:
誤答は必ず正解と同じフォーマット・スタイル・長さで生成してください。フォーマットの違いで正解がバレてはいけません。

【重要】誤答は同品詞・同CEFR帯:
- 誤答の元になる英語語彙は、正解の英単語と同じ品詞にしてください
- 誤答の元になる英語語彙は、正解の英単語と同じCEFR帯（A1〜C2の同帯域）にしてください

【最重要】意味候補の数を完全に揃える:
- 正解の日本語訳に読点（、）で区切られた複数の意味がある場合（例:「綿密に計画する、詳細に計画する」）、誤答も必ず同じ数の意味候補を読点区切りで含めてください
- 正解が意味1つなら誤答も1つ。正解が意味2つなら誤答も2つ。正解が意味3つなら誤答も3つ。例外なし。
- これが守られないと「意味候補が複数ある選択肢＝正解」とバレます

【禁止事項】
- 正解の反対語・対義語を誤答にしない（例: 「促進する」の誤答に「抑制する」はNG）— 反対語だと消去法で正解がバレます
- 正解の類義語や、出題語自身が持つ「別の正しい意味（多義語・同音異義語の別義）」を誤答に含めない
- 正解と意味が近い・似ている選択肢は絶対に避ける（例: 「祝う」と「祝福する」、「捧げる」と「献上する」は類義語なのでNG）
- 誤答同士も意味が被らないようにする
- 正解のテキストを誤答の中に重複して含めない（同じ訳が2回出るのはNG）
- フォーマットや長さが明らかに異なる誤答を生成しない
- ${DISTRACTOR_CANDIDATE_COUNT}つの誤答はそれぞれ全く異なるジャンル・分野の意味にする

【例文ルール】
- 各単語に対して1つの例文を生成
- 10〜20語程度の実用的で分かりやすい文
- 中学〜高校レベルの難易度
- 熟語の場合は、その熟語全体を例文に含める

【分類ルール】
- partOfSpeechTags は配列で返す
- ただし要素数は必ず1つだけ
- 次のいずれかだけを使う:
  noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other
- 熟語は idiom、句動詞は phrasal_verb を優先する

【発音記号ルール】
- pronunciation はAIで生成した標準的なIPA発音記号にする
- 必ず "/.../" 形式で返す
- アメリカ英語の一般的な発音を優先する
- 発音を確定できない場合は空文字にする

【生成対象フィールドの指定】
- 各単語の行末に「生成対象: ...」として生成すべきフィールドが指定される
- 生成対象に含まれないフィールドは生成せず、必ず空で返すこと（distractors と distractorSources は []、partOfSpeechTags は []、pronunciation と exampleSentence と exampleSentenceJa は ""）
- 生成対象外のフィールドは既にデータが存在するため、生成してもトークンの無駄になる

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "results": [
    { "id": "単語のID", "distractors": ["誤答1", "誤答2", "誤答3", "誤答4"], "distractorSources": ["元の英単語1", "元の英単語2", "元の英単語3", "元の英単語4"], "partOfSpeechTags": ["noun"], "pronunciation": "/əˈdæpt/", "exampleSentence": "Example sentence.", "exampleSentenceJa": "例文の日本語訳。" },
    ...
  ]
}`;

function extractJsonContent(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const jsonStartIndex = content.indexOf('{');
  const jsonEndIndex = content.lastIndexOf('}');
  if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    return content.slice(jsonStartIndex, jsonEndIndex + 1);
  }

  return content;
}

/**
 * 出題語が持つ「正解以外の訳」をプロンプト用に整える。
 * 正解そのものと重複・空文字は除き、順序は保つ。
 */
export function formatKnownTranslationsForPrompt(word: QuizContentWordInput): string {
  const correct = word.japanese.trim();
  const seen = new Set<string>([correct]);
  const others: string[] = [];
  for (const raw of word.knownTranslations ?? []) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    others.push(value);
  }
  return others.join('、');
}

export function buildQuizContentWordLine(word: QuizContentWordInput, index: number): string {
  const needs = resolveQuizContentNeeds(word);
  const others = needs.distractors ? formatKnownTranslationsForPrompt(word) : '';
  const othersPart = others ? ` / 出題語の他の訳（誤答禁止）: ${others}` : '';
  return `${index + 1}. ID: ${word.id} / 英語: ${word.english} / 日本語（正解）: ${word.japanese}${othersPart} / 生成対象: ${formatNeedsForPrompt(needs)}`;
}

export async function generateQuizContentForWords(
  words: QuizContentWordInput[],
  options: { genres?: readonly string[] } = {},
): Promise<QuizContentResult[]> {
  const multipleChoiceWords = words.filter(
    (word) => !isWordOrderEligible(word) && hasAnyNeed(resolveQuizContentNeeds(word)),
  );
  if (multipleChoiceWords.length === 0) {
    return [];
  }

  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, { openai: openaiApiKey });

  const wordListText = multipleChoiceWords
    .map((w, i) => buildQuizContentWordLine(w, i))
    .join('\n');

  const genreGuidance = buildExampleGenreGuidance(options.genres ?? []);
  const systemPrompt = genreGuidance
    ? `${BATCH_DISTRACTOR_PROMPT}\n\n${genreGuidance}`
    : BATCH_DISTRACTOR_PROMPT;
  const promptText = `${systemPrompt}\n\n以下の${multipleChoiceWords.length}個の単語に対して、それぞれ誤答選択肢${DISTRACTOR_CANDIDATE_COUNT}つ（元の英単語つき）、品詞、発音記号、例文を生成してください:\n\n${wordListText}`;

  const result = await provider.generateText(promptText, {
    ...config,
    // 誤答は制約の遵守が命で創造性は要らない。温度を下げて「出題語の別の意味を
    // 誤答にしない」などのルール違反を減らす。
    temperature: 0.4,
    maxOutputTokens: 8192,
    responseFormat: 'json',
  });

  if (!result.success) {
    throw new Error(result.error || 'クイズ生成に失敗しました');
  }

  const content = result.content?.trim();
  if (!content) {
    throw new Error('AIレスポンスが空です');
  }

  let aiParsed: { results?: RawQuizContentAiResult[] };
  try {
    aiParsed = JSON.parse(extractJsonContent(content));
  } catch {
    throw new Error('AIレスポンスJSONの解析に失敗しました');
  }

  if (!aiParsed.results || !Array.isArray(aiParsed.results)) {
    throw new Error('AIレスポンスの形式が不正です');
  }

  return buildQuizContentResults(aiParsed.results, multipleChoiceWords);
}

export interface RawQuizContentAiResult {
  id: string;
  distractors?: unknown;
  /** distractors と同じ順で、各誤答の元になった英単語。無くても受理する。 */
  distractorSources?: unknown;
  partOfSpeechTags?: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
}

export function buildQuizContentResults(
  rawResults: RawQuizContentAiResult[],
  words: QuizContentWordInput[],
): QuizContentResult[] {
  const inputMap = new Map(words.map((w) => [w.id, w]));

  return rawResults
    .filter((r) => {
      if (!r.id) return false;
      const input = inputMap.get(r.id);
      if (!input) return false;
      // distractors を要求した単語のみ「3つ以上揃っていること」を成功条件にする
      // （フィルタで落ちる分を見込んで候補は 4 つ頼むが、3 つしか返らなくても受理する）。
      // 要求していない単語は distractors 抜きで受理する。
      if (!resolveQuizContentNeeds(input).distractors) return true;
      return Array.isArray(r.distractors) && r.distractors.length >= DISTRACTOR_COUNT;
    })
    .map((r) => {
      const input = inputMap.get(r.id);
      const needs = input ? resolveQuizContentNeeds(input) : {
        distractors: true, example: true, pronunciation: true, pos: true,
      };
      const distractors = input && needs.distractors
        ? selectSafeDistractors(input, r.distractors, r.distractorSources)
        : [];

      // 生成対象外のフィールドはモデルが返しても捨てる（既存値の上書きを防ぐ）。
      return {
        wordId: r.id,
        distractors,
        partOfSpeechTags: needs.pos ? normalizePartOfSpeechTags(r.partOfSpeechTags) : [],
        pronunciation: needs.pronunciation ? normalizePronunciation(r.pronunciation) : '',
        exampleSentence: needs.example ? (r.exampleSentence || '') : '',
        exampleSentenceJa: needs.example ? (r.exampleSentenceJa || '') : '',
      };
    });
}

function normalizePronunciation(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value.trim();
  if (!text) return '';

  const lower = text.toLowerCase();
  if (['n/a', 'na', 'unknown', '不明', '-', '---'].includes(lower)) return '';

  if (text.startsWith('[') && text.endsWith(']')) {
    text = `/${text.slice(1, -1).trim()}/`;
  }
  if (!text.startsWith('/')) text = `/${text}`;
  if (!text.endsWith('/')) text = `${text}/`;
  return text.length <= 120 ? text : '';
}
