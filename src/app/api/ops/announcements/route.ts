import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { announcementBlocksSchema, mapAnnouncementRow } from '@/lib/announcements/blocks';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// お知らせの管理API(一覧・作成)。/ops/announcements からのみ使う想定で、
// x-admin-secret で認可し service role で読み書きする(announcements テーブルに
// 書き込みRLSポリシーは無い)。ブロックJSONはここでサーバー側再検証する。

export const dynamic = 'force-dynamic';

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    bodyBlocks: announcementBlocksSchema,
    publish: z.boolean().optional(),
  })
  .strict();

const ANNOUNCEMENT_COLUMNS = 'id,title,body_blocks,status,published_at,created_at,updated_at';

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    // 壊れた行も管理画面では見えたほうがよいので、マップ失敗はタイトルだけ残す
    const announcements = (data ?? []).map((row) =>
      mapAnnouncementRow(row) ?? {
        id: row.id,
        title: `${row.title}(本文が不正です)`,
        bodyBlocks: [{ type: 'p' as const, text: '本文のJSONがスキーマに合いません。編集し直してください。' }],
        status: row.status === 'published' ? ('published' as const) : ('draft' as const),
        publishedAt: row.published_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });

    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error('[OpsAnnouncements] list failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to list announcements' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid announcement payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title: parsed.data.title,
        body_blocks: parsed.data.bodyBlocks,
        status: parsed.data.publish ? 'published' : 'draft',
        published_at: parsed.data.publish ? now : null,
        updated_at: now,
      })
      .select(ANNOUNCEMENT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, announcement: mapAnnouncementRow(data) });
  } catch (error) {
    console.error('[OpsAnnouncements] create failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to create announcement' }, { status: 500 });
  }
}
