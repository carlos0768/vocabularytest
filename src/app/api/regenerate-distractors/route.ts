import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// API Route: POST /api/regenerate-distractors
// Regenerates distractors (wrong answer choices) when a word's japanese translation is updated
// This ensures quiz questions remain valid after manual edits

const DISTRACTOR_GENERATION_PROMPT = `あなたは英語学習教材の作成者です。与えられた英単語と日本語訳に対して、クイズ用の誤答選択肢（distractors）を3つ生成してください。

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
  "distractors": ["誤答1", "誤答2", "誤答3"]
}`;

const requestSchema = z.object({
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
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
      invalidMessage: '英単語と日本語訳が必要です',
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }
    const { english, japanese } = bodyResult.data;

    // Generate distractors using provider factory (Cloud Run or direct)
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY || '';
    const config = AI_CONFIG.defaults.gemini;
    const provider = getProviderFromConfig(config, { gemini: geminiApiKey });

    const result = await provider.generateText(
      `${DISTRACTOR_GENERATION_PROMPT}\n\n英単語: ${english}\n日本語訳（正解）: ${japanese}\n\nこの単語に対する誤答選択肢を3つ生成してください。`,
      {
        ...config,
        temperature: 0.7,
        maxOutputTokens: 256,
      },
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    const content = result.content?.trim();

    if (!content) {
      return NextResponse.json(
        { success: false, error: '誤答の生成に失敗しました' },
        { status: 500 }
      );
    }

    // Extract JSON from response (Gemini may include markdown code blocks)
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    } else {
      // Try to find JSON object directly
      const jsonStartIndex = content.indexOf('{');
      const jsonEndIndex = content.lastIndexOf('}');
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        jsonContent = content.slice(jsonStartIndex, jsonEndIndex + 1);
      }
    }

    // Parse response
    let aiParsed: { distractors?: string[] };
    try {
      aiParsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse Gemini response:', content);
      return NextResponse.json(
        { success: false, error: '応答の解析に失敗しました' },
        { status: 500 }
      );
    }

    // Validate distractors
    if (!aiParsed.distractors || !Array.isArray(aiParsed.distractors) || aiParsed.distractors.length !== 3) {
      console.error('Invalid distractors format:', aiParsed);
      return NextResponse.json(
        { success: false, error: '誤答の形式が不正です' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      distractors: aiParsed.distractors,
    });
  } catch (error) {
    console.error('Regenerate distractors error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
