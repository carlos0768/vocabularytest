import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod';
import { getProvider } from '@/lib/ai/providers';
import { AI_CONFIG } from '@/lib/ai/config';
import { parseJsonWithSchema } from '@/lib/api/validation';

// リクエストスキーマ
const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
    }).strict(),
  ).min(1).max(30), // 最大30語まで
}).strict();

// AIレスポンススキーマ
const exampleResponseSchema = z.object({
  examples: z.array(z.object({
    wordId: z.string(),
    exampleSentence: z.string(),
    exampleSentenceJa: z.string(),
  })),
});

// 例文生成プロンプト
const EXAMPLE_GENERATION_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語リストに対して、それぞれの単語を使った自然な英語の例文を生成してください。

【ルール】
1. 各単語に対して1つの例文を生成
2. 例文は10〜20語程度の実用的で分かりやすい文
3. 中学〜高校レベルの難易度
4. 例文の日本語訳も生成
5. 熟語の場合は、その熟語全体を例文に含める

【出力形式】JSON
{
  "examples": [
    {
      "wordId": "単語ID",
      "exampleSentence": "Example sentence using the word.",
      "exampleSentenceJa": "その単語を使った例文の日本語訳。"
    }
  ]
}`;

/**
 * POST /api/generate-examples
 *
 * 指定された単語に対して例文を生成するAPI（全ユーザー対応）
 *
 * - ログインユーザー: 既に例文がある単語はスキップ（DBチェック）、生成後DBに保存
 * - 未ログインユーザー: 全単語に例文を生成（DB保存なし、レスポンスで返却のみ）
 * - 常にexamplesフィールドでクライアントに生成結果を返す
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK (optional - free users allowed)
    // ============================================
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user } } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    const isLoggedIn = !!user;

    // ============================================
    // 2. PARSE REQUEST BODY
    // ============================================
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      parseMessage: 'リクエストの解析に失敗しました',
      invalidMessage: '無効なリクエスト形式です',
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const { words } = parsed.data;
    const wordIds = words.map(w => w.id);

    // ============================================
    // 3. CHECK WHICH WORDS NEED EXAMPLES (DB check for logged-in users only)
    // ============================================
    let wordsNeedingExamples = words;

    if (isLoggedIn) {
      const { data: existingWords } = await supabase
        .from('words')
        .select('id, example_sentence')
        .in('id', wordIds);

      const wordsWithExamples = new Set(
        (existingWords || [])
          .filter(w => w.example_sentence && w.example_sentence.trim().length > 0)
          .map(w => w.id)
      );

      wordsNeedingExamples = words.filter(w => !wordsWithExamples.has(w.id));

      if (wordsNeedingExamples.length === 0) {
        return NextResponse.json({
          success: true,
          message: '全ての単語に既に例文が設定されています',
          generated: 0,
          skipped: words.length,
          examples: [],
        });
      }
    }

    // ============================================
    // 4. GENERATE EXAMPLES WITH AI
    // ============================================
    const wordListText = wordsNeedingExamples.map(w =>
      `- wordId: "${w.id}", english: "${w.english}", japanese: "${w.japanese}"`
    ).join('\n');

    const userPrompt = `以下の単語リストに対して例文を生成してください：\n\n${wordListText}`;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }
    const config = AI_CONFIG.defaults.openai;
    const provider = getProvider(config.provider, openaiApiKey);

    let aiResponse;
    try {
      aiResponse = await provider.generateText(
        `${EXAMPLE_GENERATION_SYSTEM_PROMPT}\n\n${userPrompt}`,
        {
          ...config,
          responseFormat: 'json',
        }
      );
    } catch (aiError) {
      console.error('AI example generation error:', aiError);
      return NextResponse.json(
        { success: false, error: '例文の生成に失敗しました' },
        { status: 500 }
      );
    }

    if (!aiResponse.success) {
      console.error('AI generation failed:', aiResponse.error);
      return NextResponse.json(
        { success: false, error: '例文の生成に失敗しました' },
        { status: 500 }
      );
    }

    // AIレスポンスをパース
    let parsedResponse;
    try {
      let content = aiResponse.content;
      if (content.startsWith('```json')) {
        content = content.slice(7);
      } else if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }
      content = content.trim();

      const jsonContent = JSON.parse(content);
      parsedResponse = exampleResponseSchema.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, aiResponse.content);
      return NextResponse.json(
        { success: false, error: '例文の解析に失敗しました' },
        { status: 500 }
      );
    }

    // ============================================
    // 5. SAVE TO DATABASE (logged-in users only)
    // ============================================
    let successCount = 0;
    let failureCount = 0;

    if (isLoggedIn) {
      for (const example of parsedResponse.examples) {
        if (!wordsNeedingExamples.find(w => w.id === example.wordId)) continue;

        try {
          const { error: updateError } = await supabase
            .from('words')
            .update({
              example_sentence: example.exampleSentence,
              example_sentence_ja: example.exampleSentenceJa,
            })
            .eq('id', example.wordId);

          if (updateError) {
            console.error(`Failed to update example for word ${example.wordId}:`, updateError);
            failureCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to update example for word ${example.wordId}:`, error);
          failureCount++;
        }
      }
    } else {
      successCount = parsedResponse.examples.length;
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE (always include examples)
    // ============================================
    return NextResponse.json({
      success: true,
      message: `${successCount}件の例文を生成しました`,
      generated: successCount,
      failed: failureCount,
      skipped: words.length - wordsNeedingExamples.length,
      examples: parsedResponse.examples,
    });
  } catch (error) {
    console.error('Generate examples API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
