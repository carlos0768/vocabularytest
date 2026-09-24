import SharedPageClient from './SharedPageClient';
import {
  listPublicSharedWordbooks as listPublicSharedProjects,
  listPublicSharedWordbookUsers as listPublicSharedUsers,
} from '@/app/api/shared-projects/shared-wordbooks';
import { readSingleLineEnv } from '@/lib/env';
import type { SharedDiscoverPayload } from '@/lib/shared-projects/types';

// 初期表示に使う公開一覧はユーザー固有のデータを含まないので、リクエストごとに
// Supabase を待たず 60 秒の ISR で配る。force-dynamic だった頃は共有タブを叩くたびに
// サーバー関数 + 2 クエリの往復を待ってから描画が始まり、遷移が固まって見えていた。
// 個別カテゴリ・検索・更新は SharedPageClient が /api/shared-projects/discover を
// cache:'no-store' で取りに行くので鮮度はそちらで担保される。
export const revalidate = 60;

export default async function SharedPage() {
  let initialDiscover: SharedDiscoverPayload = {
    category: 'all',
    users: [],
    projects: [],
    groups: [],
    nextCursor: null,
  };

  const supabaseUrl = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
  const normalizedSupabaseUrl = supabaseUrl
    ? (supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`)
    : null;

  if (normalizedSupabaseUrl && serviceRoleKey) {
    try {
      new URL(normalizedSupabaseUrl);
      const [users, projects] = await Promise.all([
        listPublicSharedUsers({ limit: 6 }),
        listPublicSharedProjects({ limit: 6 }),
      ]);
      initialDiscover = {
        category: 'all',
        users: users.users,
        projects: projects.items,
        groups: [],
        nextCursor: null,
      };
    } catch (error) {
      console.error('Failed to prerender public shared projects:', error);
    }
  }

  return (
    <SharedPageClient
      initialDiscover={initialDiscover}
    />
  );
}
