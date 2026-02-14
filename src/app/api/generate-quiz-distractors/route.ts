import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// API Route: POST /api/generate-quiz-distractors
// Batch generates distractors for multiple words using AI provider (Cloud Run or direct)

const BATCH_DISTRACTOR_PROMPT = `あなたは英語学習教材の作成者です。与えられた複数の英単語とその日本語訳に対して、それぞれ以下を生成してください:
1. クイズ用の誤答選択肢（distractors）を3つ
2. その単語を使った例文（英語）と日本語訳

【最重要ルール】誤答のフォーマット統一:
誤答は必ず正解と同じフォーマット・スタイル・長さで生成してください。フォーマットの違いで正解がバレてはいけません。

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

interface WordInput {
  id: string;
  english: string;
  japanese: string;
}

const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
    }).strict(),
  ).min(1).max(30),
}).strict();

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // Parse request body
    const bodyResult = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const { words } = bodyResult.data as { words: WordInput[] };

    // Build word list for the prompt
    const wordListText = words
      .map((w, i) => `${i + 1}. ID: ${w.id} / 英語: ${w.english} / 日本語（正解）: ${w.japanese}`)
      .join('\n');

    const promptText = `${BATCH_DISTRACTOR_PROMPT}\n\n以下の${words.length}個の単語に対して、それぞれ誤答選択肢3つと例文を生成してください:\n\n${wordListText}`;

    // Generate using provider factory (Cloud Run or direct)
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY || '';
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const config = AI_CONFIG.defaults.openai; // Use OpenAI for reliability
    const provider = getProviderFromConfig(config, { gemini: geminiApiKey, openai: openaiApiKey });

    const result = await provider.generateText(promptText, {
      ...config,
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseFormat: 'json',
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 503 }
      );
    }

    const content = result.content?.trim();

    if (!content) {
      return NextResponse.json(
        { success: false, error: '誤答の生成に失敗しました。しばらく待ってから再試行してください。' },
        { status: 503 }
      );
    }

    // Extract JSON from response
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    } else {
      const jsonStartIndex = content.indexOf('{');
      const jsonEndIndex = content.lastIndexOf('}');
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        jsonContent = content.slice(jsonStartIndex, jsonEndIndex + 1);
      }
    }

    // Parse response
    let aiParsed: { results?: Array<{ id: string; distractors: string[]; exampleSentence?: string; exampleSentenceJa?: string }> };
    try {
      aiParsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse Gemini response:', content);
      return NextResponse.json(
        { success: false, error: '応答の解析に失敗しました' },
        { status: 500 }
      );
    }

    // Validate results
    if (!aiParsed.results || !Array.isArray(aiParsed.results)) {
      console.error('Invalid results format:', aiParsed);
      return NextResponse.json(
        { success: false, error: '誤答の形式が不正です' },
        { status: 500 }
      );
    }

    // Validate each result has 3 distractors and remove duplicates
    const inputMap = new Map(words.map((w) => [w.id, w]));
    const validResults = aiParsed.results
      .filter((r) => r.id && Array.isArray(r.distractors) && r.distractors.length === 3)
      .map((r) => {
        const word = inputMap.get(r.id);
        let distractors = r.distractors;

        if (word) {
          // Remove distractors that are identical or too similar to the correct answer
          const correctAnswer = word.japanese.trim().toLowerCase();
          distractors = distractors.filter((d) => {
            const dLower = d.trim().toLowerCase();
            // Exact match check
            if (dLower === correctAnswer) return false;
            // Check if distractor is contained in correct answer or vice versa
            if (correctAnswer.includes(dLower) || dLower.includes(correctAnswer)) return false;
            return true;
          });

          // Remove duplicate distractors
          distractors = [...new Set(distractors)];

          // If we lost distractors, pad with generic ones
          const fallbacks = ['（該当なし）', '（不明）', '（未定義）'];
          let fallbackIdx = 0;
          while (distractors.length < 3 && fallbackIdx < fallbacks.length) {
            distractors.push(fallbacks[fallbackIdx++]);
          }
        }

        return {
          wordId: r.id,
          distractors: distractors.slice(0, 3),
          exampleSentence: r.exampleSentence || '',
          exampleSentenceJa: r.exampleSentenceJa || '',
        };
      });

    // Save example sentences to DB for logged-in users
    const examplesForDb = validResults.filter(r => r.exampleSentence);
    if (user && examplesForDb.length > 0) {
      for (const result of examplesForDb) {
        await supabase
          .from('words')
          .update({
            example_sentence: result.exampleSentence,
            example_sentence_ja: result.exampleSentenceJa,
          })
          .eq('id', result.wordId)
          .then(({ error }) => {
            if (error) console.error(`Failed to save example for ${result.wordId}:`, error);
          });
      }
    }

    return NextResponse.json({
      success: true,
      results: validResults,
    });
  } catch (error) {
    console.error('Generate quiz distractors error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
