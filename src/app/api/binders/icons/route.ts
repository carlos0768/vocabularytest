import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';

/**
 * バインダー（フォルダ）のアイコン画像。
 *
 * バインダーは `projects.binder` の名前だけで実体が無いので、アイコンは
 * `binder_icons` に (ユーザー, 名前) で持つ。読み書きは本人限定RLSの範囲内で
 * 完結するため、service-role は使わない。
 */

// 単語帳アイコンと同じ 160-256px JPEG の data URL を想定した上限（DB制約と同値）。
const MAX_ICON_LENGTH = 200_000;

const putSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** null で削除。 */
  iconImage: z.string().max(MAX_ICON_LENGTH).nullable(),
}).strict();

async function resolveUser(request: NextRequest) {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user } } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  return { supabase, user };
}

/** 自分の全バインダーアイコン。ホームとバインダー詳細がまとめて引く。 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('binder_icons')
      .select('name,icon_image')
      .eq('user_id', user.id);

    if (error) {
      console.error('[binders/icons] load failed:', error.message);
      return NextResponse.json({ success: false, error: 'アイコンの取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      icons: ((data ?? []) as Array<{ name: string; icon_image: string | null }>)
        .filter((row) => Boolean(row.icon_image))
        .map((row) => ({ name: row.name, iconImage: row.icon_image })),
    });
  } catch (error) {
    console.error('[binders/icons] error:', error);
    return NextResponse.json({ success: false, error: 'アイコンの取得に失敗しました' }, { status: 500 });
  }
}

/** アイコンを設定する。`iconImage: null` は削除。 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, user } = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, putSchema);
    if (!parsed.ok) return parsed.response;

    const { name, iconImage } = parsed.data;

    if (iconImage === null) {
      const { error } = await supabase
        .from('binder_icons')
        .delete()
        .eq('user_id', user.id)
        .eq('name', name);

      if (error) {
        console.error('[binders/icons] delete failed:', error.message);
        return NextResponse.json({ success: false, error: 'アイコンの削除に失敗しました' }, { status: 500 });
      }

      return NextResponse.json({ success: true, icon: null });
    }

    const { error } = await supabase
      .from('binder_icons')
      .upsert(
        [{ user_id: user.id, name, icon_image: iconImage }],
        { onConflict: 'user_id,name' },
      );

    if (error) {
      console.error('[binders/icons] save failed:', error.message);
      return NextResponse.json({ success: false, error: 'アイコンの保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, icon: { name, iconImage } });
  } catch (error) {
    console.error('[binders/icons] error:', error);
    return NextResponse.json({ success: false, error: 'アイコンの保存に失敗しました' }, { status: 500 });
  }
}
