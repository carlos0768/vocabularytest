import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  getParaphraseDataset,
  lookupParaphraseMaterials,
  type ParaphraseLookupResult,
  type ParaphraseLookupWord,
} from '@/lib/paraphrase/server';
import type { ParaphraseDatasetSource } from '@/lib/paraphrase/dataset';

/**
 * POST /api/paraphrase/lookup
 *
 * 言い換えクイズ (英語 → 英語の同義語を選ぶ) の材料を、単語帳の語ごとに返す。
 * 材料はオープンデータ (Open English WordNet / Moby Thesaurus / Google Books Ngram 頻度表)
 * から事前生成した辞書を引くだけで、AI 呼び出しもコイン消費も DB 書き込みも無い。
 * 辞書に無い語は結果から落とすので、クライアントは「結果にある語だけ出題できる」と読む。
 *
 * ログインは必要にする —— 内容は公開データだが、誰でも叩ける同義語 API として
 * 外から使われる形は避けたい (他の出題材料の API と同じ扱い)。
 */
const requestSchema = z.object({
  words: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    english: z.string().trim().min(1).max(200),
    partOfSpeechTags: z.array(z.string().trim().max(40)).max(8).optional(),
  }).strict()).min(1).max(500),
}).strict();

export interface ParaphraseLookupDeps {
  createClient?: typeof createRouteHandlerClient;
  lookup?: (words: readonly ParaphraseLookupWord[]) => ParaphraseLookupResult[];
  sources?: () => ParaphraseDatasetSource[];
}

function getDeps(deps?: ParaphraseLookupDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    lookup: deps?.lookup ?? lookupParaphraseMaterials,
    sources: deps?.sources ?? (() => getParaphraseDataset().sources),
  };
}

export async function handleParaphraseLookupPost(request: NextRequest, deps?: ParaphraseLookupDeps) {
  try {
    const { createClient, lookup, sources } = getDeps(deps);
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { words } = parsed.data as { words: ParaphraseLookupWord[] };
    return NextResponse.json({
      success: true,
      results: lookup(words),
      sources: sources(),
    });
  } catch (error) {
    console.error('[paraphrase/lookup] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleParaphraseLookupPost(request);
}
