import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { GoogleGenerativeAI } from '@google/genai';
import { z } from 'zod';
import type { SentenceQuizQuestion, FillInBlankQuestion, WordOrderQuestion, WordStatus } from '@/types';
import { searchRelatedWords, loadUserWords } from '@/lib/mcp/client';

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
  })).length(1),
  japaneseMeaning: z.string(),
});

// AIレスポンススキーマ（並び替え問題）
const wordOrderAISchema = z.object({
  correctOrder: z.array(z.string()).min(4),
  japaneseMeaning: z.string(),
});

// 穴埋め問題生成プロンプト（MCP統合版）
const FILL_IN_BLANK_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、Duolingo形式の穴埋め問題を生成してください。

【ルール】
1. 与えられた単語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 空欄は1つだけ（対象単語の部分）
4. 選択肢は4つ（1つが正解、3つがユーザーの既習単語）

【選択肢のルール - 重要】
- 正解: 対象の単語
- 誤答3つ: ユーザーが既に学習した関連単語を使用してください
  これにより、ユーザーの既習知識を復習できる問題になります

【出力形式】JSON
{
  "sentence": "She ___ to the store to buy some food.",
  "blanks": [
    { "correctAnswer": "went", "options": ["went", "visited", "attended", "traveled"] }
  ],
  "japaneseMeaning": "彼女は食べ物を買いにお店に行った。"
}`;

// 並び替え問題生成プロンプト（MCP統合版）
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

// 穴埋め問題を生成（Gemini + MCP統合版）
async function generateFillInBlank(
  genai: GoogleGenerativeAI,
  wordId: string,
  english: string,
  japanese: string,
  relatedWords: Array<{ english: string; japanese: string }>
): Promise<FillInBlankQuestion | null> {
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // MCPから取得した関連単語を選択肢に利用
    const relatedWordsList = relatedWords
      .slice(0, 3)
      .map(w => w.english)
      .join(', ');

    const userMessage = `単語: "${english}" (意味: ${japanese})
ユーザーの既習関連単語: ${relatedWordsList}

上記の関連単語を誤答として使用して、穴埋め問題を生成してください。`;

    const response = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: FILL_IN_BLANK_SYSTEM_PROMPT }] },
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });

    const content = response.response.text();
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
  genai: GoogleGenerativeAI,
  wordId: string,
  english: string,
  japanese: string
): Promise<WordOrderQuestion | null> {
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const response = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: WORD_ORDER_SYSTEM_PROMPT }] },
        { role: 'user', parts: [{ text: `単語: "${english}" (意味: ${japanese})` }] },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });

    const content = response.response.text();
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
    // 4. CHECK GEMINI API KEY
    // ============================================
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const genai = new GoogleGenerativeAI({ apiKey: geminiApiKey });

    // ============================================
    // 5. LOAD USER WORDS TO MCP SERVER
    // ============================================
    try {
      await loadUserWords(user.id, words);
    } catch (error) {
      console.warn('Failed to load user words to MCP:', error);
      // Continue anyway - MCP is optional for graceful degradation
    }

    // ============================================
    // 6. GENERATE QUESTIONS
    // ============================================
    const questions: SentenceQuizQuestion[] = [];

    // 並列で問題生成（パフォーマンス向上）
    const generatePromises = words.map(async (word) => {
      const questionType: 'fill-in-blank' | 'word-order' =
        word.status === 'new' ? 'fill-in-blank' : 'word-order';

      let relatedWords: Array<{ english: string; japanese: string }> = [];

      // MCPから関連単語を取得
      if (questionType === 'fill-in-blank') {
        try {
          relatedWords = await searchRelatedWords(user.id, word.english, 3);
        } catch (error) {
          console.warn(`Failed to get related words for ${word.english}:`, error);
          // Continue without related words
        }
      }

      if (questionType === 'fill-in-blank') {
        return generateFillInBlank(genai, word.id, word.english, word.japanese, relatedWords);
      } else {
        return generateWordOrder(genai, word.id, word.english, word.japanese);
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
    // 7. RETURN SUCCESS RESPONSE
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
