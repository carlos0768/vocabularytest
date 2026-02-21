import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';

export interface QuizContentWordInput {
  id: string;
  english: string;
  japanese: string;
}

export interface QuizContentResult {
  wordId: string;
  distractors: string[];
  exampleSentence: string;
  exampleSentenceJa: string;
}

const BATCH_DISTRACTOR_PROMPT = `あなたは英語学習教材の作成者です。与えられた複数の英単語とその日本語訳に対して、それぞれ以下を生成してください:
1. クイズ用の誤答選択肢（distractors）を3つ
2. その単語を使った例文（英語）と日本語訳

【最重要ルール】誤答のフォーマット統一:
誤答は必ず正解と同じフォーマット・スタイル・長さで生成してください。フォーマットの違いで正解がバレてはいけません。

【重要】誤答は同品詞・同CEFR帯:
- 誤答の元になる英語語彙は、正解の英単語と同じ品詞にしてください
- 誤答の元になる英語語彙は、正解の英単語と同じCEFR帯（A1〜C2の同帯域）にしてください

フォーマット統一の具体例:
- 正解「綿密に計画する、詳細に計画する」→ 誤答も「〜する、〜する」の形式で同程度の長さに
  例: 「激しく非難する、厳しく批判する」「慎重に検討する、注意深く考える」「大胆に挑戦する、果敢に試みる」
- 正解「犬」→ 誤答も短い単語で「猫」「鳥」「魚」
- 正解「〜を促進する」→ 誤答も「〜を抑制する」「〜を妨害する」「〜を延期する」
- 正解に読点（、）で複数の訳があるなら、誤答にも同じ数の訳を含める
- 正解が長い説明的な訳なら、誤答も同程度に説明的にする

【禁止事項】
- 正解の類義語や、その英単語が持つ「別の正しい意味」を誤答に含めない
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

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "results": [
    { "id": "単語のID", "distractors": ["誤答1", "誤答2", "誤答3"], "exampleSentence": "Example sentence.", "exampleSentenceJa": "例文の日本語訳。" },
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

export async function generateQuizContentForWords(words: QuizContentWordInput[]): Promise<QuizContentResult[]> {
  if (words.length === 0) {
    return [];
  }

  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, { openai: openaiApiKey });

  const wordListText = words
    .map((w, i) => `${i + 1}. ID: ${w.id} / 英語: ${w.english} / 日本語（正解）: ${w.japanese}`)
    .join('\n');

  const promptText = `${BATCH_DISTRACTOR_PROMPT}\n\n以下の${words.length}個の単語に対して、それぞれ誤答選択肢3つと例文を生成してください:\n\n${wordListText}`;

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

  let aiParsed: { results?: Array<{ id: string; distractors: string[]; exampleSentence?: string; exampleSentenceJa?: string }> };
  try {
    aiParsed = JSON.parse(extractJsonContent(content));
  } catch {
    throw new Error('AIレスポンスJSONの解析に失敗しました');
  }

  if (!aiParsed.results || !Array.isArray(aiParsed.results)) {
    throw new Error('AIレスポンスの形式が不正です');
  }

  const inputMap = new Map(words.map((w) => [w.id, w]));

  return aiParsed.results
    .filter((r) => r.id && Array.isArray(r.distractors) && r.distractors.length === 3)
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
        exampleSentence: r.exampleSentence || '',
        exampleSentenceJa: r.exampleSentenceJa || '',
      };
    });
}
