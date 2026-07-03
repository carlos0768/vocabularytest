/**
 * Example Genre Preferences
 *
 * ユーザが設定した「好きなジャンル」（user_preferences.example_genres）を
 * 例文生成プロンプトへ反映するための共通ヘルパー。
 *
 * - 正規化（normalizeExampleGenres）はAPI/フック/プロンプトで共通利用
 * - 取得（fetchExampleGenres）はベストエフォート。失敗時は空配列を返し、
 *   例文生成自体を止めない（INV-13に準拠）
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isActiveProSubscription } from '@/lib/subscription/status';

export const MAX_EXAMPLE_GENRES = 5;
export const MAX_EXAMPLE_GENRE_LENGTH = 30;

/** よく使われるジャンルの候補（設定UIのサジェスト用） */
export const SUGGESTED_EXAMPLE_GENRES = [
  'サッカー',
  '野球',
  '映画',
  '音楽',
  'ゲーム',
  '料理',
  '旅行',
  'アニメ',
  '科学',
  'ビジネス',
] as const;

/**
 * 未知の入力（DBのjsonb、APIリクエスト等）をジャンル配列に正規化する。
 * 文字列以外・空文字・長すぎる値を除外し、重複を排除して最大件数に丸める。
 */
export function normalizeExampleGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_EXAMPLE_GENRE_LENGTH) continue;
    if (normalized.includes(trimmed)) continue;
    normalized.push(trimmed);
    if (normalized.length >= MAX_EXAMPLE_GENRES) break;
  }

  return normalized;
}

/**
 * 例文生成プロンプトに挿入するジャンル指示ブロックを組み立てる。
 * ジャンル未設定なら空文字を返す（プロンプトは変化しない）。
 * ジャンル設定時は、単語とジャンルの関係が薄くても多少強引に
 * 結びつけるよう強く指示する（汎用例文へのフォールバックはさせない）。
 */
export function buildExampleGenreGuidance(genres: readonly string[]): string {
  const normalized = normalizeExampleGenres([...genres]);
  if (normalized.length === 0) return '';

  return `【ユーザの興味ジャンル（最優先指示）】
このユーザは次のジャンルに強い興味があります: ${normalized.join('、')}
- 全ての例文を、必ずこれらのジャンルのいずれかを題材にして作成してください
- 単語とジャンルの関係が薄い場合でも、場面設定・登場人物・話題を工夫して、多少強引でも必ずジャンルと結びつけてください
- ジャンルと無関係な汎用例文は作らないでください
- ただし、単語本来の意味・用法が正しく伝わる自然な英文であることは維持してください`;
}

/**
 * user_preferences からジャンル設定を取得する（ベストエフォート）。
 * 行が無い・カラムが無い（マイグレーション未適用）・通信失敗時は空配列。
 */
export async function fetchExampleGenres(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('example_genres')
      .eq('user_id', userId)
      .maybeSingle<{ example_genres: unknown }>();

    if (error) {
      console.warn('[example-genres] Failed to fetch preferences, continuing without genres:', error.message);
      return [];
    }

    return normalizeExampleGenres(data?.example_genres);
  } catch (fetchError) {
    console.warn('[example-genres] Unexpected fetch error, continuing without genres:', fetchError);
    return [];
  }
}

/**
 * ユーザがアクティブなProかどうかを判定する（ベストエフォート）。
 * 行が無い・通信失敗時は非Pro扱いにする（ジャンル機能をフェイルクローズ）。
 */
export async function isProSubscriber(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', userId)
      .maybeSingle<{
        status: string | null;
        plan: string | null;
        pro_source: string | null;
        test_pro_expires_at: string | null;
        current_period_end: string | null;
      }>();

    if (error || !data) return false;

    return isActiveProSubscription({
      status: data.status,
      plan: data.plan,
      proSource: data.pro_source,
      testProExpiresAt: data.test_pro_expires_at,
      currentPeriodEnd: data.current_period_end,
    });
  } catch (checkError) {
    console.warn('[example-genres] Pro check failed, treating as non-Pro:', checkError);
    return false;
  }
}

/**
 * ジャンル設定は全プランで利用可能。生成系API（スキャン・例文・クイズ）
 * からは必ずこちらを使う。
 */
export async function fetchExampleGenresForProUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  return fetchExampleGenres(supabase, userId);
}
