// 保存先の単語帳の種別をDBから読むヘルパー（サーバー専用）。
//
// projects.kind は 20260911120000 で足した列なので、未適用のDBでは SELECT が
// 42703 / PGRST204 で落ちる。その場合は 'english' に倒す。列が無い＝古典対応前の
// DBなので、そこにある単語帳はすべて英語とみなして問題ない。
//
// 種別が読めないときに保存そのものを止めないこと。読めないだけでスキャンを
// 落とすと、列を足すまで全ユーザーがスキャンできなくなる。

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProjectKind, type ProjectKind } from '../../../shared/types';

function isMissingKindColumnError(error: { code?: unknown; message?: unknown } | null): boolean {
  if (!error) return false;
  const { code } = error;
  if (code !== '42703' && code !== 'PGRST204' && code !== 'PGRST200') return false;
  return `${error.message ?? ''}`.toLowerCase().includes('kind');
}

export async function readProjectKind(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectKind> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('kind')
      .eq('id', projectId)
      .maybeSingle<{ kind: string | null }>();

    if (error) {
      if (!isMissingKindColumnError(error)) {
        console.warn('[classical] Project kind lookup failed, treating as english:', error.message);
      }
      return 'english';
    }

    return normalizeProjectKind(data?.kind);
  } catch (thrown) {
    // 種別が読めないだけでスキャンを落とさない。列を足すまで全ユーザーが
    // スキャンできなくなるほうが被害が大きい。
    console.warn(
      '[classical] Project kind lookup threw, treating as english:',
      thrown instanceof Error ? thrown.message : thrown,
    );
    return 'english';
  }
}
