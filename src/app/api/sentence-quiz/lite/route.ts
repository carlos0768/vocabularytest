import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import OpenAI from 'openai';
import { z } from 'zod';
import { isActiveProSubscription } from '@/lib/subscription/status';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { AI_CONFIG } from '@/lib/ai/config';
import type {
  SentenceQuizQuestion,
  FillInBlankQuestion,
  WordOrderQuestion,
} from '@/types';

const OPENAI_MODEL = AI_CONFIG.defaults.openai.model;

// リクエストスキーマ
const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
      status: z.enum(['new', 'review', 'mastered']),
    }).strict(),
  ).min(1).max(15),
}).strict();

// バッチレスポンススキーマ
const batchResponseSchema = z.object({
  questions: z.array(z.object({
    wordId: z.string(),
    type: z.enum(['fill-in-blank', 'word-order']),
    sentence: z.string().optional(),
    correctAnswer: z.string().optional(),
    options: z.array(z.string()).optional(),
    correctOrder: z.array(z.string()).optional(),
    shuffledWords: z.array(z.string()).optional(),
    japaneseMeaning: z.string(),
  })),
});

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const BATCH_PROMPT = `あなたは英語教師です。複数の英単語に対して、一括で例文クイズ問題を生成してください。

各単語に対して、statusに応じた問題を1つ生成してください：
- status="new" → 穴埋め問題 (fill-in-blank)
- status="review" or "mastered" → 並び替え問題 (word-order)

【穴埋め問題のルール】
1. 対象単語を含む自然な例文（中学〜高校レベル）
2. 対象単語の部分を空欄（___）にする
3. 選択肢4つ（正解1 + 誤答3）。誤答は活用形変化でなく別の単語
4. 空欄に入るのは文脈に合った活用形

【並び替え問題のルール】
1. 対象単語を含む自然な例文（4〜8単語）
2. 単語単位で分割（ピリオドは最後の単語に含める）

【出力形式】JSON
{
  "questions": [
    {
      "wordId": "指定されたID",
      "type": "fill-in-blank",
      "sentence": "She ___ to the store.",
      "correctAnswer": "went",
      "options": ["went", "came", "arrived", "returned"],
      "japaneseMeaning": "彼女はお店に行った。"
    },
    {
      "wordId": "指定されたID",
      "type": "word-order",
      "correctOrder": ["I", "go", "to", "school", "every", "day."],
      "japaneseMeaning": "私は毎日学校に行く。"
    }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
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

    // 2. Pro check
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (
      !isActiveProSubscription({
        status: subscription?.status,
        plan: subscription?.plan,
        proSource: subscription?.pro_source,
        testProExpiresAt: subscription?.test_pro_expires_at,
        currentPeriodEnd: subscription?.current_period_end,
      })
    ) {
      return NextResponse.json(
        { success: false, error: '例文クイズはProプラン限定機能です。' },
        { status: 403 }
      );
    }

    // 3. Parse body
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

    // 4. OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // 5. Single batch call
    const wordList = words.map(w =>
      `- id: "${w.id}", english: "${w.english}", japanese: "${w.japanese}", status: "${w.status}"`
    ).join('\n');

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: BATCH_PROMPT },
        { role: 'user', content: `以下の${words.length}単語に対して問題を生成してください:\n\n${wordList}` },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { success: false, error: '問題の生成に失敗しました' },
        { status: 500 }
      );
    }

    const rawData = JSON.parse(content);
    const validated = batchResponseSchema.parse(rawData);

    // 6. Transform to proper types
    const questions: SentenceQuizQuestion[] = [];

    for (const q of validated.questions) {
      const word = words.find(w => w.id === q.wordId);
      if (!word) continue;

      if (q.type === 'fill-in-blank' && q.sentence && q.correctAnswer && q.options) {
        const fillIn: FillInBlankQuestion = {
          type: 'fill-in-blank',
          wordId: q.wordId,
          targetWord: word.english,
          sentence: q.sentence,
          blanks: [{
            index: 0,
            correctAnswer: q.correctAnswer,
            options: shuffleArray(q.options),
          }],
          japaneseMeaning: q.japaneseMeaning,
        };
        questions.push(fillIn);
      } else if (q.type === 'word-order' && q.correctOrder) {
        const wordOrder: WordOrderQuestion = {
          type: 'word-order',
          wordId: q.wordId,
          targetWord: word.english,
          shuffledWords: shuffleArray(q.correctOrder),
          correctOrder: q.correctOrder,
          japaneseMeaning: q.japaneseMeaning,
        };
        questions.push(wordOrder);
      }
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: '問題の生成に失敗しました。もう一度お試しください。' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error('Sentence quiz lite API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
