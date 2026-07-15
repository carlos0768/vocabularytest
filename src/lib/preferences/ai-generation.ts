import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * user_preferences.ai_enabled を取得する（ベストエフォート）。
 * 行が無い・カラムが無い・通信失敗時は true（AI生成有効）扱いにする。
 *
 * スキャン確認画面のクイズprefillは ai_enabled !== false のときだけ走るため、
 * サーバー側で例文生成をprefillへ委譲してよいかの判定に使う。
 */
export async function fetchAiGenerationEnabled(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('ai_enabled')
      .eq('user_id', userId)
      .maybeSingle<{ ai_enabled: unknown }>();

    if (error) {
      console.warn('[ai-generation] Failed to fetch ai_enabled, assuming enabled:', error.message);
      return true;
    }

    return data?.ai_enabled !== false;
  } catch (fetchError) {
    console.warn('[ai-generation] Unexpected fetch error, assuming enabled:', fetchError);
    return true;
  }
}
