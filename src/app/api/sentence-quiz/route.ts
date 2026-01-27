import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import OpenAI from 'openai';
import { z } from 'zod';
import type { SentenceQuizQuestion, FillInBlankQuestion, WordOrderQuestion, WordStatus } from '@/types';

// リクエストスキーマ
const requestSchema = z.object({
  words: z.array(z.object({
    id: z.string(),
    english: z.string(),
    japanese: z.string(),
    status: z.enum(['new', 'review', 'mastered']),
  })).min(1).max(15), // 最大15単語
});

// AIレスポンススキーマ（穴埋め問題）
const fillInBlankAISchema = z.object({
  sentence: z.string(),
  blanks: z.array(z.object({
    correctAnswer: z.string(),
    options: z.array(z.string()).length(4),
  })).length(3),
  japaneseMeaning: z.string(),
});

// AIレスポンススキーマ（並び替え問題）
const wordOrderAISchema = z.object({
  correctOrder: z.array(z.string()).min(4),
  japaneseMeaning: z.string(),
});

// 穴埋め問題生成プロンプト
const FILL_IN_BLANK_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、Duolingo形式の穴埋め問題を生成してください。

【ルール】
1. 与えられた単語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 必ず3つの空欄を設ける（対象単語を含む）
4. 各空欄に4つの選択肢を用意（1つが正解、3つが誤答）

【選択肢のルール】
- 空欄1（対象単語）: 正解の単語の活用形バリエーション（go/goes/went/going等）
- 空欄2・3: 副詞、前置詞、冠詞、代名詞など文法的に紛らわしい選択肢

【出力形式】JSON
{
  "sentence": "I ___ to school ___ day ___.",
  "blanks": [
    { "correctAnswer": "go", "options": ["go", "goes", "went", "going"] },
    { "correctAnswer": "every", "options": ["every", "very", "many", "much"] },
    { "correctAnswer": "early", "options": ["early", "lately", "late", "soon"] }
  ],
  "japaneseMeaning": "私は毎日早く学校に行く。"
}`;

// 並び替え問題生成プロンプト
const WORD_ORDER_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、Duolingo形式の並び替え問題を生成してください。

【ルール】
1. 与えられた単語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 4〜8単語程度の長さ（並び替えしやすい長さ）
4. 文を単語単位で分割（ピリオドは最後の単語に含める）

【出力形式】JSON
{
  "correctOrder": ["I", "go", "to", "school", "every", "day."],
  "japaneseMeaning": "私は毎日学校に行く。"
}`;

// 配列をシャッフル
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 穴埋め問題を生成
async function generateFillInBlank(
  openai: OpenAI,
  wordId: string,
  english: string,
  japanese: string
): Promise<FillInBlankQuestion | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: FILL_IN_BLANK_SYSTEM_PROMPT },
        { role: 'user', content: `単語: "${english}" (意味: ${japanese})` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = fillInBlankAISchema.parse(parsed);

    return {
      type: 'fill-in-blank',
      wordId,
      targetWord: english,
      sentence: validated.sentence,
      blanks: validated.blanks.map((blank, index) => ({
        index,
        correctAnswer: blank.correctAnswer,
        options: shuffleArray(blank.options),
      })),
      japaneseMeaning: validated.japaneseMeaning,
    };
  } catch (error) {
    console.error('Fill-in-blank generation error:', error);
    return null;
  }
}

// 並び替え問題を生成
async function generateWordOrder(
  openai: OpenAI,
  wordId: string,
  english: string,
  japanese: string
): Promise<WordOrderQuestion | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: WORD_ORDER_SYSTEM_PROMPT },
        { role: 'user', content: `単語: "${english}" (意味: ${japanese})` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = wordOrderAISchema.parse(parsed);

    return {
      type: 'word-order',
      wordId,
      targetWord: english,
      shuffledWords: shuffleArray(validated.correctOrder),
      correctOrder: validated.correctOrder,
      japaneseMeaning: validated.japaneseMeaning,
    };
  } catch (error) {
    console.error('Word-order generation error:', error);
    return null;
  }
}

// API Route: POST /api/sentence-quiz
// 例文クイズの問題を生成（Pro限定）
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. CHECK PRO SUBSCRIPTION
    // ============================================
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json(
        { success: false, error: '例文クイズはProプラン限定機能です。' },
        { status: 403 }
      );
    }

    // ============================================
    // 3. PARSE REQUEST BODY
    // ============================================
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストの解析に失敗しました' },
        { status: 400 }
      );
    }

    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const { words } = parseResult.data;

    // ============================================
    // 4. CHECK OPENAI API KEY
    // ============================================
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // ============================================
    // 5. GENERATE QUESTIONS
    // ============================================
    const questions: SentenceQuizQuestion[] = [];

    // 並列で問題生成（パフォーマンス向上）
    const generatePromises = words.map(async (word) => {
      const questionType: 'fill-in-blank' | 'word-order' =
        word.status === 'new' ? 'fill-in-blank' : 'word-order';

      if (questionType === 'fill-in-blank') {
        return generateFillInBlank(openai, word.id, word.english, word.japanese);
      } else {
        return generateWordOrder(openai, word.id, word.english, word.japanese);
      }
    });

    const results = await Promise.all(generatePromises);

    // null を除外
    for (const result of results) {
      if (result) {
        questions.push(result);
      }
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: '問題の生成に失敗しました。もう一度お試しください。' },
        { status: 500 }
      );
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error('Sentence quiz API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
