import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

const ETYMOLOGY_PROMPT = `あなたは英語の語源に詳しい言語学者です。与えられた英単語の語源を日本語で簡潔に説明してください。

【出力ルール】
1. まずラテン語・ギリシャ語・古英語などの語源言語と原義を示す
2. 接頭辞・語根・接尾辞に分解できる場合は分解して説明する
3. 3〜4文で簡潔にまとめる
4. 覚えやすいように語源のイメージやつながりを示す

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "etymology": "語源の説明テキスト"
}`;

const requestSchema = z.object({
  wordId: z.string().uuid(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
}).strict();

export async function POST(request: NextRequest) {
  try {
    // Authentication check (Pro only)
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

    // Check Pro subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.status !== 'active' || subscription.plan !== 'pro') {
      return NextResponse.json(
        { success: false, error: 'Pro機能です' },
        { status: 403 }
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

    // Generate etymology using Gemini
    const apiKeys = getAPIKeys();
    const config = {
      ...AI_CONFIG.defaults.gemini,
      maxOutputTokens: 512,
    };
    const provider = getProviderFromConfig(config, { gemini: apiKeys.gemini, openai: apiKeys.openai });

    const result = await provider.generateText(
      `${ETYMOLOGY_PROMPT}\n\n英単語: ${english}\n日本語訳: ${japanese}\n\nこの単語の語源を説明してください。`,
      {
        ...config,
        temperature: 0.5,
        maxOutputTokens: 512,
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
        { success: false, error: '語源の生成に失敗しました' },
        { status: 500 }
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

    let aiParsed: { etymology?: string };
    try {
      aiParsed = JSON.parse(jsonContent);
    } catch {
      console.error('Failed to parse etymology AI response:', content);
      return NextResponse.json(
        { success: false, error: '応答の解析に失敗しました' },
        { status: 500 }
      );
    }

    if (!aiParsed.etymology || typeof aiParsed.etymology !== 'string') {
      return NextResponse.json(
        { success: false, error: '語源の形式が不正です' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      etymology: aiParsed.etymology,
    });
  } catch (error) {
    console.error('Etymology generation error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
