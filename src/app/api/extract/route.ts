import { NextRequest, NextResponse } from 'next/server';
import { extractWordsFromImage, extractCircledWordsFromImage } from '@/lib/ai';

// Extraction modes
export type ExtractMode = 'all' | 'circled';

// API Route: POST /api/extract
// Extracts words from an uploaded image using OpenAI Vision API or Gemini API

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, isPro, mode = 'all' } = body as {
      image?: string;
      isPro?: boolean;
      mode?: ExtractMode;
    };

    if (!image) {
      return NextResponse.json(
        { success: false, error: '画像が必要です' },
        { status: 400 }
      );
    }

    // Handle different extraction modes
    if (mode === 'circled') {
      // Use Gemini API for circled word extraction
      const geminiApiKey = process.env.GOOGLE_AI_API_KEY;

      if (!geminiApiKey) {
        return NextResponse.json(
          { success: false, error: 'Gemini APIキーが設定されていません' },
          { status: 500 }
        );
      }

      const result = await extractCircledWordsFromImage(image, geminiApiKey);

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
    }

    // Default: Use OpenAI API for all word extraction
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    // Extract words using OpenAI
    // Pro users get example sentences included
    const result = await extractWordsFromImage(image, openaiApiKey, {
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
