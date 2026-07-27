import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { authenticateCustomScanModeRequest } from '@/lib/api/custom-scan-mode-auth';
import {
  CUSTOM_SCAN_MODE_SELECT,
  MAX_CUSTOM_SCAN_MODES_PER_USER,
  MAX_CUSTOM_SCAN_MODE_NAME_LENGTH,
  MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH,
  mapCustomScanModeRow,
  normalizeCustomScanModeName,
  normalizeCustomScanModePrompt,
} from '@/lib/scan/custom-modes';

// API: /api/custom-scan-modes
// ユーザ定義の抽出プロンプト（カスタム抽出モード）の一覧取得・作成。
// RLSで本人の行しか読み書きできないが、明示的に user_id でも絞る。

const createSchema = z.object({
  name: z.string().min(1).max(200),
  prompt: z.string().min(1).max(5000),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateCustomScanModeRequest(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.supabase
      .from('custom_scan_modes')
      .select(CUSTOM_SCAN_MODE_SELECT)
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })
      .limit(MAX_CUSTOM_SCAN_MODES_PER_USER);

    if (error) {
      console.error('[custom-scan-modes] List failed:', error);
      return NextResponse.json({ error: 'カスタム抽出モードの取得に失敗しました' }, { status: 500 });
    }

    const modes = (data ?? [])
      .map((row) => mapCustomScanModeRow(row as Parameters<typeof mapCustomScanModeRow>[0]))
      .filter((mode): mode is NonNullable<typeof mode> => mode !== null);

    return NextResponse.json({ success: true, modes, limit: MAX_CUSTOM_SCAN_MODES_PER_USER });
  } catch (error) {
    console.error('[custom-scan-modes] Unexpected list error:', error);
    return NextResponse.json({ error: 'カスタム抽出モードの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCustomScanModeRequest(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, createSchema);
    if (!parsed.ok) return parsed.response;

    const name = normalizeCustomScanModeName(parsed.data.name);
    const prompt = normalizeCustomScanModePrompt(parsed.data.prompt);

    if (!name) {
      return NextResponse.json(
        { error: `モード名を${MAX_CUSTOM_SCAN_MODE_NAME_LENGTH}文字以内で入力してください` },
        { status: 400 },
      );
    }
    if (!prompt) {
      return NextResponse.json(
        { error: `抽出プロンプトを${MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH}文字以内で入力してください` },
        { status: 400 },
      );
    }

    // 上限はDBトリガでも担保しているが、先に分かりやすいエラーを返す
    const { count, error: countError } = await auth.supabase
      .from('custom_scan_modes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId);

    if (countError) {
      console.error('[custom-scan-modes] Count failed:', countError);
      return NextResponse.json({ error: 'カスタム抽出モードの保存に失敗しました' }, { status: 500 });
    }

    if ((count ?? 0) >= MAX_CUSTOM_SCAN_MODES_PER_USER) {
      return NextResponse.json(
        {
          error: `保存できるカスタム抽出モードは${MAX_CUSTOM_SCAN_MODES_PER_USER}個までです。不要なモードを削除してください。`,
        },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase
      .from('custom_scan_modes')
      .insert({ user_id: auth.userId, name, prompt })
      .select(CUSTOM_SCAN_MODE_SELECT)
      .single();

    if (error || !data) {
      console.error('[custom-scan-modes] Insert failed:', error);
      return NextResponse.json({ error: 'カスタム抽出モードの保存に失敗しました' }, { status: 500 });
    }

    const mode = mapCustomScanModeRow(data as Parameters<typeof mapCustomScanModeRow>[0]);
    if (!mode) {
      return NextResponse.json({ error: 'カスタム抽出モードの保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode }, { status: 201 });
  } catch (error) {
    console.error('[custom-scan-modes] Unexpected create error:', error);
    return NextResponse.json({ error: 'カスタム抽出モードの保存に失敗しました' }, { status: 500 });
  }
}
