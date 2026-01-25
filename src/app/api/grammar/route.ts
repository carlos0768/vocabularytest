import { NextRequest, NextResponse } from 'next/server';
import { extractGrammarFromImage } from '@/lib/ai';
import type { EikenGrammarLevel } from '@/types';

// API Route: POST /api/grammar
// Extracts grammar patterns from an uploaded image using Gemini (OCR) + GPT (analysis)

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return NextResponse.json(
        { success: false, error: 'リクエストの解析に失敗しました' },
        { status: 400 }
      );
    }

    const { image, eikenLevel = null } = body as {
      image?: string;
      eikenLevel?: EikenGrammarLevel;
    };

    console.log('Grammar API called:', { eikenLevel, imageLength: image?.length });

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // Check for required API keys
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: 'Gemini APIキーが設定されていません' },
        { status: 500 }
      );
    }

    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    // Extract grammar using Gemini OCR + GPT analysis
    const result = await extractGrammarFromImage(
      image,
      geminiApiKey,
      openaiApiKey,
      eikenLevel
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      extractedText: result.extractedText,
      patterns: result.patterns,
    });
  } catch (error) {
    console.error('Grammar API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
