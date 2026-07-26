import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_OFFICIAL_WORDBOOK_WORDS,
  OFFICIAL_WORDBOOK_COLUMNS,
  OFFICIAL_WORDBOOK_WORD_COLUMNS,
  buildOfficialWordbookMetadataUpdate,
  mapOfficialWordbookRow,
  mapOfficialWordbookWordRow,
  officialWordbookUpdateSchema,
  type OfficialWordbookWordInput,
} from '@/lib/official-wordbooks/editor';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OfficialWordbookValidationError, replaceOfficialWordbookWords } from '../shared';

// 公式単語帳の管理API(詳細取得・更新/公開切替・削除)。

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();
const PAGE_SIZE = 500;

/**
 * PostgREST は1リクエストあたりの返却行数に上限(既定1000行)があるので、
 * 単語はレンジ指定でページングして全件そろえる。
 */
async function fetchAllWords(
  supabase: SupabaseClient,
  officialWordbookId: string,
): Promise<OfficialWordbookWordInput[]> {
  const words: OfficialWordbookWordInput[] = [];

  for (let offset = 0; offset < MAX_OFFICIAL_WORDBOOK_WORDS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('official_wordbook_words')
      .select(OFFICIAL_WORDBOOK_WORD_COLUMNS)
      .eq('official_wordbook_id', officialWordbookId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    for (const row of page) {
      words.push(mapOfficialWordbookWordRow(row as unknown as Record<string, unknown>));
    }
    if (page.length < PAGE_SIZE) break;
  }

  return words;
}

export async function GET(
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
    const { data, error } = await supabase
      .from('official_wordbooks')
      .select(OFFICIAL_WORDBOOK_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Official wordbook not found' }, { status: 404 });
    }

    const words = await fetchAllWords(supabase, id);
    const wordbook = mapOfficialWordbookRow(data as Record<string, unknown>);

    return NextResponse.json({
      success: true,
      wordbook: { ...wordbook, wordCount: words.length, words },
    });
  } catch (error) {
    console.error('[OpsOfficialWordbooks] detail failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to load official wordbook' }, { status: 500 });
  }
}

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
    const parsed = officialWordbookUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid official wordbook payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { words, ...metadataInput } = parsed.data;
    const updates = buildOfficialWordbookMetadataUpdate(metadataInput);

    // 既定単語帳に昇格させるときはレベルの指定が要る。部分更新で isDefault だけ
    // 送られた場合はスキーマ側で判定できないので、保存済みのレベルを見る。
    if (updates.is_default === true && updates.eiken_level === undefined) {
      const { data: current, error: currentError } = await supabase
        .from('official_wordbooks')
        .select('eiken_level')
        .eq('id', id)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) {
        return NextResponse.json({ success: false, error: 'Official wordbook not found' }, { status: 404 });
      }
      if (!(current as { eiken_level?: string | null }).eiken_level) {
        return NextResponse.json(
          { success: false, error: '既定単語帳にするには英検レベルの指定が必要です' },
          { status: 400 },
        );
      }
    }

    let wordbookRow: Record<string, unknown> | null = null;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('official_wordbooks')
        .update(updates)
        .eq('id', id)
        .select(OFFICIAL_WORDBOOK_COLUMNS)
        .maybeSingle();
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { success: false, error: `slug「${String(updates.slug ?? '')}」は既に使われています` },
            { status: 409 },
          );
        }
        throw new Error(error.message);
      }
      if (!data) {
        return NextResponse.json({ success: false, error: 'Official wordbook not found' }, { status: 404 });
      }
      wordbookRow = data as Record<string, unknown>;
    } else {
      const { data, error } = await supabase
        .from('official_wordbooks')
        .select(OFFICIAL_WORDBOOK_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return NextResponse.json({ success: false, error: 'Official wordbook not found' }, { status: 404 });
      }
      wordbookRow = data as Record<string, unknown>;
    }

    if (words !== undefined) {
      await replaceOfficialWordbookWords(supabase, id, words);
    }

    const wordbook = mapOfficialWordbookRow(wordbookRow);
    return NextResponse.json({
      success: true,
      wordbook: { ...wordbook, ...(words !== undefined ? { wordCount: words.length } : {}) },
    });
  } catch (error) {
    if (error instanceof OfficialWordbookValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[OpsOfficialWordbooks] update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update official wordbook' }, { status: 500 });
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
    // official_wordbook_words は ON DELETE CASCADE で一緒に消える。
    // 既にユーザーへ配布済みのコピー(projects/words)は独立した行なので影響しない。
    const { error } = await supabase.from('official_wordbooks').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OpsOfficialWordbooks] delete failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete official wordbook' }, { status: 500 });
  }
}
