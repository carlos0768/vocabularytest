import { NextRequest, NextResponse } from 'next/server';
import {
  OFFICIAL_WORDBOOK_COLUMNS,
  mapOfficialWordbookRow,
  officialWordbookCreateSchema,
} from '@/lib/official-wordbooks/editor';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { OfficialWordbookValidationError, insertOfficialWordbookWords } from './shared';

// 公式単語帳の管理API(一覧・作成)。/ops/official-wordbooks からのみ使う想定で、
// x-admin-secret で認可し service role で読み書きする
// (official_wordbooks の書き込みRLSポリシーは service_role のみ)。

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    // 埋め込みカウントで単語数も一度に取る。関係名が解決できない環境では
    // カウントだけ落として一覧は表示できるようにフォールバックする。
    const withCounts = await supabase
      .from('official_wordbooks')
      .select(`${OFFICIAL_WORDBOOK_COLUMNS},official_wordbook_words(count)`)
      .order('eiken_level', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    let rows = withCounts.data as unknown as Record<string, unknown>[] | null;
    if (withCounts.error) {
      const fallback = await supabase
        .from('official_wordbooks')
        .select(OFFICIAL_WORDBOOK_COLUMNS)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (fallback.error) throw new Error(withCounts.error.message);
      rows = fallback.data as unknown as Record<string, unknown>[] | null;
    }

    const wordbooks = (rows ?? []).map((row) => mapOfficialWordbookRow(row));
    return NextResponse.json({ success: true, wordbooks });
  } catch (error) {
    console.error('[OpsOfficialWordbooks] list failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to list official wordbooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    const parsed = officialWordbookCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid official wordbook payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('official_wordbooks')
      .insert({
        slug: input.slug,
        title: input.title,
        description: input.description?.trim() ? input.description.trim() : null,
        eiken_level: input.eikenLevel ?? null,
        is_default: input.isDefault ?? false,
        // 既定は未公開。管理者が明示的に公開したときだけ配布対象になる。
        is_active: input.isActive ?? false,
        source_labels: input.sourceLabels ?? ['official'],
        icon_image: input.iconImage?.trim() ? input.iconImage.trim() : null,
        sort_order: input.sortOrder ?? 0,
      })
      .select(OFFICIAL_WORDBOOK_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: `slug「${input.slug}」は既に使われています` },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    const wordbook = mapOfficialWordbookRow(data as Record<string, unknown>);

    if (input.words && input.words.length > 0) {
      try {
        await insertOfficialWordbookWords(supabase, wordbook.id, input.words);
      } catch (wordsError) {
        // 単語が入らなかった空の単語帳を残さない。
        await supabase.from('official_wordbooks').delete().eq('id', wordbook.id);
        throw wordsError;
      }
    }

    return NextResponse.json({
      success: true,
      wordbook: { ...wordbook, wordCount: input.words?.length ?? 0 },
    });
  } catch (error) {
    if (error instanceof OfficialWordbookValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[OpsOfficialWordbooks] create failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to create official wordbook' }, { status: 500 });
  }
}
