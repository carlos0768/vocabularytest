import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { GoogleGenAI } from '@google/genai';

// API Route: POST /api/generate-quiz-distractors
// Batch generates distractors for multiple words using Gemini 3 Pro with highest reasoning
// Falls back to gemini-2.5-flash on 503/overload errors

const BATCH_DISTRACTOR_PROMPT = `あなたは英語学習教材の作成者です。与えられた複数の英単語とその日本語訳に対して、それぞれクイズ用の誤答選択肢（distractors）を3つずつ生成してください。

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
- フォーマットや長さが明らかに異なる誤答を生成しない
- 正解と紛らわしすぎる選択肢は避ける（学習者が混乱するため）

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "results": [
    { "id": "単語のID", "distractors": ["誤答1", "誤答2", "誤答3"] },
    ...
  ]
}`;

interface WordInput {
  id: string;
  english: string;
  japanese: string;
}

// Model configurations: primary → fallback
const MODELS = [
  {
    name: 'gemini-3-pro-preview',
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingBudget: 24576,
      },
    } as Record<string, unknown>,
  },
  {
    name: 'gemini-2.5-flash',
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  },
];

async function generateWithRetry(
  ai: GoogleGenAI,
  promptText: string,
): Promise<string | null> {
  for (const model of MODELS) {
    try {
      console.log(`Trying model: ${model.name}`);
      const response = await ai.models.generateContent({
        model: model.name,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
        config: model.config,
      });

      const content = response.text?.trim();
      if (content) {
        console.log(`Success with model: ${model.name}`);
        return content;
      }
    } catch (error) {
      const err = error as { status?: number; message?: string };
      console.warn(`Model ${model.name} failed (status: ${err.status}): ${err.message}`);

      // Only fallback on 503/overload errors
      if (err.status === 503 || err.message?.includes('overloaded') || err.message?.includes('UNAVAILABLE')) {
        console.log(`Falling back to next model...`);
        continue;
      }

      // Other errors: throw immediately
      throw error;
    }
  }

  return null;
}

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
    const body = await request.json();
    const { words } = body as { words?: WordInput[] };

    if (!words || !Array.isArray(words) || words.length === 0) {
      return NextResponse.json(
        { success: false, error: '単語リストが必要です' },
        { status: 400 }
      );
    }

    // Check API key
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini APIキーが設定されていません' },
        { status: 500 }
      );
    }

    // Build word list for the prompt
    const wordListText = words
      .map((w, i) => `${i + 1}. ID: ${w.id} / 英語: ${w.english} / 日本語（正解）: ${w.japanese}`)
      .join('\n');

    const promptText = `${BATCH_DISTRACTOR_PROMPT}\n\n以下の${words.length}個の単語に対して、それぞれ誤答選択肢を3つずつ生成してください:\n\n${wordListText}`;

    // Generate with retry/fallback
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const content = await generateWithRetry(ai, promptText);

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
    let parsed: { results?: Array<{ id: string; distractors: string[] }> };
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse Gemini response:', content);
      return NextResponse.json(
        { success: false, error: '応答の解析に失敗しました' },
        { status: 500 }
      );
    }

    // Validate results
    if (!parsed.results || !Array.isArray(parsed.results)) {
      console.error('Invalid results format:', parsed);
      return NextResponse.json(
        { success: false, error: '誤答の形式が不正です' },
        { status: 500 }
      );
    }

    // Validate each result has 3 distractors
    const validResults = parsed.results
      .filter((r) => r.id && Array.isArray(r.distractors) && r.distractors.length === 3)
      .map((r) => ({
        wordId: r.id,
        distractors: r.distractors,
      }));

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
