import type { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getSharedProjectMetrics } from '@/app/api/shared-projects/shared';
import {
  PROFILE_WORDBOOK_LIMIT,
  toProfileWordbooks,
  type ProfileWordbookList,
  type ProfileWordbookRow,
} from '@/lib/profile/wordbooks';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const COLUMNS = 'id,title,icon_image,kind';
// projects.kind より前のDBでも一覧が出るように(CLAUDE.md の schema compat と同じ考え方)
const COLUMNS_BASE = 'id,title,icon_image';

function isMissingColumn(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /schema cache|column/i.test(error.message ?? '');
}

/**
 * プロフィールに並べる単語帳の一覧(新しい順)。service role で読むので、
 * 返すのは一覧表示に要る列だけに絞る(単語の中身・共有IDは返さない)。
 */
export async function listProfileWordbooks(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<ProfileWordbookList> {
  const query = (columns: string) =>
    admin
      .from('projects')
      .select(columns, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PROFILE_WORDBOOK_LIMIT);

  let result = await query(COLUMNS);
  if (result.error && isMissingColumn(result.error)) {
    result = await query(COLUMNS_BASE);
  }
  if (result.error) throw new Error(result.error.message || 'profile_wordbooks_failed');

  const rows = (result.data ?? []) as unknown as ProfileWordbookRow[];
  const metrics = await getSharedProjectMetrics(rows.map((row) => row.id), admin);
  const wordCounts = new Map(Array.from(metrics, ([id, m]) => [id, m.wordCount]));

  return {
    items: toProfileWordbooks(rows, wordCounts),
    total: result.count ?? rows.length,
  };
}
