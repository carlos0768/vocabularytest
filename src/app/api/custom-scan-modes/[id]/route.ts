import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { authenticateCustomScanModeRequest } from '@/lib/api/custom-scan-mode-auth';
import {
  CUSTOM_SCAN_MODE_SELECT,
  MAX_CUSTOM_SCAN_MODE_NAME_LENGTH,
  MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH,
  mapCustomScanModeRow,
  normalizeCustomScanModeName,
  normalizeCustomScanModePrompt,
} from '@/lib/scan/custom-modes';

// API: /api/custom-scan-modes/[id]
// 保存済みカスタム抽出モードの更新・削除。RLSに加えて user_id でも絞る。

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(5000).optional(),
}).strict().refine(
  (value) => value.name !== undefined || value.prompt !== undefined,
  { message: 'name または prompt が必要です' },
);

const uuidSchema = z.string().uuid();

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateCustomScanModeRequest(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'カスタム抽出モードが見つかりません' }, { status: 404 });
    }

    const parsed = await parseJsonWithSchema(request, updateSchema);
    if (!parsed.ok) return parsed.response;

    const updates: { name?: string; prompt?: string } = {};

    if (parsed.data.name !== undefined) {
      const name = normalizeCustomScanModeName(parsed.data.name);
      if (!name) {
        return NextResponse.json(
          { error: `モード名を${MAX_CUSTOM_SCAN_MODE_NAME_LENGTH}文字以内で入力してください` },
          { status: 400 },
        );
      }
      updates.name = name;
    }

    if (parsed.data.prompt !== undefined) {
      const prompt = normalizeCustomScanModePrompt(parsed.data.prompt);
      if (!prompt) {
        return NextResponse.json(
          { error: `抽出プロンプトを${MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH}文字以内で入力してください` },
          { status: 400 },
        );
      }
      updates.prompt = prompt;
    }

    const { data, error } = await auth.supabase
      .from('custom_scan_modes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select(CUSTOM_SCAN_MODE_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[custom-scan-modes] Update failed:', error);
      return NextResponse.json({ error: 'カスタム抽出モードの更新に失敗しました' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'カスタム抽出モードが見つかりません' }, { status: 404 });
    }

    const mode = mapCustomScanModeRow(data as Parameters<typeof mapCustomScanModeRow>[0]);
    if (!mode) {
      return NextResponse.json({ error: 'カスタム抽出モードの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode });
  } catch (error) {
    console.error('[custom-scan-modes] Unexpected update error:', error);
    return NextResponse.json({ error: 'カスタム抽出モードの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateCustomScanModeRequest(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'カスタム抽出モードが見つかりません' }, { status: 404 });
    }

    const { error } = await auth.supabase
      .from('custom_scan_modes')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId);

    if (error) {
      console.error('[custom-scan-modes] Delete failed:', error);
      return NextResponse.json({ error: 'カスタム抽出モードの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[custom-scan-modes] Unexpected delete error:', error);
    return NextResponse.json({ error: 'カスタム抽出モードの削除に失敗しました' }, { status: 500 });
  }
}
