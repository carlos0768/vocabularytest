import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { announcementBlocksSchema, mapAnnouncementRow } from '@/lib/announcements/blocks';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// お知らせの管理API(更新・公開切替・削除)。

export const dynamic = 'force-dynamic';

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    bodyBlocks: announcementBlocksSchema.optional(),
    status: z.enum(['draft', 'published']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty update' });

const ANNOUNCEMENT_COLUMNS = 'id,title,body_blocks,status,published_at,created_at,updated_at';
const idSchema = z.string().uuid();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid announcement payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.bodyBlocks !== undefined) updates.body_blocks = parsed.data.bodyBlocks;
    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      // 公開のたびに published_at を更新する(未読判定はIDベースなので表示順にのみ影響)
      updates.published_at = parsed.data.status === 'published' ? now : null;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .update(updates)
      .eq('id', id)
      .select(ANNOUNCEMENT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, announcement: mapAnnouncementRow(data) });
  } catch (error) {
    console.error('[OpsAnnouncements] update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update announcement' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OpsAnnouncements] delete failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete announcement' }, { status: 500 });
  }
}
