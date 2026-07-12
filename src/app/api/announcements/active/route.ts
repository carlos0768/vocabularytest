import { NextResponse } from 'next/server';
import { mapAnnouncementRow, type Announcement } from '@/lib/announcements/blocks';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 公開中のお知らせを返す公開API(認証不要)。全ユーザーのホーム表示から
// 呼ばれるが、CDNキャッシュ(s-maxage)を効かせるのでDBへの到達は
// 数分に1回程度に抑えられる。未読管理はクライアントのlocalStorageで行うため
// per-userの読み書きは発生しない。

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,body_blocks,status,published_at,created_at,updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);

    const announcements = (data ?? [])
      .map(mapAnnouncementRow)
      .filter((announcement): announcement is Announcement => announcement !== null);

    return NextResponse.json(
      { success: true, announcements },
      { headers: { 'Cache-Control': CACHE_CONTROL } },
    );
  } catch (error) {
    console.error('[Announcements] active list failed:', error);
    // ホーム表示をブロックしないため、失敗時も200で空配列を返す(短めキャッシュ)
    return NextResponse.json(
      { success: true, announcements: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } },
    );
  }
}
