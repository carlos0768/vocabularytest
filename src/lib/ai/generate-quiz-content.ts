import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { buildExampleGenreGuidance } from '@/lib/preferences/example-genres';
import { isWordOrderEligible } from '@/lib/quiz/word-order';

export interface QuizContentWordInput {
  id: string;
  english: string;
  japanese: string;
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
1. クイズ用の誤答選択肢（distractors）を3つ
2. その単語の主分類（partOfSpeechTags）を1つ
3. IPA発音記号（pronunciation）を1つ
4. その単語を使った例文（英語）と日本語訳

【最重要ルール】形態的に紛らわしい単語から誤答を作る:
誤答は正解の英単語と「接頭辞・接尾辞・語根・綴り」が似ている別の英単語の日本語訳にしてください。
学習者が英単語の見た目や語形から意味を推測して間違えやすい選択肢を作ることが目的です。
意味の反対語や対義語を誤答にするのは絶対に避けてください — 反対語だと消去法で正解がバレます。

【誤答の元となる英単語の選び方】
以下の優先順位で、正解の英単語と形態的に似ている別の英単語を3つ選び、それぞれの日本語訳を誤答にしてください:
1. 同じ接頭辞を持つ単語（例: pre-, un-, re-, dis-, con-, in-, de-, ex-, pro-）
2. 同じ接尾辞を持つ単語（例: -tion, -ment, -able, -ness, -ous, -ive, -ful, -less）
3. 同じ語根を持つ単語（例: duct → conduct, deduct, induct）
4. 綴りや発音が似ている単語（例: affect / effect, adapt / adopt, complement / compliment）

具体例:
- predict（予測する）→ precede（先行する）、prescribe（処方する）、prevail（普及する）— 全て pre- を共有
- construction（建設）→ instruction（指示）、obstruction（妨害）、destruction（破壊）— 全て -struction を共有
- export（輸出する）→ explore（探検する）、exploit（活用する）、expose（さらす）— 全て ex- を共有
- considerable（かなりの）→ comparable（比較できる）、comfortable（快適な）、compatible（互換性のある）— 全て co-/com- + -able を共有
- affect（影響する）→ effect（引き起こす）、infect（感染させる）、defect（欠陥）— 語根 -fect を共有
- comprehend（理解する）→ comprise（構成する）、compromise（妥協する）、compress（圧縮する）— 全て compr- を共有

【最重要】出題語そのものの「別の意味」を誤答に絶対に使わない（多義語・同音異義語の禁止）:
- 出題している英単語が複数の意味を持つ多義語・同音異義語であっても、その英単語【自身】の別の意味（別の正しい日本語訳）を誤答に含めてはいけません。
- 誤答は必ず「正解とは別の英単語」の日本語訳から作ること。出題語そのものが取り得る訳語は、正解として提示された意味以外も含めて一切使わない。
- 理由: 出題語の別の意味を誤答にすると、その誤答も実際には正しい答えになり、正解が2つ以上ある不正な問題になってしまうため。
- 具体例（いずれも誤答にしてはいけない＝出題語自身の別の意味）:
  - bank（銀行）を出題 → 「土手、堤防」はbankの別の意味なのでNG。代わりに別単語 rank（地位）/ blank（空白）/ tank（戦車）の訳を使う。
  - book（本）を出題 → 「予約する」はbookの動詞の意味なのでNG。
  - spring（春）を出題 → 「ばね」「泉」「跳ねる」はいずれもspringの別の意味なのでNG。
  - right（右）を出題 → 「正しい」「権利」はいずれもrightの別の意味なのでNG。

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
- 正解の反対語・対義語を誤答にしない（例: 「促進する」の誤答に「抑制する」はNG）
- 正解の類義語や、出題語自身が持つ「別の正しい意味（多義語・同音異義語の別義）」を誤答に含めない
- 正解と意味が近い・似ている選択肢は絶対に避ける（例: 「祝う」と「祝福する」、「捧げる」と「献上する」は類義語なのでNG）
- 誤答同士も意味が被らないようにする
- 正解のテキストを誤答の中に重複して含めない（同じ訳が2回出るのはNG）
- フォーマットや長さが明らかに異なる誤答を生成しない
- 3つの誤答はそれぞれ全く異なるジャンル・分野の意味にする

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

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "results": [
    { "id": "単語のID", "distractors": ["誤答1", "誤答2", "誤答3"], "partOfSpeechTags": ["noun"], "pronunciation": "/əˈdæpt/", "exampleSentence": "Example sentence.", "exampleSentenceJa": "例文の日本語訳。" },
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

export async function generateQuizContentForWords(
  words: QuizContentWordInput[],
  options: { genres?: readonly string[] } = {},
): Promise<QuizContentResult[]> {
  const multipleChoiceWords = words.filter((word) => !isWordOrderEligible(word));
  if (multipleChoiceWords.length === 0) {
    return [];
  }

  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, { openai: openaiApiKey });

  const wordListText = multipleChoiceWords
    .map((w, i) => `${i + 1}. ID: ${w.id} / 英語: ${w.english} / 日本語（正解）: ${w.japanese}`)
    .join('\n');

  const genreGuidance = buildExampleGenreGuidance(options.genres ?? []);
  const systemPrompt = genreGuidance
    ? `${BATCH_DISTRACTOR_PROMPT}\n\n${genreGuidance}`
    : BATCH_DISTRACTOR_PROMPT;
  const promptText = `${systemPrompt}\n\n以下の${multipleChoiceWords.length}個の単語に対して、それぞれ誤答選択肢3つ、品詞、発音記号、例文を生成してください:\n\n${wordListText}`;

  const result = await provider.generateText(promptText, {
    ...config,
    temperature: 0.7,
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

  let aiParsed: {
    results?: Array<{
      id: string;
      distractors: string[];
      partOfSpeechTags?: string[];
      pronunciation?: string;
      exampleSentence?: string;
      exampleSentenceJa?: string;
    }>;
  };
  try {
    aiParsed = JSON.parse(extractJsonContent(content));
  } catch {
    throw new Error('AIレスポンスJSONの解析に失敗しました');
  }

  if (!aiParsed.results || !Array.isArray(aiParsed.results)) {
    throw new Error('AIレスポンスの形式が不正です');
  }

  const inputMap = new Map(multipleChoiceWords.map((w) => [w.id, w]));

  return aiParsed.results
    .filter((r) => r.id && inputMap.has(r.id) && Array.isArray(r.distractors) && r.distractors.length === 3)
    .map((r) => {
      const input = inputMap.get(r.id);
      let distractors = r.distractors;

      if (input) {
        const correctAnswer = input.japanese.trim().toLowerCase();

        distractors = distractors.filter((d) => {
          const normalized = d.trim().toLowerCase();
          if (normalized === correctAnswer) return false;
          if (correctAnswer.includes(normalized) || normalized.includes(correctAnswer)) return false;
          return true;
        });

        distractors = [...new Set(distractors)];

        const fallbacks = ['確認する', '提供する', '参加する', '検討する', '対応する'];
        let fallbackIndex = 0;
        while (distractors.length < 3 && fallbackIndex < fallbacks.length) {
          const fb = fallbacks[fallbackIndex];
          if (!distractors.includes(fb) && fb.toLowerCase() !== correctAnswer) {
            distractors.push(fb);
          }
          fallbackIndex += 1;
        }
      }

      return {
        wordId: r.id,
        distractors: distractors.slice(0, 3),
        partOfSpeechTags: normalizePartOfSpeechTags(r.partOfSpeechTags),
        pronunciation: normalizePronunciation(r.pronunciation),
        exampleSentence: r.exampleSentence || '',
        exampleSentenceJa: r.exampleSentenceJa || '',
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
