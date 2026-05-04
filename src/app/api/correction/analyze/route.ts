import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { countWords, generateCorrectionPayload } from '@/lib/ai/correction-parser';

const requestSchema = z.object({
  text: z.string().trim().min(10).max(600),
  purpose: z.string().trim().min(1).max(40).default('general'),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '添削する英文を10〜600文字で入力してください',
    });
    if (!parsed.ok) return parsed.response;

    const payload = await generateCorrectionPayload(parsed.data);
    const { data, error } = await auth.supabase
      .from('correction_results')
      .insert({
        user_id: auth.user.id,
        input_text: parsed.data.text,
        purpose: parsed.data.purpose,
        result: payload,
        score: payload.score,
        word_count: payload.wordCount || countWords(parsed.data.text),
        issue_count: payload.issues.length,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[correction/analyze] insert failed:', error);
      return NextResponse.json({ success: false, error: '添削結果の保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      result: {
        id: data.id,
        createdAt: data.created_at,
        ...payload,
      },
    });
  } catch (error) {
    console.error('[correction/analyze] failed:', error);
    return NextResponse.json({ success: false, error: '添削に失敗しました' }, { status: 500 });
  }
}
