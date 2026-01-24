import { NextRequest, NextResponse } from 'next/server';
import { extractWordsFromImage } from '@/lib/ai';

// API Route: POST /api/extract
// Extracts words from an uploaded image using OpenAI Vision API

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, isPro } = body as { image?: string; isPro?: boolean };

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    // Extract words using OpenAI
    // Pro users get example sentences included
    const result = await extractWordsFromImage(image, apiKey, {
      includeExamples: isPro === true,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      words: result.data.words,
    });
  } catch (error) {
    console.error('Extract API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
