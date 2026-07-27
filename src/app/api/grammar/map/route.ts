import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';
import { buildGrammarMap } from '@/lib/grammar/map';
import { publicBankSourceIds } from '@/lib/grammar/public-bank';
import { grammarSourcesFor } from '@/lib/grammar/sources';

/**
 * GET /api/grammar/map (Pro限定)
 *
 * 文法マップ: 公開データで構成した26大単元・76小単元のノードと、
 * 公開問題バンクに対するユーザーの習得度を返す。
 *
 * ノード構成も問題も公開ソース由来なので、ユーザー自身が作った語法問題集
 * (grammar_questions) はこの集計に一切入らない。DBから読むのは
 * grammar_map_progress (本人限定RLS) だけ。
 * 帰属表示が必要な CC BY ソースも一緒に返す。
 */

// 進捗行はバンクの問題数が上限なので、余裕を持った上限を置く
const PROGRESS_FETCH_LIMIT = 5000;

type GrammarMapDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarMapDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarMapGet(
  request: NextRequest,
  deps: GrammarMapDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    // 習得度テーブルは後発のマイグレーション由来。未適用の環境でも
    // マップ自体 (公開データ) は表示できるよう、失敗しても進捗0で続行する。
    const progressResult = await auth.supabase
      .from('grammar_map_progress')
      .select('question_id,mastered')
      .eq('user_id', auth.user.id)
      .limit(PROGRESS_FETCH_LIMIT);

    if (progressResult.error) {
      console.warn('[grammar/map] progress unavailable:', progressResult.error.message);
    }

    const progress = progressResult.error
      ? []
      : ((progressResult.data ?? []) as { question_id: string; mastered: boolean }[]).map((row) => ({
        questionId: row.question_id,
        mastered: Boolean(row.mastered),
      }));

    const map = buildGrammarMap(progress);
    const sources = grammarSourcesFor(publicBankSourceIds()).map((source) => ({
      title: source.title,
      author: source.author,
      url: source.url,
      license: source.licenseLabel,
      licenseUrl: source.licenseUrl,
      modifications: source.modifications,
    }));

    return NextResponse.json({ success: true, ...map, sources });
  } catch (error) {
    console.error('[grammar/map] error:', error);
    return NextResponse.json({ success: false, error: '文法マップの取得に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleGrammarMapGet(request);
}
