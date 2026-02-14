import { NextRequest, NextResponse } from 'next/server';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// API Route: POST /api/translate
// Translates an English word/phrase to Japanese using AI

const TRANSLATE_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を返してください。

ルール:
- 日本語訳のみを返してください（説明不要）
- 複数の意味がある場合は最も一般的な訳を1つだけ返す
- 動詞の場合は「〜する」の形で返す
- 名詞・形容詞はそのまま返す
- フレーズの場合は自然な日本語訳を返す`;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(300),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'テキストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { text } = parsed.data;

    const openaiApiKey = process.env.OPENAI_API_KEY || '';

    const config = {
      ...AI_CONFIG.defaults.openai,
      model: 'gpt-4o-mini',
      maxOutputTokens: 256,
    };
    const provider = getProviderFromConfig(config, { openai: openaiApiKey });

    const result = await provider.generateText(
      `${TRANSLATE_PROMPT}\n\n英語: ${text}`,
      config
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 503 }
      );
    }

    const japanese = result.content?.trim();

    if (!japanese) {
      return NextResponse.json(
        { success: false, error: '翻訳に失敗しました' },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, japanese });
  } catch (error) {
    console.error('Translate error:', error);
    return NextResponse.json(
      { success: false, error: '翻訳中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
