import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { countWords, generateParserPayload } from '@/lib/ai/correction-parser';

const requestSchema = z.object({
  text: z.string().trim().min(10).max(1200),
  depth: z.enum(['simple', 'clause', 'tree']).default('clause'),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await requireProUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '解析する英文を10〜1200文字で入力してください',
    });
    if (!parsed.ok) return parsed.response;

    const payload = await generateParserPayload(parsed.data);
    const { data, error } = await auth.supabase
      .from('parser_results')
      .insert({
        user_id: auth.user.id,
        input_text: parsed.data.text,
        depth: parsed.data.depth,
        result: payload,
        word_count: payload.wordCount || countWords(parsed.data.text),
        clause_count: payload.clauseCount,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[parser/analyze] insert failed:', error);
      return NextResponse.json({ success: false, error: '解析結果の保存に失敗しました' }, { status: 500 });
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
    console.error('[parser/analyze] failed:', error);
    return NextResponse.json({ success: false, error: '構造解析に失敗しました' }, { status: 500 });
  }
}
