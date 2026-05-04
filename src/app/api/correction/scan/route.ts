import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { GRAMMAR_OCR_PROMPT } from '@/lib/ai/prompts';
import { generateCorrectionPayload, countWords } from '@/lib/ai/correction-parser';
import { prepareImageForProvider } from '@/lib/ai/utils/image';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const purpose = (formData.get('purpose') as string | null)?.trim() || 'general';

    if (!image || image.size === 0) {
      return NextResponse.json({ success: false, error: '画像が必要です' }, { status: 400 });
    }

    // Convert File to base64 data URL
    const arrayBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = image.type || 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    // OCR: extract raw text from image using Gemini
    const apiKeys = getAPIKeys();
    const ocrProvider = getProviderFromConfig(AI_CONFIG.extraction.grammar.ocr, apiKeys);
    const imageForProvider = prepareImageForProvider(imageDataUrl);

    const ocrResponse = await ocrProvider.generate({
      prompt: GRAMMAR_OCR_PROMPT,
      image: imageForProvider,
      config: AI_CONFIG.extraction.grammar.ocr,
    });

    if (!ocrResponse.success) {
      return NextResponse.json({ success: false, error: '画像の読み取りに失敗しました' }, { status: 422 });
    }

    // Normalize: collapse runs of 3+ newlines to a single blank line, trim each line
    const cleaned = ocrResponse.content
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!cleaned || cleaned.length < 10) {
      return NextResponse.json({ success: false, error: '画像から英文を読み取れませんでした' }, { status: 422 });
    }

    // Truncate to correction limit
    const text = cleaned.slice(0, 600);

    // Run correction analysis
    const payload = await generateCorrectionPayload({ text, purpose });

    const { data, error } = await auth.supabase
      .from('correction_results')
      .insert({
        user_id: auth.user.id,
        input_text: text,
        purpose,
        result: payload,
        score: payload.score,
        word_count: payload.wordCount || countWords(text),
        issue_count: payload.issues.length,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[correction/scan] insert failed:', error);
      return NextResponse.json({ success: false, error: '添削結果の保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[correction/scan] failed:', err);
    return NextResponse.json({ success: false, error: '添削に失敗しました' }, { status: 500 });
  }
}
